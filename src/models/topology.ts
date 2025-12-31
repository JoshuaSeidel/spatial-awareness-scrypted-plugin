/**
 * Camera Topology Models
 * Defines the spatial relationships between cameras in the NVR system
 */

/** A point in 2D space (normalized 0-100 or pixel coordinates) */
export type Point = [number, number];

/** A polygon path defined by an array of points */
export type ClipPath = Point[];

/** Position on a floor plan */
export interface FloorPlanPosition {
  x: number;
  y: number;
}

/** Camera field of view configuration */
export interface CameraFOV {
  /** FOV angle in degrees */
  angle: number;
  /** Direction the camera faces in degrees from north (0 = north, 90 = east) */
  direction: number;
}

/** Transit time configuration between cameras */
export interface TransitTime {
  /** Minimum expected transit time in milliseconds */
  min: number;
  /** Typical/average transit time in milliseconds */
  typical: number;
  /** Maximum expected transit time in milliseconds */
  max: number;
}

/** Represents a camera in the topology */
export interface CameraNode {
  /** Scrypted device ID */
  deviceId: string;
  /** Native ID for plugin reference */
  nativeId: string;
  /** Display name */
  name: string;
  /** Position on floor plan (optional) */
  floorPlanPosition?: FloorPlanPosition;
  /** Camera field of view configuration (optional) */
  fov?: CameraFOV;
  /** Is this an entry point to the property */
  isEntryPoint: boolean;
  /** Is this an exit point from the property */
  isExitPoint: boolean;
  /** Detection classes to track on this camera */
  trackClasses: string[];
}

/** Represents a connection between two cameras */
export interface CameraConnection {
  /** Unique identifier for this connection */
  id: string;
  /** Source camera device ID */
  fromCameraId: string;
  /** Target camera device ID */
  toCameraId: string;
  /** Exit zone in source camera (normalized coordinates 0-100) */
  exitZone: ClipPath;
  /** Entry zone in target camera (normalized coordinates 0-100) */
  entryZone: ClipPath;
  /** Expected transit time configuration */
  transitTime: TransitTime;
  /** Whether this connection works both ways */
  bidirectional: boolean;
  /** Human-readable path name (e.g., "Driveway to Front Door") */
  name: string;
}

/** Zone type for alerting purposes */
export type GlobalZoneType = 'entry' | 'exit' | 'dwell' | 'restricted';

/** A zone that spans multiple cameras */
export interface GlobalZone {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Zone type for alerting */
  type: GlobalZoneType;
  /** Camera zones that comprise this global zone */
  cameraZones: CameraZoneMapping[];
}

/** Maps a zone to a specific camera */
export interface CameraZoneMapping {
  /** Camera device ID */
  cameraId: string;
  /** Zone polygon on this camera */
  zone: ClipPath;
}

/** Floor plan image configuration */
export interface FloorPlanConfig {
  /** Base64 encoded image data or URL */
  imageData?: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Scale factor (pixels per real-world unit) */
  scale?: number;
}

/** Complete camera topology configuration */
export interface CameraTopology {
  /** Version for migration support */
  version: string;
  /** All cameras in the system */
  cameras: CameraNode[];
  /** Connections between cameras */
  connections: CameraConnection[];
  /** Named zones spanning multiple cameras */
  globalZones: GlobalZone[];
  /** Floor plan configuration (optional) */
  floorPlan?: FloorPlanConfig;
}

/** Creates an empty topology */
export function createEmptyTopology(): CameraTopology {
  return {
    version: '1.0',
    cameras: [],
    connections: [],
    globalZones: [],
  };
}

/** Finds a camera by device ID */
export function findCamera(topology: CameraTopology, deviceId: string): CameraNode | undefined {
  return topology.cameras.find(c => c.deviceId === deviceId);
}

/** Finds connections from a camera */
export function findConnectionsFrom(topology: CameraTopology, cameraId: string): CameraConnection[] {
  return topology.connections.filter(c =>
    c.fromCameraId === cameraId ||
    (c.bidirectional && c.toCameraId === cameraId)
  );
}

/** Finds a connection between two cameras */
export function findConnection(
  topology: CameraTopology,
  fromCameraId: string,
  toCameraId: string
): CameraConnection | undefined {
  return topology.connections.find(c =>
    (c.fromCameraId === fromCameraId && c.toCameraId === toCameraId) ||
    (c.bidirectional && c.fromCameraId === toCameraId && c.toCameraId === fromCameraId)
  );
}

/** Gets all entry point cameras */
export function getEntryPoints(topology: CameraTopology): CameraNode[] {
  return topology.cameras.filter(c => c.isEntryPoint);
}

/** Gets all exit point cameras */
export function getExitPoints(topology: CameraTopology): CameraNode[] {
  return topology.cameras.filter(c => c.isExitPoint);
}
