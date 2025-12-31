/**
 * Training Mode Types
 *
 * These types support the guided training system where a user physically
 * walks around their property to train the system on camera positions,
 * transit times, overlaps, landmarks, and structures.
 */

/** Unique identifier for a training session */
export type TrainingSessionId = string;

/** Current state of the training session */
export type TrainingSessionState = 'idle' | 'active' | 'paused' | 'completed';

/** Type of training action being performed */
export type TrainingActionType =
  | 'camera_visit'      // User arrived at a camera
  | 'transit_start'     // User started walking to another camera
  | 'transit_end'       // User arrived at destination camera
  | 'mark_landmark'     // User marked a landmark location
  | 'mark_overlap'      // User marked camera overlap zone
  | 'mark_structure'    // User marked a structure (wall, fence, etc.)
  | 'confirm_position'  // User confirmed camera position on floor plan
  | 'adjust_fov';       // User adjusted camera field of view

/** A single camera visit during training */
export interface TrainingCameraVisit {
  /** Camera device ID */
  cameraId: string;
  /** Camera name for display */
  cameraName: string;
  /** When the trainer was first detected on this camera */
  arrivedAt: number;
  /** When the trainer left this camera (null if still there) */
  departedAt: number | null;
  /** Visual embedding captured for the trainer */
  trainerEmbedding?: string;
  /** Confidence of trainer detection (0-1) */
  detectionConfidence: number;
  /** Bounding box of trainer in frame [x, y, width, height] */
  boundingBox?: [number, number, number, number];
  /** Position on floor plan if confirmed */
  floorPlanPosition?: { x: number; y: number };
  /** Entry zone detected (if any) */
  entryZone?: string;
  /** Exit zone detected (if any) */
  exitZone?: string;
}

/** A recorded transit between two cameras */
export interface TrainingTransit {
  /** Unique ID for this transit */
  id: string;
  /** Source camera ID */
  fromCameraId: string;
  /** Destination camera ID */
  toCameraId: string;
  /** Transit start time */
  startTime: number;
  /** Transit end time */
  endTime: number;
  /** Calculated transit duration in seconds */
  transitSeconds: number;
  /** Whether there was direct overlap (both cameras saw trainer simultaneously) */
  hasOverlap: boolean;
  /** Duration of overlap in seconds (if any) */
  overlapDuration?: number;
  /** Exit zone from source camera */
  exitZone?: string;
  /** Entry zone to destination camera */
  entryZone?: string;
  /** Path description entered by user (optional) */
  pathDescription?: string;
}

/** A landmark marked during training */
export interface TrainingLandmark {
  /** Unique ID for this landmark */
  id: string;
  /** Name given by user */
  name: string;
  /** Type of landmark */
  type: 'mailbox' | 'garage' | 'shed' | 'tree' | 'gate' | 'door' | 'driveway' | 'pathway' | 'garden' | 'pool' | 'deck' | 'patio' | 'other';
  /** Position on floor plan */
  position: { x: number; y: number };
  /** Which camera(s) can see this landmark */
  visibleFromCameras: string[];
  /** When this was marked */
  markedAt: number;
  /** Optional description */
  description?: string;
}

/** A camera overlap zone marked during training */
export interface TrainingOverlap {
  /** Unique ID for this overlap */
  id: string;
  /** First camera in overlap */
  camera1Id: string;
  /** Second camera in overlap */
  camera2Id: string;
  /** Position on floor plan where overlap was confirmed */
  position: { x: number; y: number };
  /** Approximate radius of overlap zone */
  radius: number;
  /** When this was marked */
  markedAt: number;
}

/** A structure marked during training (walls, fences, etc.) */
export interface TrainingStructure {
  /** Unique ID for this structure */
  id: string;
  /** Type of structure */
  type: 'wall' | 'fence' | 'hedge' | 'building' | 'path' | 'road' | 'other';
  /** Name/description */
  name: string;
  /** Points defining the structure (line or polygon) */
  points: Array<{ x: number; y: number }>;
  /** When this was marked */
  markedAt: number;
}

/** Summary statistics for a training session */
export interface TrainingSessionStats {
  /** Total duration of training in seconds */
  totalDuration: number;
  /** Number of cameras visited */
  camerasVisited: number;
  /** Number of transits recorded */
  transitsRecorded: number;
  /** Number of landmarks marked */
  landmarksMarked: number;
  /** Number of overlaps detected */
  overlapsDetected: number;
  /** Number of structures marked */
  structuresMarked: number;
  /** Average transit time in seconds */
  averageTransitTime: number;
  /** Coverage percentage (cameras visited / total cameras) */
  coveragePercentage: number;
}

/** A training session */
export interface TrainingSession {
  /** Unique session ID */
  id: TrainingSessionId;
  /** Current state */
  state: TrainingSessionState;
  /** When the session started */
  startedAt: number;
  /** When the session was last updated */
  updatedAt: number;
  /** When the session ended (if completed) */
  completedAt?: number;
  /** Visual embedding of the trainer (captured at start) */
  trainerEmbedding?: string;
  /** Name of the trainer (for display) */
  trainerName?: string;
  /** All camera visits during this session */
  visits: TrainingCameraVisit[];
  /** All transits recorded during this session */
  transits: TrainingTransit[];
  /** All landmarks marked during this session */
  landmarks: TrainingLandmark[];
  /** All overlaps detected during this session */
  overlaps: TrainingOverlap[];
  /** All structures marked during this session */
  structures: TrainingStructure[];
  /** Current camera where trainer is detected (if any) */
  currentCameraId?: string;
  /** Previous camera (for transit tracking) */
  previousCameraId?: string;
  /** Time when trainer left previous camera */
  transitStartTime?: number;
  /** Session statistics */
  stats: TrainingSessionStats;
}

/** Configuration for training mode */
export interface TrainingConfig {
  /** Minimum confidence for trainer detection */
  minDetectionConfidence: number;
  /** Maximum time (seconds) to wait for trainer at next camera */
  maxTransitWait: number;
  /** Whether to auto-detect overlaps */
  autoDetectOverlaps: boolean;
  /** Whether to auto-suggest landmarks based on AI */
  autoSuggestLandmarks: boolean;
  /** Minimum overlap duration (seconds) to count as overlap */
  minOverlapDuration: number;
}

/** Real-time training status update sent to UI */
export interface TrainingStatusUpdate {
  /** Session ID */
  sessionId: TrainingSessionId;
  /** Current state */
  state: TrainingSessionState;
  /** Current camera (if detected) */
  currentCamera?: {
    id: string;
    name: string;
    detectedAt: number;
    confidence: number;
  };
  /** Active transit (if in transit) */
  activeTransit?: {
    fromCameraId: string;
    fromCameraName: string;
    startTime: number;
    elapsedSeconds: number;
  };
  /** Recent action */
  lastAction?: {
    type: TrainingActionType;
    description: string;
    timestamp: number;
  };
  /** Session stats */
  stats: TrainingSessionStats;
  /** Suggestions for next actions */
  suggestions: string[];
}

/** Result of applying training to topology */
export interface TrainingApplicationResult {
  /** Number of cameras added to topology */
  camerasAdded: number;
  /** Number of connections created */
  connectionsCreated: number;
  /** Number of connections updated */
  connectionsUpdated: number;
  /** Number of landmarks added */
  landmarksAdded: number;
  /** Number of zones created */
  zonesCreated: number;
  /** Any warnings or issues */
  warnings: string[];
  /** Whether the application was successful */
  success: boolean;
}

/** Default training configuration */
export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  minDetectionConfidence: 0.7,
  maxTransitWait: 120, // 2 minutes
  autoDetectOverlaps: true,
  autoSuggestLandmarks: true,
  minOverlapDuration: 2, // 2 seconds
};

/** Create a new empty training session */
export function createTrainingSession(trainerName?: string): TrainingSession {
  const now = Date.now();
  return {
    id: `training-${now}-${Math.random().toString(36).substr(2, 9)}`,
    state: 'idle',
    startedAt: now,
    updatedAt: now,
    trainerName,
    visits: [],
    transits: [],
    landmarks: [],
    overlaps: [],
    structures: [],
    stats: {
      totalDuration: 0,
      camerasVisited: 0,
      transitsRecorded: 0,
      landmarksMarked: 0,
      overlapsDetected: 0,
      structuresMarked: 0,
      averageTransitTime: 0,
      coveragePercentage: 0,
    },
  };
}

/** Calculate session statistics */
export function calculateTrainingStats(session: TrainingSession, totalCameras: number): TrainingSessionStats {
  const uniqueCameras = new Set(session.visits.map(v => v.cameraId));
  const transitTimes = session.transits.map(t => t.transitSeconds);
  const avgTransit = transitTimes.length > 0
    ? transitTimes.reduce((a, b) => a + b, 0) / transitTimes.length
    : 0;

  return {
    totalDuration: (session.completedAt || Date.now()) - session.startedAt,
    camerasVisited: uniqueCameras.size,
    transitsRecorded: session.transits.length,
    landmarksMarked: session.landmarks.length,
    overlapsDetected: session.overlaps.length,
    structuresMarked: session.structures.length,
    averageTransitTime: Math.round(avgTransit),
    coveragePercentage: totalCameras > 0
      ? Math.round((uniqueCameras.size / totalCameras) * 100)
      : 0,
  };
}
