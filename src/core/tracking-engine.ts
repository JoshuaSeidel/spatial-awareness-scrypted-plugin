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
import { CameraTopology, findCamera, findConnection, findConnectionsFrom } from '../models/topology';
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
}

export class TrackingEngine {
  private topology: CameraTopology;
  private state: TrackingState;
  private alertManager: AlertManager;
  private config: TrackingEngineConfig;
  private console: Console;
  private correlator: ObjectCorrelator;
  private listeners: Map<string, EventListenerRegister> = new Map();
  private pendingTimers: Map<GlobalTrackingId, NodeJS.Timeout> = new Map();
  private lostCheckInterval: NodeJS.Timeout | null = null;
  /** Track last alert time per object to enforce cooldown */
  private objectLastAlertTime: Map<GlobalTrackingId, number> = new Map();
  /** Cache for LLM device reference */
  private llmDevice: ObjectDetection | null = null;

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

  /** Try to get LLM-enhanced description for movement */
  private async getLlmDescription(
    tracked: TrackedObject,
    fromCamera: string,
    toCamera: string,
    cameraId: string
  ): Promise<string | null> {
    if (!this.config.useLlmDescriptions) return null;

    try {
      // Find LLM plugin device if not cached
      if (!this.llmDevice) {
        for (const id of Object.keys(systemManager.getSystemState())) {
          const device = systemManager.getDeviceById(id);
          if (device?.interfaces?.includes(ScryptedInterface.ObjectDetection) &&
              device.name?.toLowerCase().includes('llm')) {
            this.llmDevice = device as unknown as ObjectDetection;
            this.console.log(`Found LLM device: ${device.name}`);
            break;
          }
        }
      }

      if (!this.llmDevice) return null;

      // Get snapshot from camera for LLM analysis
      const camera = systemManager.getDeviceById<Camera>(cameraId);
      if (!camera?.interfaces?.includes(ScryptedInterface.Camera)) return null;

      const picture = await camera.takePicture();
      if (!picture) return null;

      // Ask LLM to describe the movement
      const prompt = `Describe this ${tracked.className} in one short sentence. ` +
        `They are moving from the ${fromCamera} area towards the ${toCamera}. ` +
        `Include details like: gender (man/woman), clothing color, vehicle color/type if applicable. ` +
        `Example: "Man in blue jacket walking from garage towards front door" or ` +
        `"Black SUV driving from driveway towards street"`;

      const result = await this.llmDevice.detectObjects(picture, {
        settings: { prompt }
      } as any);

      // Extract description from LLM response
      if (result.detections?.[0]?.label) {
        return result.detections[0].label;
      }

      return null;
    } catch (e) {
      this.console.warn('LLM description failed:', e);
      return null;
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

        this.console.log(
          `Object ${tracked.globalId.slice(0, 8)} transited: ` +
          `${lastSighting.cameraName} → ${sighting.cameraName} ` +
          `(confidence: ${(correlation.confidence * 100).toFixed(0)}%)`
        );

        // Check loitering threshold and per-object cooldown before alerting
        if (this.passesLoiteringThreshold(tracked) && !this.isInAlertCooldown(tracked.globalId)) {
          // Try to get LLM-enhanced description
          const llmDescription = await this.getLlmDescription(
            tracked,
            lastSighting.cameraName,
            sighting.cameraName,
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
            objectLabel: llmDescription || sighting.detection.label,
            detectionId: sighting.detectionId,
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
        const llmDescription = await this.getLlmDescription(
          tracked,
          'outside',
          sighting.cameraName,
          sighting.cameraId
        );

        await this.alertManager.checkAndAlert('property_entry', tracked, {
          cameraId: sighting.cameraId,
          cameraName: sighting.cameraName,
          objectClass: sighting.detection.className,
          objectLabel: llmDescription || sighting.detection.label,
          detectionId: sighting.detectionId,
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
}
