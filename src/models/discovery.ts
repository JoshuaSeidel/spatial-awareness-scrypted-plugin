/**
 * Auto-Topology Discovery Models
 * Types for scene analysis and topology discovery via vision LLM
 */

import { LandmarkType, Landmark, CameraConnection } from './topology';

// ==================== Discovery Configuration ====================

/** Configuration for the topology discovery engine */
export interface DiscoveryConfig {
  /** Hours between automatic discovery scans (0 = disabled) */
  discoveryIntervalHours: number;
  /** Minimum confidence threshold for auto-accepting suggestions */
  autoAcceptThreshold: number;
  /** Minimum confidence for landmark suggestions */
  minLandmarkConfidence: number;
  /** Minimum confidence for connection suggestions */
  minConnectionConfidence: number;
}

/** Default discovery configuration */
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  discoveryIntervalHours: 0, // Disabled by default
  autoAcceptThreshold: 0.85,
  minLandmarkConfidence: 0.6,
  minConnectionConfidence: 0.5,
};

/** Rate limit warning thresholds (in hours) */
export const RATE_LIMIT_WARNING_THRESHOLD = 1; // Warn if interval is less than 1 hour

// ==================== Scene Analysis Types ====================

/** Zone types that can be discovered in camera views */
export type DiscoveredZoneType =
  | 'yard'       // Front yard, back yard, side yard
  | 'driveway'   // Driveway, parking area
  | 'street'     // Street, road, sidewalk
  | 'patio'      // Patio, deck
  | 'walkway'    // Walkways, paths
  | 'parking'    // Parking lot, parking space
  | 'garden'     // Garden, landscaped area
  | 'pool'       // Pool area
  | 'unknown';   // Unidentified area

/** A zone discovered in a camera view */
export interface DiscoveredZone {
  /** Name of the zone (e.g., "Front Yard", "Driveway") */
  name: string;
  /** Type classification */
  type: DiscoveredZoneType;
  /** Estimated percentage of frame this zone covers (0-1) */
  coverage: number;
  /** Description from LLM analysis */
  description: string;
  /** Bounding box in normalized coordinates [x, y, width, height] (0-1) */
  boundingBox?: [number, number, number, number];
}

/** A landmark discovered in a camera view */
export interface DiscoveredLandmark {
  /** Name of the landmark */
  name: string;
  /** Type classification */
  type: LandmarkType;
  /** Confidence score from LLM (0-1) */
  confidence: number;
  /** Bounding box in normalized coordinates [x, y, width, height] (0-1) */
  boundingBox?: [number, number, number, number];
  /** Description from LLM analysis */
  description: string;
}

/** Edge analysis - what's visible at frame boundaries */
export interface EdgeAnalysis {
  /** What's visible at the top edge */
  top: string;
  /** What's visible at the left edge */
  left: string;
  /** What's visible at the right edge */
  right: string;
  /** What's visible at the bottom edge */
  bottom: string;
}

/** Complete scene analysis result for a single camera */
export interface SceneAnalysis {
  /** Camera device ID */
  cameraId: string;
  /** Camera name for reference */
  cameraName: string;
  /** When this analysis was performed */
  timestamp: number;
  /** Landmarks discovered in the scene */
  landmarks: DiscoveredLandmark[];
  /** Zones discovered in the scene */
  zones: DiscoveredZone[];
  /** Edge analysis for camera correlation */
  edges: EdgeAnalysis;
  /** Estimated camera facing direction */
  orientation: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest' | 'unknown';
  /** Camera IDs that may have overlapping views */
  potentialOverlaps: string[];
  /** Whether this analysis is still valid (not stale) */
  isValid: boolean;
  /** Error message if analysis failed */
  error?: string;
}

// ==================== Correlation Types ====================

/** A landmark that appears in multiple camera views */
export interface SharedLandmark {
  /** Suggested name for this landmark */
  name: string;
  /** Suggested type */
  type: LandmarkType;
  /** Camera IDs where this landmark is visible */
  seenByCameras: string[];
  /** Confidence in this correlation */
  confidence: number;
  /** Description of the shared landmark */
  description?: string;
}

/** A suggested connection between cameras */
export interface SuggestedConnection {
  /** Source camera ID */
  fromCameraId: string;
  /** Destination camera ID */
  toCameraId: string;
  /** Estimated transit time in seconds */
  transitSeconds: number;
  /** Path description (e.g., "via driveway", "through front yard") */
  via: string;
  /** Confidence in this suggestion */
  confidence: number;
  /** Whether this is bidirectional */
  bidirectional: boolean;
}

/** Result of correlating scenes across multiple cameras */
export interface TopologyCorrelation {
  /** Landmarks that appear in multiple camera views */
  sharedLandmarks: SharedLandmark[];
  /** Suggested connections between cameras */
  suggestedConnections: SuggestedConnection[];
  /** Overall description of property layout from LLM */
  layoutDescription: string;
  /** When this correlation was performed */
  timestamp: number;
}

// ==================== Discovery Suggestions ====================

/** Status of a discovery suggestion */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'merged';

/** A pending discovery suggestion for user review */
export interface DiscoverySuggestion {
  /** Unique ID for this suggestion */
  id: string;
  /** Type of suggestion */
  type: 'landmark' | 'zone' | 'connection';
  /** When this was discovered */
  timestamp: number;
  /** Cameras that contributed to this discovery */
  sourceCameras: string[];
  /** Confidence score */
  confidence: number;
  /** Current status */
  status: SuggestionStatus;
  /** The suggested landmark (if type is 'landmark') */
  landmark?: Partial<Landmark>;
  /** The suggested zone (if type is 'zone') */
  zone?: DiscoveredZone;
  /** The suggested connection (if type is 'connection') */
  connection?: SuggestedConnection;
}

// ==================== Discovery Status ====================

/** Current status of the discovery engine */
export interface DiscoveryStatus {
  /** Whether discovery is currently running */
  isRunning: boolean;
  /** Whether a scan is in progress */
  isScanning: boolean;
  /** Last scan timestamp */
  lastScanTime: number | null;
  /** Next scheduled scan timestamp */
  nextScanTime: number | null;
  /** Number of cameras analyzed */
  camerasAnalyzed: number;
  /** Number of pending suggestions */
  pendingSuggestions: number;
  /** Any error from last scan */
  lastError?: string;
}

/** Default discovery status */
export const DEFAULT_DISCOVERY_STATUS: DiscoveryStatus = {
  isRunning: false,
  isScanning: false,
  lastScanTime: null,
  nextScanTime: null,
  camerasAnalyzed: 0,
  pendingSuggestions: 0,
};
