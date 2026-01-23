/**
 * Tracked Object Models
 * Defines objects being tracked across multiple cameras
 */

import type { ObjectDetectionResult } from '@scrypted/sdk';

/** Unique identifier for a globally tracked object */
export type GlobalTrackingId = string;

/** Object detection class types */
export type ObjectClass = 'person' | 'car' | 'animal' | 'package' | 'vehicle' | string;

/** Tracking state of an object */
export type TrackingState = 'active' | 'pending' | 'exited' | 'lost';

/** A sighting of an object on a specific camera */
export interface ObjectSighting {
  /** Detection from the camera */
  detection: ObjectDetectionResult;
  /** Camera device ID */
  cameraId: string;
  /** Camera name for display */
  cameraName?: string;
  /** Timestamp of detection */
  timestamp: number;
  /** Detection confidence */
  confidence: number;
  /** Visual embedding if available */
  embedding?: string;
  /** Detection image reference ID */
  detectionId?: string;
  /** Position in the camera frame (normalized 0-1) */
  position?: {
    x: number;
    y: number;
  };
}

/** Complete journey segment between cameras */
export interface JourneySegment {
  /** Starting camera device ID */
  fromCameraId: string;
  /** Starting camera name */
  fromCameraName?: string;
  /** Ending camera device ID */
  toCameraId: string;
  /** Ending camera name */
  toCameraName?: string;
  /** Exit timestamp from source camera */
  exitTime: number;
  /** Entry timestamp on target camera */
  entryTime: number;
  /** Transit duration in milliseconds */
  transitDuration: number;
  /** Correlation confidence score (0-1) */
  correlationConfidence: number;
}

/** A globally tracked object across cameras */
export interface TrackedObject {
  /** Unique global tracking ID */
  globalId: GlobalTrackingId;
  /** Object class (person, car, etc.) */
  className: ObjectClass;
  /** Optional recognized label (face name, license plate) */
  label?: string;
  /** All sightings across cameras (chronological order) */
  sightings: ObjectSighting[];
  /** Journey segments between cameras */
  journey: JourneySegment[];
  /** First seen timestamp */
  firstSeen: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Currently active on camera(s) */
  activeOnCameras: string[];
  /** Entry point camera (if known) */
  entryCamera?: string;
  /** Entry point camera name */
  entryCameraName?: string;
  /** Has exited the property */
  hasExited: boolean;
  /** Exit camera (if known) */
  exitCamera?: string;
  /** Exit camera name */
  exitCameraName?: string;
  /** Total dwell time in milliseconds */
  totalDwellTime: number;
  /** Tracking state */
  state: TrackingState;
  /** Visual descriptor for re-identification (aggregated embedding) */
  visualDescriptor?: string;
  /** Best thumbnail detection ID */
  bestThumbnailId?: string;
}

/** Pending correlation candidate */
export interface CorrelationCandidate {
  /** Existing tracked object */
  trackedObject: TrackedObject;
  /** New sighting to potentially correlate */
  newSighting: ObjectSighting;
  /** Correlation confidence score 0-1 */
  confidence: number;
  /** Factors contributing to confidence */
  factors: CorrelationFactors;
}

/** Factors used in correlation scoring */
export interface CorrelationFactors {
  /** Timing factor: how well transit time matches expected range */
  timing: number;
  /** Visual factor: embedding similarity score */
  visual: number;
  /** Spatial factor: exit zone → entry zone coherence */
  spatial: number;
  /** Class factor: object class match */
  class: number;
}

/** Creates a new tracked object from an initial sighting */
export function createTrackedObject(
  globalId: GlobalTrackingId,
  sighting: ObjectSighting,
  isEntryPoint: boolean
): TrackedObject {
  return {
    globalId,
    className: sighting.detection.className as ObjectClass,
    label: sighting.detection.label,
    sightings: [sighting],
    journey: [],
    firstSeen: sighting.timestamp,
    lastSeen: sighting.timestamp,
    activeOnCameras: [sighting.cameraId],
    entryCamera: isEntryPoint ? sighting.cameraId : undefined,
    entryCameraName: isEntryPoint ? sighting.cameraName : undefined,
    hasExited: false,
    totalDwellTime: 0,
    state: 'active',
    visualDescriptor: sighting.embedding,
    bestThumbnailId: sighting.detectionId,
  };
}

/** Adds a sighting to an existing tracked object */
export function addSighting(tracked: TrackedObject, sighting: ObjectSighting): void {
  tracked.sightings.push(sighting);
  tracked.lastSeen = sighting.timestamp;

  // Update active cameras
  if (!tracked.activeOnCameras.includes(sighting.cameraId)) {
    tracked.activeOnCameras.push(sighting.cameraId);
  }

  // Update visual descriptor if we have a new embedding
  if (sighting.embedding && !tracked.visualDescriptor) {
    tracked.visualDescriptor = sighting.embedding;
  }

  // Update best thumbnail if this has higher confidence
  if (sighting.detectionId && sighting.confidence > 0.8) {
    tracked.bestThumbnailId = sighting.detectionId;
  }

  // Update label if recognized
  if (sighting.detection.label && !tracked.label) {
    tracked.label = sighting.detection.label;
  }
}

/** Adds a journey segment when object moves between cameras */
export function addJourneySegment(
  tracked: TrackedObject,
  segment: JourneySegment
): void {
  tracked.journey.push(segment);

  // Remove from old camera, add to new
  tracked.activeOnCameras = tracked.activeOnCameras.filter(
    id => id !== segment.fromCameraId
  );
  if (!tracked.activeOnCameras.includes(segment.toCameraId)) {
    tracked.activeOnCameras.push(segment.toCameraId);
  }
}

/** Calculates total time an object has been tracked */
export function calculateDwellTime(tracked: TrackedObject): number {
  if (tracked.sightings.length === 0) return 0;
  return tracked.lastSeen - tracked.firstSeen;
}

/** Gets the last known camera for an object */
export function getLastCamera(tracked: TrackedObject): string | undefined {
  if (tracked.sightings.length === 0) return undefined;
  return tracked.sightings[tracked.sightings.length - 1].cameraId;
}

/** Gets the last sighting for an object */
export function getLastSighting(tracked: TrackedObject): ObjectSighting | undefined {
  if (tracked.sightings.length === 0) return undefined;
  return tracked.sightings[tracked.sightings.length - 1];
}

/** Generates a summary of the object's journey */
export function getJourneySummary(tracked: TrackedObject): string {
  const cameras: string[] = [];

  if (tracked.entryCamera) {
    cameras.push(tracked.entryCameraName || tracked.entryCamera);
  }

  for (const segment of tracked.journey) {
    if (!cameras.includes(segment.toCameraName || segment.toCameraId)) {
      cameras.push(segment.toCameraName || segment.toCameraId);
    }
  }

  if (tracked.exitCamera && !cameras.includes(tracked.exitCameraName || tracked.exitCamera)) {
    cameras.push(tracked.exitCameraName || tracked.exitCamera);
  }

  return cameras.join(' → ');
}
