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
import { CameraTopology, CameraConnection, findCamera, findConnection, findConnectionsFrom, Landmark } from '../models/topology';
import {
  TrackedObject,
  ObjectSighting,
  GlobalTrackingId,
  CorrelationCandidate,
  getLastSighting,
} from '../models/tracked-object';
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
  /** Use LLM for enhanced descriptions */
  useLlmDescriptions: boolean;
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
  private lostCheckInterval: NodeJS.Timeout | null = null;
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

    // Stop lost check interval
    if (this.lostCheckInterval) {
      clearInterval(this.lostCheckInterval);
      this.lostCheckInterval = null;
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
      if (detection.score < 0.5) continue;

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
      // Check rate limiting - if not allowed, return null to use basic description
      if (!this.isLlmCallAllowed()) {
        this.console.log('LLM rate-limited, using basic notification');
        return null;
      }

      // Get snapshot from camera for LLM analysis (if LLM is enabled)
      let mediaObject: MediaObject | undefined;
      if (this.config.useLlmDescriptions) {
        const camera = systemManager.getDeviceById<Camera>(currentCameraId);
        if (camera?.interfaces?.includes(ScryptedInterface.Camera)) {
          mediaObject = await camera.takePicture();
        }
      }

      // Record that we're making an LLM call
      this.recordLlmCall();

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
        const transitDuration = sighting.timestamp - lastSighting.timestamp;

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
        if (this.passesLoiteringThreshold(tracked) && !this.isInAlertCooldown(tracked.globalId)) {
          // Get spatial reasoning result with RAG context
          const spatialResult = await this.getSpatialDescription(
            tracked,
            lastSighting.cameraId,
            sighting.cameraId,
            transitDuration,
            sighting.cameraId
          );

          // Generate movement alert for cross-camera transition
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
          });

          this.recordAlertTime(tracked.globalId);
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

      // Generate entry alert if this is an entry point
      // Entry alerts also respect loitering threshold and cooldown
      if (isEntryPoint && this.passesLoiteringThreshold(tracked) && !this.isInAlertCooldown(globalId)) {
        // Get spatial reasoning for entry event
        const spatialResult = await this.getSpatialDescription(
          tracked,
          'outside', // Virtual "outside" location for entry
          sighting.cameraId,
          0,
          sighting.cameraId
        );

        await this.alertManager.checkAndAlert('property_entry', tracked, {
          cameraId: sighting.cameraId,
          cameraName: sighting.cameraName,
          objectClass: sighting.detection.className,
          objectLabel: spatialResult?.description || sighting.detection.label,
          detectionId: sighting.detectionId,
          involvedLandmarks: spatialResult?.involvedLandmarks?.map(l => l.name),
          usedLlm: spatialResult?.usedLlm,
        });

        this.recordAlertTime(globalId);
      }
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

    // Wait for correlation window before marking as exited
    const timer = setTimeout(async () => {
      const current = this.state.getObject(tracked.globalId);
      if (current && current.state === 'pending') {
        this.state.markExited(tracked.globalId, sighting.cameraId, sighting.cameraName);

        this.console.log(
          `Object ${tracked.globalId.slice(0, 8)} exited via ${sighting.cameraName}`
        );

        await this.alertManager.checkAndAlert('property_exit', current, {
          cameraId: sighting.cameraId,
          cameraName: sighting.cameraName,
          objectClass: current.className,
          objectLabel: current.label,
        });
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
        this.console.log(
          `Object ${tracked.globalId.slice(0, 8)} marked as lost ` +
          `(not seen for ${Math.round(timeSinceSeen / 1000)}s)`
        );

        this.alertManager.checkAndAlert('lost_tracking', tracked, {
          objectClass: tracked.className,
          objectLabel: tracked.label,
        });
      }
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
}
