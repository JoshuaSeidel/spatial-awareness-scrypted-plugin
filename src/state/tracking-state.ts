/**
 * Tracking State Management
 * Stores and manages all tracked objects across cameras
 */

import {
  TrackedObject,
  GlobalTrackingId,
  ObjectSighting,
  createTrackedObject,
  addSighting,
  addJourneySegment,
  JourneySegment,
} from '../models/tracked-object';

type StateChangeCallback = (objects: TrackedObject[]) => void;

export class TrackingState {
  private objects: Map<GlobalTrackingId, TrackedObject> = new Map();
  private objectsByCamera: Map<string, Set<GlobalTrackingId>> = new Map();
  private changeCallbacks: StateChangeCallback[] = [];
  private storage: Storage;
  private console: Console;
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly persistDebounceMs: number = 2000;

  constructor(storage: Storage, console: Console) {
    this.storage = storage;
    this.console = console;
    this.loadPersistedState();
  }

  /** Create a new tracked object from initial sighting */
  createObject(
    globalId: GlobalTrackingId,
    sighting: ObjectSighting,
    isEntryPoint: boolean
  ): TrackedObject {
    const tracked = createTrackedObject(globalId, sighting, isEntryPoint);
    this.upsertObject(tracked);
    return tracked;
  }

  /** Add or update a tracked object */
  upsertObject(object: TrackedObject): void {
    const existing = this.objects.get(object.globalId);

    // Update camera index - remove from old cameras
    if (existing) {
      for (const cameraId of existing.activeOnCameras) {
        this.objectsByCamera.get(cameraId)?.delete(object.globalId);
      }
    }

    // Add to new cameras
    for (const cameraId of object.activeOnCameras) {
      if (!this.objectsByCamera.has(cameraId)) {
        this.objectsByCamera.set(cameraId, new Set());
      }
      this.objectsByCamera.get(cameraId)!.add(object.globalId);
    }

    this.objects.set(object.globalId, object);
    this.notifyChange();
    this.schedulePersist();
  }

  /** Add a new sighting to an existing tracked object */
  addSighting(globalId: GlobalTrackingId, sighting: ObjectSighting): boolean {
    const tracked = this.objects.get(globalId);
    if (!tracked) return false;

    addSighting(tracked, sighting);

    // Update camera index
    if (!this.objectsByCamera.has(sighting.cameraId)) {
      this.objectsByCamera.set(sighting.cameraId, new Set());
    }
    this.objectsByCamera.get(sighting.cameraId)!.add(globalId);

    this.notifyChange();
    this.schedulePersist();
    return true;
  }

  /** Add a journey segment (cross-camera transition) */
  addJourney(globalId: GlobalTrackingId, segment: JourneySegment): boolean {
    const tracked = this.objects.get(globalId);
    if (!tracked) return false;

    addJourneySegment(tracked, segment);

    // Update camera index
    this.objectsByCamera.get(segment.fromCameraId)?.delete(globalId);
    if (!this.objectsByCamera.has(segment.toCameraId)) {
      this.objectsByCamera.set(segment.toCameraId, new Set());
    }
    this.objectsByCamera.get(segment.toCameraId)!.add(globalId);

    this.notifyChange();
    this.schedulePersist();
    return true;
  }

  /** Get object by global ID */
  getObject(globalId: GlobalTrackingId): TrackedObject | undefined {
    return this.objects.get(globalId);
  }

  /** Get all active objects (active or pending state) */
  getActiveObjects(): TrackedObject[] {
    return Array.from(this.objects.values())
      .filter(obj => obj.state === 'active' || obj.state === 'pending');
  }

  /** Get objects currently visible on a specific camera */
  getObjectsOnCamera(cameraId: string): TrackedObject[] {
    const ids = this.objectsByCamera.get(cameraId) || new Set();
    return Array.from(ids)
      .map(id => this.objects.get(id))
      .filter((obj): obj is TrackedObject => !!obj && obj.state === 'active');
  }

  /** Get all objects (including exited and lost) */
  getAllObjects(): TrackedObject[] {
    return Array.from(this.objects.values());
  }

  /** Get count of active objects */
  getActiveCount(): number {
    return this.getActiveObjects().length;
  }

  /** Get journey for an object */
  getJourney(globalId: GlobalTrackingId): JourneySegment[] | undefined {
    return this.objects.get(globalId)?.journey;
  }

  /** Mark object as having exited the property */
  markExited(globalId: GlobalTrackingId, exitCameraId: string, exitCameraName?: string): void {
    const obj = this.objects.get(globalId);
    if (obj) {
      obj.state = 'exited';
      obj.hasExited = true;
      obj.exitCamera = exitCameraId;
      obj.exitCameraName = exitCameraName;
      obj.activeOnCameras = [];

      // Update camera index
      for (const [cameraId, set] of this.objectsByCamera.entries()) {
        set.delete(globalId);
      }

      this.notifyChange();
      this.schedulePersist();
    }
  }

  /** Mark object as lost (not seen for too long) */
  markLost(globalId: GlobalTrackingId): void {
    const obj = this.objects.get(globalId);
    if (obj) {
      obj.state = 'lost';
      obj.activeOnCameras = [];

      // Update camera index
      for (const [cameraId, set] of this.objectsByCamera.entries()) {
        set.delete(globalId);
      }

      this.notifyChange();
      this.schedulePersist();
    }
  }

  /** Update object to pending state (waiting for correlation) */
  markPending(globalId: GlobalTrackingId): void {
    const obj = this.objects.get(globalId);
    if (obj && obj.state === 'active') {
      obj.state = 'pending';
      this.notifyChange();
    }
  }

  /** Reactivate a pending object */
  reactivate(globalId: GlobalTrackingId): void {
    const obj = this.objects.get(globalId);
    if (obj && obj.state === 'pending') {
      obj.state = 'active';
      this.notifyChange();
    }
  }

  /** Register callback for state changes */
  onStateChange(callback: StateChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /** Remove state change callback */
  offStateChange(callback: StateChangeCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  private notifyChange(): void {
    const objects = this.getAllObjects();
    for (const callback of this.changeCallbacks) {
      try {
        callback(objects);
      } catch (e) {
        this.console.error('State change callback error:', e);
      }
    }
  }

  private persistState(): void {
    try {
      // Only persist active, pending, and recent objects
      const now = Date.now();
      const toPersist = Array.from(this.objects.values())
        .filter(obj =>
          obj.state === 'active' ||
          obj.state === 'pending' ||
          (now - obj.lastSeen < 3600000) // Last hour
        );
      this.storage.setItem('tracked-objects', JSON.stringify(toPersist));
    } catch (e) {
      this.console.error('Failed to persist tracking state:', e);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistState();
    }, this.persistDebounceMs);
  }

  private loadPersistedState(): void {
    try {
      const json = this.storage.getItem('tracked-objects');
      if (json) {
        const objects = JSON.parse(json) as TrackedObject[];
        const now = Date.now();

        for (const obj of objects) {
          // Mark old active objects as lost
          if (obj.state === 'active' && now - obj.lastSeen > 300000) {
            obj.state = 'lost';
            obj.activeOnCameras = [];
          }
          this.objects.set(obj.globalId, obj);

          // Rebuild camera index for active objects
          for (const cameraId of obj.activeOnCameras) {
            if (!this.objectsByCamera.has(cameraId)) {
              this.objectsByCamera.set(cameraId, new Set());
            }
            this.objectsByCamera.get(cameraId)!.add(obj.globalId);
          }
        }

        this.console.log(`Loaded ${objects.length} persisted tracked objects`);
      }
    } catch (e) {
      this.console.error('Failed to load persisted tracking state:', e);
    }
  }

  /** Clean up old objects beyond retention period */
  cleanup(maxAge: number = 86400000): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, obj] of this.objects.entries()) {
      if (now - obj.lastSeen > maxAge && obj.state !== 'active') {
        this.objects.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.console.log(`Cleaned up ${removed} old tracked objects`);
      this.persistState();
    }
  }

  /** Generate a unique global tracking ID */
  generateId(): GlobalTrackingId {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
