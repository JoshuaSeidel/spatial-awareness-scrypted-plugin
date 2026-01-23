/**
 * Tracking Engine
 * Central orchestrator for cross-camera object tracking
 */

import sdk, {
  ScryptedDevice,
  ObjectDetector,
  ObjectsDetected,
  ObjectDetectionResult,
  ScryptedInterface,
  EventListenerRegister,
  ObjectDetection,
  Camera,
  MediaObject,
} from '@scrypted/sdk';
import { CameraTopology, CameraConnection, CameraNode, CameraZoneMapping, LandmarkType, findCamera, findConnection, findConnectionsFrom, Landmark } from '../models/topology';
import {
  TrackedObject,
  ObjectSighting,
  GlobalTrackingId,
  CorrelationCandidate,
  getLastSighting,
} from '../models/tracked-object';
import {
  TrainingSession,
  TrainingSessionState,
  TrainingCameraVisit,
  TrainingTransit,
  TrainingLandmark,
  TrainingOverlap,
  TrainingStructure,
  TrainingConfig,
  TrainingStatusUpdate,
  TrainingApplicationResult,
  DEFAULT_TRAINING_CONFIG,
  createTrainingSession,
  calculateTrainingStats,
} from '../models/training';
import { TrackingState } from '../state/tracking-state';
import { AlertManager } from '../alerts/alert-manager';
import { ObjectCorrelator } from './object-correlator';
import {
  SpatialReasoningEngine,
  SpatialReasoningConfig,
  SpatialReasoningResult,
} from './spatial-reasoning';

const { systemManager } = sdk;

export interface TrackingEngineConfig {
  /** Maximum time to wait for correlation (ms) */
  correlationWindow: number;
  /** Minimum confidence for automatic correlation */
  correlationThreshold: number;
  /** Time before marking object as 'lost' */
  lostTimeout: number;
  /** Enable visual embedding matching */
  useVisualMatching: boolean;
  /** Loitering threshold - object must be visible this long before alerting (ms) */
  loiteringThreshold: number;
  /** Per-object alert cooldown (ms) */
  objectAlertCooldown: number;
  /** Minimum detection score to consider */
  minDetectionScore: number;
  /** Use LLM for enhanced descriptions */
  useLlmDescriptions: boolean;
  /** Specific LLM device IDs to use (if not set, auto-discovers all for load balancing) */
  llmDeviceIds?: string[];
  /** LLM rate limit interval (ms) - minimum time between LLM calls */
  llmDebounceInterval?: number;
  /** Whether to fall back to basic notifications when LLM is unavailable or slow */
  llmFallbackEnabled?: boolean;
  /** Timeout for LLM responses (ms) */
  llmFallbackTimeout?: number;
  /** Enable automatic transit time learning from observations */
  enableTransitTimeLearning?: boolean;
  /** Enable automatic camera connection suggestions */
  enableConnectionSuggestions?: boolean;
  /** Enable landmark learning from AI */
  enableLandmarkLearning?: boolean;
  /** Minimum confidence for landmark suggestions */
  landmarkConfidenceThreshold?: number;
}

/** Observed transit time for learning */
interface ObservedTransit {
  fromCameraId: string;
  toCameraId: string;
  transitTime: number;
  timestamp: number;
}

/** Suggested camera connection based on observed patterns */
export interface ConnectionSuggestion {
  id: string;
  fromCameraId: string;
  fromCameraName: string;
  toCameraId: string;
  toCameraName: string;
  observedTransits: ObservedTransit[];
  suggestedTransitTime: { min: number; typical: number; max: number };
  confidence: number;
  timestamp: number;
}

export class TrackingEngine {
  private topology: CameraTopology;
  private state: TrackingState;
  private alertManager: AlertManager;
  private config: TrackingEngineConfig;
  private console: Console;
  private correlator: ObjectCorrelator;
  private spatialReasoning: SpatialReasoningEngine;
  private listeners: Map<string, EventListenerRegister> = new Map();
  private pendingTimers: Map<GlobalTrackingId, NodeJS.Timeout> = new Map();
  private loiteringTimers: Map<GlobalTrackingId, NodeJS.Timeout> = new Map();
  private lostCheckInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  /** Track last alert time per object to enforce cooldown */
  private objectLastAlertTime: Map<GlobalTrackingId, number> = new Map();
  /** Callback for topology changes (e.g., landmark suggestions) */
  private onTopologyChange?: (topology: CameraTopology) => void;

  // ==================== LLM Debouncing ====================
  /** Last time LLM was called */
  private lastLlmCallTime: number = 0;
  /** Queue of pending LLM requests (we only keep latest) */
  private llmDebounceTimer: NodeJS.Timeout | null = null;

  // ==================== Transit Time Learning ====================
  /** Observed transit times for learning */
  private observedTransits: Map<string, ObservedTransit[]> = new Map();
  /** Connection suggestions based on observed patterns */
  private connectionSuggestions: Map<string, ConnectionSuggestion> = new Map();
  /** Minimum observations before suggesting a connection */
  private readonly MIN_OBSERVATIONS_FOR_SUGGESTION = 3;

  // ==================== Training Mode ====================
  /** Current training session (null if not training) */
  private trainingSession: TrainingSession | null = null;
  /** Training configuration */
  private trainingConfig: TrainingConfig = DEFAULT_TRAINING_CONFIG;
  /** Callback for training status updates */
  private onTrainingStatusUpdate?: (status: TrainingStatusUpdate) => void;

  // ==================== Snapshot Cache ====================
  /** Cached snapshots for tracked objects (for faster notifications) */
  private snapshotCache: Map<GlobalTrackingId, MediaObject> = new Map();
  /** Pending LLM description promises (started when snapshot is captured) */
  private pendingDescriptions: Map<GlobalTrackingId, Promise<SpatialReasoningResult>> = new Map();

  constructor(
    topology: CameraTopology,
    state: TrackingState,
    alertManager: AlertManager,
    config: TrackingEngineConfig,
    console: Console
  ) {
    this.topology = topology;
    this.state = state;
    this.alertManager = alertManager;
    this.config = config;
    this.console = console;
    this.correlator = new ObjectCorrelator(topology, config);

    // Initialize spatial reasoning engine
    const spatialConfig: SpatialReasoningConfig = {
      enableLlm: config.useLlmDescriptions,
      llmDeviceIds: config.llmDeviceIds,
      enableLandmarkLearning: config.enableLandmarkLearning ?? true,
      landmarkConfidenceThreshold: config.landmarkConfidenceThreshold ?? 0.7,
      contextCacheTtl: 60000, // 1 minute cache
    };
    this.spatialReasoning = new SpatialReasoningEngine(spatialConfig, console);
    this.spatialReasoning.updateTopology(topology);
  }

  /** Set callback for topology changes */
  setTopologyChangeCallback(callback: (topology: CameraTopology) => void): void {
    this.onTopologyChange = callback;
  }

  /** Start listening to all cameras in topology */
  async startTracking(): Promise<void> {
    this.console.log('Starting tracking engine...');

    // Stop any existing listeners
    await this.stopTracking();

    // Subscribe to each camera's object detection events
    for (const camera of this.topology.cameras) {
      try {
        const device = systemManager.getDeviceById<ObjectDetector>(camera.deviceId);
        if (!device) {
          this.console.warn(`Camera not found: ${camera.deviceId} (${camera.name})`);
          continue;
        }

        // Check if device has ObjectDetector interface
        if (!device.interfaces?.includes(ScryptedInterface.ObjectDetector)) {
          this.console.warn(`Camera ${camera.name} does not support object detection`);
          continue;
        }

        const listener = device.listen(ScryptedInterface.ObjectDetector, (source, details, data) => {
          this.handleDetection(camera.deviceId, camera.name, data as ObjectsDetected);
        });

        this.listeners.set(camera.deviceId, listener);
        this.console.log(`Listening to camera: ${camera.name}`);
      } catch (e) {
        this.console.error(`Failed to subscribe to camera ${camera.name}:`, e);
      }
    }

    // Start periodic check for lost objects
    this.lostCheckInterval = setInterval(() => {
      this.checkForLostObjects();
    }, 30000); // Check every 30 seconds

    this.cleanupInterval = setInterval(() => {
      this.state.cleanup();
    }, 300000); // Cleanup every 5 minutes

    this.console.log(`Tracking engine started with ${this.listeners.size} cameras`);
  }

  /** Stop all camera listeners */
  async stopTracking(): Promise<void> {
    // Remove all event listeners
    for (const [cameraId, listener] of this.listeners.entries()) {
      try {
        listener.removeListener();
      } catch (e) {
        this.console.error(`Failed to remove listener for ${cameraId}:`, e);
      }
    }
    this.listeners.clear();

    // Clear pending timers
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

    for (const timer of this.loiteringTimers.values()) {
      clearTimeout(timer);
    }
    this.loiteringTimers.clear();

    // Stop lost check interval
    if (this.lostCheckInterval) {
      clearInterval(this.lostCheckInterval);
      this.lostCheckInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.console.log('Tracking engine stopped');
  }

  /** Handle detection event from a camera */
  private async handleDetection(
    cameraId: string,
    cameraName: string,
    detected: ObjectsDetected
  ): Promise<void> {
    if (!detected.detections || detected.detections.length === 0) {
      return;
    }

    const camera = findCamera(this.topology, cameraId);
    if (!camera) {
      return;
    }

    const timestamp = detected.timestamp || Date.now();

    for (const detection of detected.detections) {
      // Skip low-confidence detections
      if (detection.score < this.config.minDetectionScore) continue;

      // If in training mode, record trainer detections
      if (this.isTrainingActive() && detection.className === 'person') {
        this.recordTrainerDetection(cameraId, detection, detection.score);
      }

      // Skip classes we're not tracking on this camera
      if (camera.trackClasses.length > 0 &&
          !camera.trackClasses.includes(detection.className)) {
        continue;
      }

      // Create sighting object
      const sighting: ObjectSighting = {
        detection,
        cameraId,
        cameraName,
        timestamp,
        confidence: detection.score,
        embedding: detection.embedding,
        detectionId: detected.detectionId,
        position: detection.boundingBox ? {
          x: (detection.boundingBox[0] + detection.boundingBox[2] / 2) / 100,
          y: (detection.boundingBox[1] + detection.boundingBox[3] / 2) / 100,
        } : undefined,
      };

      await this.processSighting(sighting, camera.isEntryPoint, camera.isExitPoint);
    }
  }

  /** Check if object passes loitering threshold */
  private passesLoiteringThreshold(tracked: TrackedObject): boolean {
    const visibleDuration = tracked.lastSeen - tracked.firstSeen;
    return visibleDuration >= this.config.loiteringThreshold;
  }

  /** Check if object is in alert cooldown */
  private isInAlertCooldown(globalId: GlobalTrackingId): boolean {
    const lastAlertTime = this.objectLastAlertTime.get(globalId);
    if (!lastAlertTime) return false;
    return (Date.now() - lastAlertTime) < this.config.objectAlertCooldown;
  }

  /** Record that we alerted for this object */
  private recordAlertTime(globalId: GlobalTrackingId): void {
    this.objectLastAlertTime.set(globalId, Date.now());
  }

  /** Check if LLM call is allowed (rate limiting) */
  private isLlmCallAllowed(): boolean {
    const debounceInterval = this.config.llmDebounceInterval || 0;
    if (debounceInterval <= 0) return true;
    const timeSinceLastCall = Date.now() - this.lastLlmCallTime;
    return timeSinceLastCall >= debounceInterval;
  }

  /** Record that an LLM call was made */
  private recordLlmCall(): void {
    this.lastLlmCallTime = Date.now();
  }

  /** Check and record LLM call - returns false if rate limited */
  private tryLlmCall(silent: boolean = false): boolean {
    if (!this.isLlmCallAllowed()) {
      // Only log once per rate limit window, not every call
      if (!silent && !this.rateLimitLogged) {
        const remaining = Math.ceil((this.config.llmDebounceInterval || 30000) - (Date.now() - this.lastLlmCallTime)) / 1000;
        this.console.log(`[LLM] Rate limited, ${remaining.toFixed(0)}s until next call allowed`);
        this.rateLimitLogged = true;
      }
      return false;
    }
    this.rateLimitLogged = false;
    this.recordLlmCall();
    return true;
  }

  /** Track if we've already logged rate limit message */
  private rateLimitLogged: boolean = false;

  /** Get spatial reasoning result for movement (uses RAG + LLM) with debouncing and fallback */
  private async getSpatialDescription(
    tracked: TrackedObject,
    fromCameraId: string,
    toCameraId: string,
    transitTime: number,
    currentCameraId: string
  ): Promise<SpatialReasoningResult | null> {
    const fallbackEnabled = this.config.llmFallbackEnabled ?? true;
    const fallbackTimeout = this.config.llmFallbackTimeout ?? 3000;

    try {
      if (!this.config.useLlmDescriptions) {
        return this.spatialReasoning.generateMovementDescription(
          tracked,
          fromCameraId,
          toCameraId,
          transitTime
        );
      }

      // Check rate limiting - if not allowed, return null to use basic description
      if (!this.tryLlmCall()) {
        this.console.log('[Movement] LLM rate-limited, using basic notification');
        return null;
      }

      // Get snapshot from camera for LLM analysis (if LLM is enabled)
      let mediaObject: MediaObject | undefined;
      const camera = systemManager.getDeviceById<Camera>(currentCameraId);
      if (camera?.interfaces?.includes(ScryptedInterface.Camera)) {
        mediaObject = await camera.takePicture();
      }

      // Use spatial reasoning engine for rich context-aware description
      // Apply timeout if fallback is enabled
      let result: SpatialReasoningResult;
      if (fallbackEnabled && mediaObject) {
        const timeoutPromise = new Promise<SpatialReasoningResult | null>((_, reject) => {
          setTimeout(() => reject(new Error('LLM timeout')), fallbackTimeout);
        });

        const descriptionPromise = this.spatialReasoning.generateMovementDescription(
          tracked,
          fromCameraId,
          toCameraId,
          transitTime,
          mediaObject
        );

        try {
          result = await Promise.race([descriptionPromise, timeoutPromise]) as SpatialReasoningResult;
        } catch (timeoutError) {
          this.console.log('LLM timed out, using basic notification');
          return null;
        }
      } else {
        result = await this.spatialReasoning.generateMovementDescription(
          tracked,
          fromCameraId,
          toCameraId,
          transitTime,
          mediaObject
        );
      }

      // Optionally trigger landmark learning (background, non-blocking)
      if (this.config.enableLandmarkLearning && mediaObject) {
        this.tryLearnLandmark(currentCameraId, mediaObject, tracked.className);
      }

      return result;
    } catch (e) {
      this.console.warn('Spatial reasoning failed:', e);
      return null;
    }
  }

  /** Try to learn new landmarks from detections (background task) */
  private async tryLearnLandmark(
    cameraId: string,
    mediaObject: MediaObject,
    objectClass: string
  ): Promise<void> {
    try {
      // Position is approximate - could be improved with object position from detection
      const position = { x: 50, y: 50 };
      const suggestion = await this.spatialReasoning.suggestLandmark(
        cameraId,
        mediaObject,
        objectClass,
        position
      );

      if (suggestion) {
        this.console.log(
          `AI suggested landmark: ${suggestion.landmark.name} ` +
          `(${suggestion.landmark.type}, confidence: ${suggestion.landmark.aiConfidence?.toFixed(2)})`
        );
      }
    } catch (e) {
      // Landmark learning is best-effort, don't log errors
    }
  }

  /** Process a single sighting */
  private async processSighting(
    sighting: ObjectSighting,
    isEntryPoint: boolean,
    isExitPoint: boolean
  ): Promise<void> {
    // Try to correlate with existing tracked objects
    const correlation = await this.correlateDetection(sighting);

    if (correlation) {
      // Matched to existing object
      const tracked = correlation.trackedObject;

      // Check if this is a cross-camera transition
      const lastSighting = getLastSighting(tracked);
      if (lastSighting && lastSighting.cameraId !== sighting.cameraId) {
        // Cancel any pending loitering alert if object already transitioned
        this.clearLoiteringTimer(tracked.globalId);
        const transitDuration = sighting.timestamp - lastSighting.timestamp;

        // Update cached snapshot from new camera (object is now visible here)
        if (this.config.useLlmDescriptions) {
          this.captureAndCacheSnapshot(tracked.globalId, sighting.cameraId).catch(e => {
            this.console.warn(`[Transition Snapshot] Failed to update snapshot: ${e}`);
          });
        }

        // Add journey segment
        this.state.addJourney(tracked.globalId, {
          fromCameraId: lastSighting.cameraId,
          fromCameraName: lastSighting.cameraName,
          toCameraId: sighting.cameraId,
          toCameraName: sighting.cameraName,
          exitTime: lastSighting.timestamp,
          entryTime: sighting.timestamp,
          transitDuration,
          correlationConfidence: correlation.confidence,
        });

        // Record for transit time learning
        this.recordObservedTransit(lastSighting.cameraId, sighting.cameraId, transitDuration);

        this.console.log(
          `Object ${tracked.globalId.slice(0, 8)} transited: ` +
          `${lastSighting.cameraName} → ${sighting.cameraName} ` +
          `(confidence: ${(correlation.confidence * 100).toFixed(0)}%)`
        );

        // Check loitering threshold and per-object cooldown before alerting
        if (this.passesLoiteringThreshold(tracked)) {
          if (this.isInAlertCooldown(tracked.globalId)) {
            const spatialResult = await this.spatialReasoning.generateMovementDescription(
              tracked,
              lastSighting.cameraId,
              sighting.cameraId,
              transitDuration
            );

            await this.alertManager.updateMovementAlert(tracked, {
              fromCameraId: lastSighting.cameraId,
              fromCameraName: lastSighting.cameraName,
              toCameraId: sighting.cameraId,
              toCameraName: sighting.cameraName,
              transitTime: transitDuration,
              objectClass: sighting.detection.className,
              objectLabel: spatialResult.description || sighting.detection.label,
              detectionId: sighting.detectionId,
              pathDescription: spatialResult.pathDescription,
              involvedLandmarks: spatialResult.involvedLandmarks?.map(l => l.name),
              usedLlm: spatialResult.usedLlm,
            });
          } else {
            // Get spatial reasoning result with RAG context
            const spatialResult = await this.getSpatialDescription(
              tracked,
              lastSighting.cameraId,
              sighting.cameraId,
              transitDuration,
              sighting.cameraId
            );

            // Generate movement alert for cross-camera transition
            const mediaObject = this.snapshotCache.get(tracked.globalId);
            await this.alertManager.checkAndAlert('movement', tracked, {
              fromCameraId: lastSighting.cameraId,
              fromCameraName: lastSighting.cameraName,
              toCameraId: sighting.cameraId,
              toCameraName: sighting.cameraName,
              transitTime: transitDuration,
              objectClass: sighting.detection.className,
              objectLabel: spatialResult?.description || sighting.detection.label,
              detectionId: sighting.detectionId,
              // Include spatial context for enriched alerts
              pathDescription: spatialResult?.pathDescription,
              involvedLandmarks: spatialResult?.involvedLandmarks?.map(l => l.name),
              usedLlm: spatialResult?.usedLlm,
            }, mediaObject);

            this.recordAlertTime(tracked.globalId);
          }
        }
      }

      // Add sighting to tracked object
      this.state.addSighting(tracked.globalId, sighting);

      // Cancel any pending lost timer
      const pendingTimer = this.pendingTimers.get(tracked.globalId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.pendingTimers.delete(tracked.globalId);
      }

      // Reactivate if was pending
      this.state.reactivate(tracked.globalId);

      // Check for exit
      if (isExitPoint && this.isLeavingFrame(sighting)) {
        this.handlePotentialExit(tracked, sighting);
      }
    } else {
      // New object - create tracking entry
      const globalId = this.state.generateId();
      const tracked = this.state.createObject(globalId, sighting, isEntryPoint);

      this.console.log(
        `New ${sighting.detection.className} detected on ${sighting.cameraName} ` +
        `(ID: ${globalId.slice(0, 8)})`
      );

      // Schedule loitering check - alert after object passes loitering threshold
      // This ensures we don't miss alerts for brief appearances while still filtering noise
      this.scheduleLoiteringAlert(globalId, sighting, isEntryPoint);
    }
  }

  /** Schedule an alert after loitering threshold passes */
  private scheduleLoiteringAlert(
    globalId: GlobalTrackingId,
    sighting: ObjectSighting,
    isEntryPoint: boolean
  ): void {
    // Capture snapshot IMMEDIATELY when object is first detected (don't wait for loitering threshold)
    // This ensures we have a good image while the person/object is still in frame
    if (this.config.useLlmDescriptions) {
      this.captureAndCacheSnapshot(globalId, sighting.cameraId).catch(e => {
        this.console.warn(`[Snapshot] Failed to cache initial snapshot: ${e}`);
      });
    }

    // Check after loitering threshold if object is still being tracked
    const existing = this.loiteringTimers.get(globalId);
    if (existing) {
      clearTimeout(existing);
      this.loiteringTimers.delete(globalId);
    }

    const timer = setTimeout(async () => {
      try {
        const tracked = this.state.getObject(globalId);
        if (!tracked || tracked.state !== 'active') return;

        const lastSighting = getLastSighting(tracked);
        if (!lastSighting || lastSighting.cameraId !== sighting.cameraId) {
          return;
        }

        const maxStaleMs = Math.max(10000, this.config.loiteringThreshold * 2);
        if (Date.now() - lastSighting.timestamp > maxStaleMs) {
          return;
        }

        // Check if we've already alerted for this object
        if (this.isInAlertCooldown(globalId)) {
          const spatialResult = await this.spatialReasoning.generateEntryDescription(tracked, sighting.cameraId);
          await this.alertManager.updateMovementAlert(tracked, {
            cameraId: sighting.cameraId,
            cameraName: sighting.cameraName,
            toCameraId: sighting.cameraId,
            toCameraName: sighting.cameraName,
            objectClass: sighting.detection.className,
            objectLabel: spatialResult.description,
            detectionId: sighting.detectionId,
            involvedLandmarks: spatialResult.involvedLandmarks?.map(l => l.name),
            usedLlm: spatialResult.usedLlm,
          });
          return;
        }

      // Use prefetched LLM result if available (started when snapshot was captured)
      let spatialResult: SpatialReasoningResult;
      const pendingDescription = this.pendingDescriptions.get(globalId);

        if (pendingDescription) {
        this.console.log(`[Entry Alert] Using prefetched LLM result for ${globalId.slice(0, 8)}`);
        try {
          spatialResult = await pendingDescription;
          this.console.log(`[Entry Alert] Prefetch result: "${spatialResult.description.substring(0, 60)}...", usedLlm=${spatialResult.usedLlm}`);
        } catch (e) {
          this.console.warn(`[Entry Alert] Prefetch failed, using basic description: ${e}`);
          // Don't make another LLM call - use basic description (no mediaObject = no LLM)
          spatialResult = await this.spatialReasoning.generateEntryDescription(tracked, sighting.cameraId);
        }
        this.pendingDescriptions.delete(globalId);
        } else {
        // No prefetch available - only call LLM if rate limit allows
        if (this.tryLlmCall()) {
          this.console.log(`[Entry Alert] No prefetch, generating with LLM`);
          const mediaObject = this.snapshotCache.get(globalId);
          spatialResult = await this.spatialReasoning.generateEntryDescription(tracked, sighting.cameraId, mediaObject);
          this.console.log(`[Entry Alert] Got description: "${spatialResult.description.substring(0, 60)}...", usedLlm=${spatialResult.usedLlm}`);
        } else {
          // Rate limited - use basic description (no LLM)
          this.console.log(`[Entry Alert] Rate limited, using basic description`);
          spatialResult = await this.spatialReasoning.generateEntryDescription(tracked, sighting.cameraId);
        }
      }

      // Always use movement alert type for smart notifications with LLM descriptions
      // The property_entry/property_exit types are legacy and disabled by default
        const mediaObject = this.snapshotCache.get(globalId);
        await this.alertManager.checkAndAlert('movement', tracked, {
        cameraId: sighting.cameraId,
        cameraName: sighting.cameraName,
        toCameraId: sighting.cameraId,
        toCameraName: sighting.cameraName,
        objectClass: sighting.detection.className,
        objectLabel: spatialResult.description, // Smart LLM-generated description
        detectionId: sighting.detectionId,
        involvedLandmarks: spatialResult.involvedLandmarks?.map(l => l.name),
        usedLlm: spatialResult.usedLlm,
        }, mediaObject);

        this.recordAlertTime(globalId);
      } finally {
        this.loiteringTimers.delete(globalId);
      }
    }, this.config.loiteringThreshold);

    this.loiteringTimers.set(globalId, timer);
  }

  /** Capture and cache a snapshot for a tracked object, and start LLM analysis immediately */
  private async captureAndCacheSnapshot(
    globalId: GlobalTrackingId,
    cameraId: string,
    eventType: 'entry' | 'exit' | 'movement' = 'entry'
  ): Promise<void> {
    // Skip if we already have a recent snapshot for this object (within 5 seconds)
    const existingSnapshot = this.snapshotCache.get(globalId);
    if (existingSnapshot && eventType !== 'exit') {
      // For entry/movement, we can reuse existing snapshot
      // For exit, we want a fresh snapshot while they're still visible
      return;
    }

    try {
      const camera = systemManager.getDeviceById<Camera>(cameraId);
      if (camera?.interfaces?.includes(ScryptedInterface.Camera)) {
        const mediaObject = await camera.takePicture();
        if (mediaObject) {
          this.snapshotCache.set(globalId, mediaObject);

          // Start LLM analysis immediately in parallel (don't await) - but respect rate limits
          const tracked = this.state.getObject(globalId);
          if (tracked && this.config.useLlmDescriptions && this.tryLlmCall()) {
            const descriptionPromise = eventType === 'exit'
              ? this.spatialReasoning.generateExitDescription(tracked, cameraId, mediaObject)
              : this.spatialReasoning.generateEntryDescription(tracked, cameraId, mediaObject);

            this.pendingDescriptions.set(globalId, descriptionPromise);

            // Log when complete (but don't spam logs)
            descriptionPromise.catch(e => {
              this.console.warn(`[LLM Prefetch] Failed for ${globalId.slice(0, 8)}: ${e}`);
            });
          }
        }
      }
    } catch (e) {
      this.console.warn(`[Snapshot] Failed to capture snapshot: ${e}`);
    }
  }

  /** Attempt to correlate a sighting with existing tracked objects */
  private async correlateDetection(
    sighting: ObjectSighting
  ): Promise<CorrelationCandidate | null> {
    const activeObjects = this.state.getActiveObjects();
    if (activeObjects.length === 0) return null;

    // First, check for same-camera tracking (using detection ID)
    for (const tracked of activeObjects) {
      const lastSighting = getLastSighting(tracked);
      if (lastSighting &&
          lastSighting.cameraId === sighting.cameraId &&
          lastSighting.detection.id === sighting.detection.id) {
        // Same object on same camera (continuing track)
        return {
          trackedObject: tracked,
          newSighting: sighting,
          confidence: 1.0,
          factors: { timing: 1, visual: 1, spatial: 1, class: 1 },
        };
      }
    }

    // Check for cross-camera correlation
    const candidate = await this.correlator.findBestMatch(sighting, activeObjects);
    return candidate;
  }

  /** Check if a detection is leaving the camera frame */
  private isLeavingFrame(sighting: ObjectSighting): boolean {
    if (!sighting.position) return false;

    // Consider leaving if near edge of frame
    const edgeThreshold = 0.1; // 10% from edge
    return (
      sighting.position.x < edgeThreshold ||
      sighting.position.x > (1 - edgeThreshold) ||
      sighting.position.y < edgeThreshold ||
      sighting.position.y > (1 - edgeThreshold)
    );
  }

  /** Handle potential exit from property */
  private handlePotentialExit(tracked: TrackedObject, sighting: ObjectSighting): void {
    // Mark as pending and set timer
    this.state.markPending(tracked.globalId);

    // Cancel any pending loitering alert
    this.clearLoiteringTimer(tracked.globalId);

    // Capture a fresh snapshot now while object is still visible (before they leave)
    // Also starts LLM analysis immediately in parallel
    if (this.config.useLlmDescriptions) {
      this.captureAndCacheSnapshot(tracked.globalId, sighting.cameraId, 'exit').catch(e => {
        this.console.warn(`[Exit Snapshot] Failed to update snapshot: ${e}`);
      });
    }

    // Wait for correlation window before marking as exited
    const timer = setTimeout(async () => {
      const current = this.state.getObject(tracked.globalId);
      if (current && current.state === 'pending') {
        this.state.markExited(tracked.globalId, sighting.cameraId, sighting.cameraName);

        // Use prefetched LLM result if available (started when exit was first detected)
        let spatialResult: SpatialReasoningResult;
        const pendingDescription = this.pendingDescriptions.get(tracked.globalId);

        if (pendingDescription) {
          this.console.log(`[Exit Alert] Using prefetched LLM result for ${tracked.globalId.slice(0, 8)}`);
          try {
            spatialResult = await pendingDescription;
            this.console.log(`[Exit Alert] Prefetch result: "${spatialResult.description.substring(0, 60)}...", usedLlm=${spatialResult.usedLlm}`);
          } catch (e) {
            this.console.warn(`[Exit Alert] Prefetch failed, using basic description: ${e}`);
            // Don't make another LLM call - use basic description
            spatialResult = await this.spatialReasoning.generateExitDescription(current, sighting.cameraId);
          }
          this.pendingDescriptions.delete(tracked.globalId);
        } else {
          // No prefetch available - only call LLM if rate limit allows
          if (this.tryLlmCall()) {
            this.console.log(`[Exit Alert] No prefetch, generating with LLM`);
            const mediaObject = this.snapshotCache.get(tracked.globalId);
            spatialResult = await this.spatialReasoning.generateExitDescription(current, sighting.cameraId, mediaObject);
            this.console.log(`[Exit Alert] Got description: "${spatialResult.description.substring(0, 60)}...", usedLlm=${spatialResult.usedLlm}`);
          } else {
            // Rate limited - use basic description (no LLM)
            this.console.log(`[Exit Alert] Rate limited, using basic description`);
            spatialResult = await this.spatialReasoning.generateExitDescription(current, sighting.cameraId);
          }
        }

        // Use movement alert for exit too - smart notifications with LLM descriptions
        const mediaObject = this.snapshotCache.get(tracked.globalId);
        await this.alertManager.checkAndAlert('movement', current, {
          cameraId: sighting.cameraId,
          cameraName: sighting.cameraName,
          toCameraId: sighting.cameraId,
          toCameraName: sighting.cameraName,
          objectClass: current.className,
          objectLabel: spatialResult.description,
          involvedLandmarks: spatialResult.involvedLandmarks?.map(l => l.name),
          usedLlm: spatialResult.usedLlm,
        }, mediaObject);

        this.alertManager.clearActiveAlertsForObject(tracked.globalId);

        // Clean up cached snapshot and pending descriptions after exit alert
        this.snapshotCache.delete(tracked.globalId);
        this.pendingDescriptions.delete(tracked.globalId);
      }
      this.pendingTimers.delete(tracked.globalId);
    }, this.config.correlationWindow);

    this.pendingTimers.set(tracked.globalId, timer);
  }

  /** Check for objects that haven't been seen recently */
  private checkForLostObjects(): void {
    const now = Date.now();
    const activeObjects = this.state.getActiveObjects();

    for (const tracked of activeObjects) {
      const timeSinceSeen = now - tracked.lastSeen;

      if (timeSinceSeen > this.config.lostTimeout) {
        this.state.markLost(tracked.globalId);
        this.clearLoiteringTimer(tracked.globalId);
        this.console.log(
          `Object ${tracked.globalId.slice(0, 8)} marked as lost ` +
          `(not seen for ${Math.round(timeSinceSeen / 1000)}s)`
        );

        // Clean up cached snapshot and pending descriptions
        this.snapshotCache.delete(tracked.globalId);
        this.pendingDescriptions.delete(tracked.globalId);

        this.alertManager.checkAndAlert('lost_tracking', tracked, {
          objectClass: tracked.className,
          objectLabel: tracked.label,
        });

        this.alertManager.clearActiveAlertsForObject(tracked.globalId);
      }
    }
  }

  /** Clear a pending loitering timer if present */
  private clearLoiteringTimer(globalId: GlobalTrackingId): void {
    const timer = this.loiteringTimers.get(globalId);
    if (timer) {
      clearTimeout(timer);
      this.loiteringTimers.delete(globalId);
    }
  }

  /** Update topology configuration */
  updateTopology(topology: CameraTopology): void {
    this.topology = topology;
    this.correlator = new ObjectCorrelator(topology, this.config);
    this.spatialReasoning.updateTopology(topology);
  }

  /** Get pending landmark suggestions */
  getPendingLandmarkSuggestions(): import('../models/topology').LandmarkSuggestion[] {
    return this.spatialReasoning.getPendingSuggestions();
  }

  /** Accept a landmark suggestion, adding it to topology */
  acceptLandmarkSuggestion(suggestionId: string): Landmark | null {
    const landmark = this.spatialReasoning.acceptSuggestion(suggestionId);
    if (landmark && this.topology) {
      // Add the accepted landmark to topology
      if (!this.topology.landmarks) {
        this.topology.landmarks = [];
      }
      this.topology.landmarks.push(landmark);

      // Notify about topology change
      if (this.onTopologyChange) {
        this.onTopologyChange(this.topology);
      }
    }
    return landmark;
  }

  /** Reject a landmark suggestion */
  rejectLandmarkSuggestion(suggestionId: string): boolean {
    return this.spatialReasoning.rejectSuggestion(suggestionId);
  }

  /** Get landmark templates for UI */
  getLandmarkTemplates(): typeof import('../models/topology').LANDMARK_TEMPLATES {
    return this.spatialReasoning.getLandmarkTemplates();
  }

  /** Get the spatial reasoning engine for direct access */
  getSpatialReasoningEngine(): SpatialReasoningEngine {
    return this.spatialReasoning;
  }

  /** Get current topology */
  getTopology(): CameraTopology {
    return this.topology;
  }

  /** Get all currently tracked objects */
  getTrackedObjects(): TrackedObject[] {
    return this.state.getAllObjects();
  }

  /** Get tracked object by ID */
  getTrackedObject(globalId: GlobalTrackingId): TrackedObject | undefined {
    return this.state.getObject(globalId);
  }

  // ==================== Transit Time Learning ====================

  /** Record an observed transit time for learning */
  private recordObservedTransit(
    fromCameraId: string,
    toCameraId: string,
    transitTime: number
  ): void {
    if (!this.config.enableTransitTimeLearning) return;

    const key = `${fromCameraId}->${toCameraId}`;
    const observation: ObservedTransit = {
      fromCameraId,
      toCameraId,
      transitTime,
      timestamp: Date.now(),
    };

    // Add to observations
    if (!this.observedTransits.has(key)) {
      this.observedTransits.set(key, []);
    }
    const observations = this.observedTransits.get(key)!;
    observations.push(observation);

    // Keep only last 100 observations per connection
    if (observations.length > 100) {
      observations.shift();
    }

    // Check if we should update existing connection
    const existingConnection = findConnection(this.topology, fromCameraId, toCameraId);
    if (existingConnection) {
      this.maybeUpdateConnectionTransitTime(existingConnection, observations);
    } else if (this.config.enableConnectionSuggestions) {
      // No existing connection - suggest one
      this.maybeCreateConnectionSuggestion(fromCameraId, toCameraId, observations);
    }
  }

  /** Update an existing connection's transit time based on observations */
  private maybeUpdateConnectionTransitTime(
    connection: CameraConnection,
    observations: ObservedTransit[]
  ): void {
    if (observations.length < 5) return; // Need minimum observations

    const times = observations.map(o => o.transitTime).sort((a, b) => a - b);

    // Calculate percentiles
    const newMin = times[Math.floor(times.length * 0.1)];
    const newTypical = times[Math.floor(times.length * 0.5)];
    const newMax = times[Math.floor(times.length * 0.9)];

    // Only update if significantly different (>20% change)
    const currentTypical = connection.transitTime.typical;
    const percentChange = Math.abs(newTypical - currentTypical) / currentTypical;

    if (percentChange > 0.2 && observations.length >= 10) {
      this.console.log(
        `Updating transit time for ${connection.name}: ` +
        `${Math.round(currentTypical / 1000)}s → ${Math.round(newTypical / 1000)}s (based on ${observations.length} observations)`
      );

      connection.transitTime = {
        min: newMin,
        typical: newTypical,
        max: newMax,
      };

      // Notify about topology change
      if (this.onTopologyChange) {
        this.onTopologyChange(this.topology);
      }
    }
  }

  /** Create or update a connection suggestion based on observations */
  private maybeCreateConnectionSuggestion(
    fromCameraId: string,
    toCameraId: string,
    observations: ObservedTransit[]
  ): void {
    if (observations.length < this.MIN_OBSERVATIONS_FOR_SUGGESTION) return;

    const fromCamera = findCamera(this.topology, fromCameraId);
    const toCamera = findCamera(this.topology, toCameraId);
    if (!fromCamera || !toCamera) return;

    const key = `${fromCameraId}->${toCameraId}`;
    const times = observations.map(o => o.transitTime).sort((a, b) => a - b);

    // Calculate transit time suggestion
    const suggestedMin = times[Math.floor(times.length * 0.1)] || times[0];
    const suggestedTypical = times[Math.floor(times.length * 0.5)] || times[0];
    const suggestedMax = times[Math.floor(times.length * 0.9)] || times[times.length - 1];

    // Calculate confidence based on consistency and count
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgTime;

    // Higher confidence with more observations and lower variance
    const countFactor = Math.min(observations.length / 10, 1);
    const consistencyFactor = Math.max(0, 1 - coefficientOfVariation);
    const confidence = (countFactor * 0.6 + consistencyFactor * 0.4);

    const suggestion: ConnectionSuggestion = {
      id: `suggest_${key}`,
      fromCameraId,
      fromCameraName: fromCamera.name,
      toCameraId,
      toCameraName: toCamera.name,
      observedTransits: observations.slice(-10), // Keep last 10
      suggestedTransitTime: {
        min: suggestedMin,
        typical: suggestedTypical,
        max: suggestedMax,
      },
      confidence,
      timestamp: Date.now(),
    };

    this.connectionSuggestions.set(key, suggestion);

    if (observations.length === this.MIN_OBSERVATIONS_FOR_SUGGESTION) {
      this.console.log(
        `New connection suggested: ${fromCamera.name} → ${toCamera.name} ` +
        `(typical: ${Math.round(suggestedTypical / 1000)}s, confidence: ${Math.round(confidence * 100)}%)`
      );
    }
  }

  /** Get pending connection suggestions */
  getConnectionSuggestions(): ConnectionSuggestion[] {
    return Array.from(this.connectionSuggestions.values())
      .filter(s => s.confidence >= 0.5) // Only suggest with reasonable confidence
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Accept a connection suggestion, adding it to topology */
  acceptConnectionSuggestion(suggestionId: string): CameraConnection | null {
    const key = suggestionId.replace('suggest_', '');
    const suggestion = this.connectionSuggestions.get(key);
    if (!suggestion) return null;

    const fromCamera = findCamera(this.topology, suggestion.fromCameraId);
    const toCamera = findCamera(this.topology, suggestion.toCameraId);
    if (!fromCamera || !toCamera) return null;

    const connection: CameraConnection = {
      id: `conn-${Date.now()}`,
      fromCameraId: suggestion.fromCameraId,
      toCameraId: suggestion.toCameraId,
      name: `${fromCamera.name} to ${toCamera.name}`,
      exitZone: [],
      entryZone: [],
      transitTime: suggestion.suggestedTransitTime,
      bidirectional: true, // Default to bidirectional
    };

    this.topology.connections.push(connection);
    this.connectionSuggestions.delete(key);

    // Notify about topology change
    if (this.onTopologyChange) {
      this.onTopologyChange(this.topology);
    }

    this.console.log(`Connection accepted: ${connection.name}`);
    return connection;
  }

  /** Reject a connection suggestion */
  rejectConnectionSuggestion(suggestionId: string): boolean {
    const key = suggestionId.replace('suggest_', '');
    if (!this.connectionSuggestions.has(key)) return false;
    this.connectionSuggestions.delete(key);
    // Also clear observations so it doesn't get re-suggested immediately
    this.observedTransits.delete(key);
    return true;
  }

  // ==================== Live Tracking State ====================

  /** Get current state of all tracked objects for live overlay */
  getLiveTrackingState(): {
    objects: Array<{
      globalId: string;
      className: string;
      label?: string;
      lastCameraId: string;
      lastCameraName: string;
      lastSeen: number;
      state: string;
      cameraPosition?: { x: number; y: number };
    }>;
    timestamp: number;
  } {
    const activeObjects = this.state.getActiveObjects();
    const objects = activeObjects.map(tracked => {
      const lastSighting = getLastSighting(tracked);
      const camera = lastSighting ? findCamera(this.topology, lastSighting.cameraId) : null;

      return {
        globalId: tracked.globalId,
        className: tracked.className,
        label: tracked.label,
        lastCameraId: lastSighting?.cameraId || '',
        lastCameraName: lastSighting?.cameraName || '',
        lastSeen: tracked.lastSeen,
        state: tracked.state,
        cameraPosition: camera?.floorPlanPosition,
      };
    });

    return {
      objects,
      timestamp: Date.now(),
    };
  }

  /** Get journey path for visualization */
  getJourneyPath(globalId: GlobalTrackingId): {
    segments: Array<{
      fromCamera: { id: string; name: string; position?: { x: number; y: number } };
      toCamera: { id: string; name: string; position?: { x: number; y: number } };
      transitTime: number;
      timestamp: number;
    }>;
    currentLocation?: { cameraId: string; cameraName: string; position?: { x: number; y: number } };
  } | null {
    const tracked = this.state.getObject(globalId);
    if (!tracked) return null;

    const segments = tracked.journey.map(j => {
      const fromCamera = findCamera(this.topology, j.fromCameraId);
      const toCamera = findCamera(this.topology, j.toCameraId);

      return {
        fromCamera: {
          id: j.fromCameraId,
          name: j.fromCameraName,
          position: fromCamera?.floorPlanPosition,
        },
        toCamera: {
          id: j.toCameraId,
          name: j.toCameraName,
          position: toCamera?.floorPlanPosition,
        },
        transitTime: j.transitDuration,
        timestamp: j.entryTime,
      };
    });

    const lastSighting = getLastSighting(tracked);
    let currentLocation;
    if (lastSighting) {
      const camera = findCamera(this.topology, lastSighting.cameraId);
      currentLocation = {
        cameraId: lastSighting.cameraId,
        cameraName: lastSighting.cameraName,
        position: camera?.floorPlanPosition,
      };
    }

    return { segments, currentLocation };
  }

  // ==================== Training Mode Methods ====================

  /** Set callback for training status updates */
  setTrainingStatusCallback(callback: (status: TrainingStatusUpdate) => void): void {
    this.onTrainingStatusUpdate = callback;
  }

  /** Get current training session (if any) */
  getTrainingSession(): TrainingSession | null {
    return this.trainingSession;
  }

  /** Check if training mode is active */
  isTrainingActive(): boolean {
    return this.trainingSession !== null && this.trainingSession.state === 'active';
  }

  /** Start a new training session */
  startTrainingSession(trainerName?: string, config?: Partial<TrainingConfig>): TrainingSession {
    // End any existing session
    if (this.trainingSession && this.trainingSession.state === 'active') {
      this.endTrainingSession();
    }

    // Apply custom config
    if (config) {
      this.trainingConfig = { ...DEFAULT_TRAINING_CONFIG, ...config };
    }

    // Create new session
    this.trainingSession = createTrainingSession(trainerName);
    this.trainingSession.state = 'active';
    this.console.log(`Training session started: ${this.trainingSession.id}`);

    this.emitTrainingStatus();
    return this.trainingSession;
  }

  /** Pause the current training session */
  pauseTrainingSession(): boolean {
    if (!this.trainingSession || this.trainingSession.state !== 'active') {
      return false;
    }

    this.trainingSession.state = 'paused';
    this.trainingSession.updatedAt = Date.now();
    this.console.log('Training session paused');
    this.emitTrainingStatus();
    return true;
  }

  /** Resume a paused training session */
  resumeTrainingSession(): boolean {
    if (!this.trainingSession || this.trainingSession.state !== 'paused') {
      return false;
    }

    this.trainingSession.state = 'active';
    this.trainingSession.updatedAt = Date.now();
    this.console.log('Training session resumed');
    this.emitTrainingStatus();
    return true;
  }

  /** End the current training session */
  endTrainingSession(): TrainingSession | null {
    if (!this.trainingSession) {
      return null;
    }

    this.trainingSession.state = 'completed';
    this.trainingSession.completedAt = Date.now();
    this.trainingSession.updatedAt = Date.now();
    this.trainingSession.stats = calculateTrainingStats(
      this.trainingSession,
      this.topology.cameras.length
    );

    this.console.log(
      `Training session completed: ${this.trainingSession.stats.camerasVisited} cameras, ` +
      `${this.trainingSession.stats.transitsRecorded} transits, ` +
      `${this.trainingSession.stats.landmarksMarked} landmarks`
    );

    const session = this.trainingSession;
    this.emitTrainingStatus();
    return session;
  }

  /** Record that trainer was detected on a camera */
  recordTrainerDetection(
    cameraId: string,
    detection: ObjectDetectionResult,
    detectionConfidence: number
  ): void {
    if (!this.trainingSession || this.trainingSession.state !== 'active') {
      return;
    }

    // Only process person detections during training
    if (detection.className !== 'person') {
      return;
    }

    // Check confidence threshold
    if (detectionConfidence < this.trainingConfig.minDetectionConfidence) {
      return;
    }

    const camera = findCamera(this.topology, cameraId);
    const cameraName = camera?.name || cameraId;
    const now = Date.now();

    // Check if this is a new camera or same camera
    if (this.trainingSession.currentCameraId === cameraId) {
      // Update existing visit
      const currentVisit = this.trainingSession.visits.find(
        v => v.cameraId === cameraId && v.departedAt === null
      );
      if (currentVisit) {
        currentVisit.detectionConfidence = Math.max(currentVisit.detectionConfidence, detectionConfidence);
        if (detection.boundingBox) {
          currentVisit.boundingBox = detection.boundingBox;
        }
      }
    } else {
      // This is a new camera - check for transition
      if (this.trainingSession.currentCameraId && this.trainingSession.transitStartTime) {
        // Complete the transit
        const transitDuration = now - this.trainingSession.transitStartTime;
        const fromCameraId = this.trainingSession.previousCameraId || this.trainingSession.currentCameraId;
        const fromCamera = findCamera(this.topology, fromCameraId);

        // Mark departure from previous camera
        const prevVisit = this.trainingSession.visits.find(
          v => v.cameraId === fromCameraId && v.departedAt === null
        );
        if (prevVisit) {
          prevVisit.departedAt = this.trainingSession.transitStartTime;
        }

        // Check for overlap (both cameras detecting at same time)
        const hasOverlap = this.checkTrainingOverlap(fromCameraId, cameraId, now);

        // Record the transit
        const transit: TrainingTransit = {
          id: `transit-${now}`,
          fromCameraId,
          toCameraId: cameraId,
          startTime: this.trainingSession.transitStartTime,
          endTime: now,
          transitSeconds: Math.round(transitDuration / 1000),
          hasOverlap,
        };
        this.trainingSession.transits.push(transit);

        this.console.log(
          `Training transit: ${fromCamera?.name || fromCameraId} → ${cameraName} ` +
          `(${transit.transitSeconds}s${hasOverlap ? ', overlap detected' : ''})`
        );

        // If overlap detected, record it
        if (hasOverlap && this.trainingConfig.autoDetectOverlaps) {
          this.recordTrainingOverlap(fromCameraId, cameraId);
        }
      }

      // Record new camera visit
      const visit: TrainingCameraVisit = {
        cameraId,
        cameraName,
        arrivedAt: now,
        departedAt: null,
        trainerEmbedding: detection.embedding,
        detectionConfidence,
        boundingBox: detection.boundingBox,
        floorPlanPosition: camera?.floorPlanPosition,
      };
      this.trainingSession.visits.push(visit);

      // Update session state
      this.trainingSession.previousCameraId = this.trainingSession.currentCameraId;
      this.trainingSession.currentCameraId = cameraId;
      this.trainingSession.transitStartTime = now;

      // Store trainer embedding if not already captured
      if (!this.trainingSession.trainerEmbedding && detection.embedding) {
        this.trainingSession.trainerEmbedding = detection.embedding;
      }
    }

    this.trainingSession.updatedAt = now;
    this.trainingSession.stats = calculateTrainingStats(
      this.trainingSession,
      this.topology.cameras.length
    );
    this.emitTrainingStatus();
  }

  /** Check if there's overlap between two cameras during training */
  private checkTrainingOverlap(fromCameraId: string, toCameraId: string, now: number): boolean {
    // Check if both cameras have recent visits overlapping in time
    const fromVisit = this.trainingSession?.visits.find(
      v => v.cameraId === fromCameraId &&
           (v.departedAt === null || v.departedAt > now - 5000) // Within 5 seconds
    );
    const toVisit = this.trainingSession?.visits.find(
      v => v.cameraId === toCameraId &&
           v.arrivedAt <= now &&
           v.arrivedAt >= now - 5000 // Arrived within last 5 seconds
    );

    return !!(fromVisit && toVisit);
  }

  /** Record a camera overlap detected during training */
  private recordTrainingOverlap(camera1Id: string, camera2Id: string): void {
    if (!this.trainingSession) return;

    // Check if we already have this overlap
    const existingOverlap = this.trainingSession.overlaps.find(
      o => (o.camera1Id === camera1Id && o.camera2Id === camera2Id) ||
           (o.camera1Id === camera2Id && o.camera2Id === camera1Id)
    );
    if (existingOverlap) return;

    const camera1 = findCamera(this.topology, camera1Id);
    const camera2 = findCamera(this.topology, camera2Id);

    // Calculate approximate position (midpoint of both camera positions)
    let position = { x: 50, y: 50 };
    if (camera1?.floorPlanPosition && camera2?.floorPlanPosition) {
      position = {
        x: (camera1.floorPlanPosition.x + camera2.floorPlanPosition.x) / 2,
        y: (camera1.floorPlanPosition.y + camera2.floorPlanPosition.y) / 2,
      };
    }

    const overlap: TrainingOverlap = {
      id: `overlap-${Date.now()}`,
      camera1Id,
      camera2Id,
      position,
      radius: 30, // Default radius
      markedAt: Date.now(),
    };
    this.trainingSession.overlaps.push(overlap);

    this.console.log(`Camera overlap detected: ${camera1?.name} ↔ ${camera2?.name}`);
  }

  /** Manually mark a landmark during training */
  markTrainingLandmark(landmark: Omit<TrainingLandmark, 'id' | 'markedAt'>): TrainingLandmark | null {
    if (!this.trainingSession) return null;

    const newLandmark: TrainingLandmark = {
      ...landmark,
      id: `landmark-${Date.now()}`,
      markedAt: Date.now(),
    };
    this.trainingSession.landmarks.push(newLandmark);
    this.trainingSession.updatedAt = Date.now();
    this.trainingSession.stats = calculateTrainingStats(
      this.trainingSession,
      this.topology.cameras.length
    );

    this.console.log(`Landmark marked: ${newLandmark.name} (${newLandmark.type})`);
    this.emitTrainingStatus();
    return newLandmark;
  }

  /** Manually mark a structure during training */
  markTrainingStructure(structure: Omit<TrainingStructure, 'id' | 'markedAt'>): TrainingStructure | null {
    if (!this.trainingSession) return null;

    const newStructure: TrainingStructure = {
      ...structure,
      id: `structure-${Date.now()}`,
      markedAt: Date.now(),
    };
    this.trainingSession.structures.push(newStructure);
    this.trainingSession.updatedAt = Date.now();
    this.trainingSession.stats = calculateTrainingStats(
      this.trainingSession,
      this.topology.cameras.length
    );

    this.console.log(`Structure marked: ${newStructure.name} (${newStructure.type})`);
    this.emitTrainingStatus();
    return newStructure;
  }

  /** Confirm camera position on floor plan during training */
  confirmCameraPosition(cameraId: string, position: { x: number; y: number }): boolean {
    if (!this.trainingSession) return false;

    // Update in current session
    const visit = this.trainingSession.visits.find(v => v.cameraId === cameraId);
    if (visit) {
      visit.floorPlanPosition = position;
    }

    // Update in topology
    const camera = findCamera(this.topology, cameraId);
    if (camera) {
      camera.floorPlanPosition = position;
      if (this.onTopologyChange) {
        this.onTopologyChange(this.topology);
      }
    }

    this.trainingSession.updatedAt = Date.now();
    this.emitTrainingStatus();
    return true;
  }

  /** Get training status for UI updates */
  getTrainingStatus(): TrainingStatusUpdate | null {
    if (!this.trainingSession) return null;

    const currentCamera = this.trainingSession.currentCameraId
      ? findCamera(this.topology, this.trainingSession.currentCameraId)
      : null;

    const previousCamera = this.trainingSession.previousCameraId
      ? findCamera(this.topology, this.trainingSession.previousCameraId)
      : null;

    // Generate suggestions for next actions
    const suggestions: string[] = [];
    const visitedCameras = new Set(this.trainingSession.visits.map(v => v.cameraId));
    const unvisitedCameras = this.topology.cameras.filter(c => !visitedCameras.has(c.deviceId));

    if (unvisitedCameras.length > 0) {
      // Suggest nearest unvisited camera based on connections
      const currentConnections = currentCamera
        ? findConnectionsFrom(this.topology, currentCamera.deviceId)
        : [];
      const connectedUnvisited = currentConnections
        .map(c => c.toCameraId)
        .filter(id => !visitedCameras.has(id));

      if (connectedUnvisited.length > 0) {
        const nextCam = findCamera(this.topology, connectedUnvisited[0]);
        if (nextCam) {
          suggestions.push(`Walk to ${nextCam.name}`);
        }
      } else {
        suggestions.push(`${unvisitedCameras.length} cameras not yet visited`);
      }
    }

    if (this.trainingSession.visits.length >= 2 && this.trainingSession.landmarks.length === 0) {
      suggestions.push('Consider marking some landmarks');
    }

    if (visitedCameras.size >= this.topology.cameras.length) {
      suggestions.push('All cameras visited! You can end training.');
    }

    const status: TrainingStatusUpdate = {
      sessionId: this.trainingSession.id,
      state: this.trainingSession.state,
      currentCamera: currentCamera ? {
        id: currentCamera.deviceId,
        name: currentCamera.name,
        detectedAt: this.trainingSession.visits.find(v => v.cameraId === currentCamera.deviceId && !v.departedAt)?.arrivedAt || Date.now(),
        confidence: this.trainingSession.visits.find(v => v.cameraId === currentCamera.deviceId && !v.departedAt)?.detectionConfidence || 0,
      } : undefined,
      activeTransit: this.trainingSession.transitStartTime && previousCamera ? {
        fromCameraId: previousCamera.deviceId,
        fromCameraName: previousCamera.name,
        startTime: this.trainingSession.transitStartTime,
        elapsedSeconds: Math.round((Date.now() - this.trainingSession.transitStartTime) / 1000),
      } : undefined,
      stats: this.trainingSession.stats,
      suggestions,
    };

    return status;
  }

  /** Emit training status update to callback */
  private emitTrainingStatus(): void {
    if (this.onTrainingStatusUpdate) {
      const status = this.getTrainingStatus();
      if (status) {
        this.onTrainingStatusUpdate(status);
      }
    }
  }

  /** Apply training results to topology */
  applyTrainingToTopology(): TrainingApplicationResult {
    const result: TrainingApplicationResult = {
      camerasAdded: 0,
      connectionsCreated: 0,
      connectionsUpdated: 0,
      landmarksAdded: 0,
      zonesCreated: 0,
      warnings: [],
      success: false,
    };

    if (!this.trainingSession) {
      result.warnings.push('No training session to apply');
      return result;
    }

    try {
      // 1. Update camera positions from training visits
      for (const visit of this.trainingSession.visits) {
        const camera = findCamera(this.topology, visit.cameraId);
        if (camera && visit.floorPlanPosition) {
          if (!camera.floorPlanPosition) {
            camera.floorPlanPosition = visit.floorPlanPosition;
            result.camerasAdded++;
          }
        }
      }

      // 2. Create or update connections from training transits
      for (const transit of this.trainingSession.transits) {
        const existingConnection = findConnection(
          this.topology,
          transit.fromCameraId,
          transit.toCameraId
        );

        if (existingConnection) {
          // Update existing connection with observed transit time
          const transitMs = transit.transitSeconds * 1000;
          existingConnection.transitTime = {
            min: Math.min(existingConnection.transitTime.min, transitMs * 0.7),
            typical: transitMs,
            max: Math.max(existingConnection.transitTime.max, transitMs * 1.3),
          };
          result.connectionsUpdated++;
        } else {
          // Create new connection
          const fromCamera = findCamera(this.topology, transit.fromCameraId);
          const toCamera = findCamera(this.topology, transit.toCameraId);

          if (fromCamera && toCamera) {
            const transitMs = transit.transitSeconds * 1000;
            const newConnection: CameraConnection = {
              id: `conn-training-${Date.now()}-${result.connectionsCreated}`,
              fromCameraId: transit.fromCameraId,
              toCameraId: transit.toCameraId,
              name: `${fromCamera.name} to ${toCamera.name}`,
              exitZone: [], // Will be refined in topology editor
              entryZone: [], // Will be refined in topology editor
              transitTime: {
                min: transitMs * 0.7,
                typical: transitMs,
                max: transitMs * 1.3,
              },
              bidirectional: true,
            };
            this.topology.connections.push(newConnection);
            result.connectionsCreated++;
          }
        }
      }

      // 3. Add landmarks from training
      for (const trainLandmark of this.trainingSession.landmarks) {
        // Map training landmark type to topology landmark type
        const typeMapping: Record<string, LandmarkType> = {
          mailbox: 'feature',
          garage: 'structure',
          shed: 'structure',
          tree: 'feature',
          gate: 'access',
          door: 'access',
          driveway: 'access',
          pathway: 'access',
          garden: 'feature',
          pool: 'feature',
          deck: 'structure',
          patio: 'structure',
          other: 'feature',
        };

        // Convert training landmark to topology landmark
        const landmark: Landmark = {
          id: trainLandmark.id,
          name: trainLandmark.name,
          type: typeMapping[trainLandmark.type] || 'feature',
          position: trainLandmark.position,
          visibleFromCameras: trainLandmark.visibleFromCameras.length > 0
            ? trainLandmark.visibleFromCameras
            : undefined,
          description: trainLandmark.description,
        };

        if (!this.topology.landmarks) {
          this.topology.landmarks = [];
        }
        this.topology.landmarks.push(landmark);
        result.landmarksAdded++;
      }

      // 4. Create zones from overlaps
      for (const overlap of this.trainingSession.overlaps) {
        const camera1 = findCamera(this.topology, overlap.camera1Id);
        const camera2 = findCamera(this.topology, overlap.camera2Id);

        if (camera1 && camera2) {
          // Create global zone for overlap area
          const zoneName = `${camera1.name}/${camera2.name} Overlap`;
          const existingZone = this.topology.globalZones?.find(z => z.name === zoneName);

          if (!existingZone) {
            if (!this.topology.globalZones) {
              this.topology.globalZones = [];
            }

            // Create camera zone mappings (placeholder zones to be refined in editor)
            const cameraZones: CameraZoneMapping[] = [
              { cameraId: overlap.camera1Id, zone: [] },
              { cameraId: overlap.camera2Id, zone: [] },
            ];

            this.topology.globalZones.push({
              id: `zone-overlap-${overlap.id}`,
              name: zoneName,
              type: 'dwell', // Overlap zones are good for tracking dwell time
              cameraZones,
            });
            result.zonesCreated++;
          }
        }
      }

      // Notify about topology change
      if (this.onTopologyChange) {
        this.onTopologyChange(this.topology);
      }

      result.success = true;
      this.console.log(
        `Training applied: ${result.connectionsCreated} connections created, ` +
        `${result.connectionsUpdated} updated, ${result.landmarksAdded} landmarks added`
      );
    } catch (e) {
      result.warnings.push(`Error applying training: ${e}`);
    }

    return result;
  }

  /** Clear the current training session without applying */
  clearTrainingSession(): void {
    this.trainingSession = null;
    this.emitTrainingStatus();
  }
}
