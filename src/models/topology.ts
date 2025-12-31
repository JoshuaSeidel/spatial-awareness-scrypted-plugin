/**
 * Camera Topology Models
 * Defines the spatial relationships between cameras, landmarks, and zones
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

// ==================== Landmark Types ====================

/** Types of landmarks in the topology */
export type LandmarkType =
  | 'structure'    // House, shed, garage, porch
  | 'feature'      // Mailbox, tree, firepit, deck, pool
  | 'boundary'     // Fence, wall, hedge, property line
  | 'access'       // Driveway, walkway, gate, door, stairs
  | 'vehicle'      // Parked car location, boat, RV
  | 'neighbor'     // Neighbor's house, neighbor's driveway
  | 'zone'         // Front yard, back yard, side yard
  | 'street';      // Street, sidewalk, alley

/** Common landmark templates for quick setup */
export const LANDMARK_TEMPLATES: { type: LandmarkType; suggestions: string[] }[] = [
  { type: 'structure', suggestions: ['House', 'Garage', 'Shed', 'Porch', 'Deck', 'Patio', 'Gazebo', 'Pool House'] },
  { type: 'feature', suggestions: ['Mailbox', 'Tree', 'Firepit', 'Pool', 'Hot Tub', 'Garden', 'Fountain', 'Flagpole'] },
  { type: 'boundary', suggestions: ['Front Fence', 'Back Fence', 'Side Fence', 'Hedge', 'Wall', 'Property Line'] },
  { type: 'access', suggestions: ['Driveway', 'Front Walkway', 'Back Walkway', 'Front Door', 'Back Door', 'Side Door', 'Gate', 'Stairs'] },
  { type: 'vehicle', suggestions: ['Car Parking', 'Boat', 'RV Pad', 'Motorcycle Spot'] },
  { type: 'neighbor', suggestions: ["Neighbor's House", "Neighbor's Driveway", "Neighbor's Yard"] },
  { type: 'zone', suggestions: ['Front Yard', 'Back Yard', 'Side Yard', 'Courtyard'] },
  { type: 'street', suggestions: ['Street', 'Sidewalk', 'Alley', 'Cul-de-sac'] },
];

/** A landmark/static object in the topology */
export interface Landmark {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Mailbox", "Red Shed") */
  name: string;
  /** Type of landmark */
  type: LandmarkType;
  /** Position on floor plan */
  position: FloorPlanPosition;
  /** Optional polygon outline on floor plan */
  outline?: ClipPath;
  /** Human-readable description for LLM context */
  description?: string;
  /** Can someone enter property through/near this landmark? */
  isEntryPoint?: boolean;
  /** Can someone exit property through/near this landmark? */
  isExitPoint?: boolean;
  /** IDs of adjacent landmarks (for path calculation) */
  adjacentTo?: string[];
  /** IDs of cameras that can see this landmark */
  visibleFromCameras?: string[];
  /** Whether this was suggested by AI (pending user confirmation) */
  aiSuggested?: boolean;
  /** Confidence score if AI suggested (0-1) */
  aiConfidence?: number;
}

// ==================== Camera FOV Types ====================

/** Camera field of view - simple configuration */
export interface CameraFOVSimple {
  mode: 'simple';
  /** FOV angle in degrees (e.g., 90, 120) */
  angle: number;
  /** Direction the camera faces in degrees (0 = up/north on floor plan, 90 = right/east) */
  direction: number;
  /** How far the camera can see (in floor plan units) */
  range: number;
}

/** Camera field of view - polygon configuration */
export interface CameraFOVPolygon {
  mode: 'polygon';
  /** Polygon defining exact coverage area on floor plan */
  polygon: ClipPath;
}

/** Camera field of view configuration */
export type CameraFOV = CameraFOVSimple | CameraFOVPolygon;

/** Legacy FOV format for backward compatibility */
export interface CameraFOVLegacy {
  angle: number;
  direction: number;
}

// ==================== Camera Context ====================

/** Rich context description for a camera */
export interface CameraContext {
  /** Where the camera is mounted (e.g., "Under front porch awning", "On garage wall") */
  mountLocation?: string;
  /** What the camera is pointing at / what it can see */
  description?: string;
  /** Height of camera mount in feet (helps with perspective understanding) */
  mountHeight?: number;
  /** IDs of landmarks visible from this camera */
  visibleLandmarks?: string[];
  /** Natural language description of camera coverage for LLM */
  coverageDescription?: string;
}

// ==================== Transit Configuration ====================

/** Transit time configuration between cameras */
export interface TransitTime {
  /** Minimum expected transit time in milliseconds */
  min: number;
  /** Typical/average transit time in milliseconds */
  typical: number;
  /** Maximum expected transit time in milliseconds */
  max: number;
}

// ==================== Camera Node ====================

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
  fov?: CameraFOV | CameraFOVLegacy;
  /** Is this an entry point to the property */
  isEntryPoint: boolean;
  /** Is this an exit point from the property */
  isExitPoint: boolean;
  /** Detection classes to track on this camera */
  trackClasses: string[];
  /** Rich context description */
  context?: CameraContext;
}

// ==================== Connections ====================

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
  /** Landmarks along this path (for rich descriptions) */
  pathLandmarks?: string[];
}

// ==================== Zones ====================

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

// ==================== Spatial Relationships ====================

/** Types of spatial relationships between entities */
export type RelationshipType =
  | 'adjacent'       // Next to each other
  | 'leads_to'       // Path from A leads to B
  | 'visible_from'   // A is visible from B
  | 'part_of'        // A is part of B (e.g., front door is part of house)
  | 'contains'       // A contains B
  | 'near'           // Close proximity
  | 'across_from'    // Opposite sides
  | 'between';       // A is between B and C

/** A spatial relationship between two entities */
export interface SpatialRelationship {
  /** Unique identifier */
  id: string;
  /** Type of relationship */
  type: RelationshipType;
  /** First entity (camera ID or landmark ID) */
  entityA: string;
  /** Second entity (camera ID or landmark ID) */
  entityB: string;
  /** Optional third entity for 'between' relationships */
  entityC?: string;
  /** Optional description */
  description?: string;
  /** Whether this was auto-inferred */
  autoInferred?: boolean;
}

// ==================== Property Configuration ====================

/** Overall property description for context */
export interface PropertyConfig {
  /** Type of property */
  propertyType?: 'single_family' | 'townhouse' | 'apartment' | 'condo' | 'commercial' | 'other';
  /** Description of the property for LLM context */
  description?: string;
  /** Address (optional, for context) */
  address?: string;
  /** Lot features */
  features?: string[];
  /** Cardinal direction the front of the property faces */
  frontFacing?: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';
}

// ==================== Floor Plan ====================

/** Floor plan image configuration */
export interface FloorPlanConfig {
  /** Base64 encoded image data or URL */
  imageData?: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Scale factor (pixels per real-world foot, for distance calculations) */
  scale?: number;
  /** Rotation of the floor plan (0 = north is up) */
  rotation?: number;
}

// ==================== AI Suggestions ====================

/** An AI-suggested landmark pending user confirmation */
export interface LandmarkSuggestion {
  /** Unique ID for this suggestion */
  id: string;
  /** Suggested landmark */
  landmark: Landmark;
  /** Which camera(s) detected this */
  detectedByCameras: string[];
  /** When this was suggested */
  timestamp: number;
  /** Detection count (how many times AI identified this) */
  detectionCount: number;
  /** Status */
  status: 'pending' | 'accepted' | 'rejected';
}

// ==================== Complete Topology ====================

/** Complete camera topology configuration */
export interface CameraTopology {
  /** Version for migration support */
  version: string;
  /** Property-level configuration */
  property?: PropertyConfig;
  /** All cameras in the system */
  cameras: CameraNode[];
  /** Connections between cameras */
  connections: CameraConnection[];
  /** Static landmarks/objects */
  landmarks: Landmark[];
  /** Spatial relationships (auto-inferred + manual) */
  relationships: SpatialRelationship[];
  /** Named zones spanning multiple cameras */
  globalZones: GlobalZone[];
  /** Floor plan configuration (optional) */
  floorPlan?: FloorPlanConfig;
  /** Pending AI landmark suggestions */
  pendingSuggestions?: LandmarkSuggestion[];
}

// ==================== Helper Functions ====================

/** Creates an empty topology */
export function createEmptyTopology(): CameraTopology {
  return {
    version: '2.0',
    cameras: [],
    connections: [],
    landmarks: [],
    relationships: [],
    globalZones: [],
  };
}

/** Finds a camera by device ID */
export function findCamera(topology: CameraTopology, deviceId: string): CameraNode | undefined {
  return topology.cameras.find(c => c.deviceId === deviceId);
}

/** Finds a landmark by ID */
export function findLandmark(topology: CameraTopology, landmarkId: string): Landmark | undefined {
  return topology.landmarks.find(l => l.id === landmarkId);
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
  return topology.connections.filter(c =>
    (c.fromCameraId === fromCameraId && c.toCameraId === toCameraId) ||
    (c.bidirectional && c.fromCameraId === toCameraId && c.toCameraId === fromCameraId)
  )[0];
}

/** Gets all entry point cameras */
export function getEntryPoints(topology: CameraTopology): CameraNode[] {
  return topology.cameras.filter(c => c.isEntryPoint);
}

/** Gets all exit point cameras */
export function getExitPoints(topology: CameraTopology): CameraNode[] {
  return topology.cameras.filter(c => c.isExitPoint);
}

/** Gets landmarks visible from a camera */
export function getLandmarksVisibleFromCamera(topology: CameraTopology, cameraId: string): Landmark[] {
  const camera = findCamera(topology, cameraId);
  if (!camera?.context?.visibleLandmarks) return [];
  return camera.context.visibleLandmarks
    .map(id => findLandmark(topology, id))
    .filter((l): l is Landmark => l !== undefined);
}

/** Gets cameras that can see a landmark */
export function getCamerasWithLandmarkVisibility(topology: CameraTopology, landmarkId: string): CameraNode[] {
  return topology.cameras.filter(c =>
    c.context?.visibleLandmarks?.includes(landmarkId)
  );
}

/** Gets adjacent landmarks */
export function getAdjacentLandmarks(topology: CameraTopology, landmarkId: string): Landmark[] {
  const landmark = findLandmark(topology, landmarkId);
  if (!landmark?.adjacentTo) return [];
  return landmark.adjacentTo
    .map(id => findLandmark(topology, id))
    .filter((l): l is Landmark => l !== undefined);
}

/** Calculates distance between two floor plan positions */
export function calculateDistance(posA: FloorPlanPosition, posB: FloorPlanPosition): number {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Auto-infers relationships based on positions and proximity */
export function inferRelationships(topology: CameraTopology, proximityThreshold: number = 50): SpatialRelationship[] {
  const relationships: SpatialRelationship[] = [];
  const entities: { id: string; position: FloorPlanPosition; type: 'camera' | 'landmark' }[] = [];

  // Collect all positioned entities
  for (const camera of topology.cameras) {
    if (camera.floorPlanPosition) {
      entities.push({ id: camera.deviceId, position: camera.floorPlanPosition, type: 'camera' });
    }
  }
  for (const landmark of topology.landmarks) {
    entities.push({ id: landmark.id, position: landmark.position, type: 'landmark' });
  }

  // Find adjacent entities based on proximity
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const distance = calculateDistance(entities[i].position, entities[j].position);
      if (distance <= proximityThreshold) {
        relationships.push({
          id: `auto_${entities[i].id}_${entities[j].id}`,
          type: distance <= proximityThreshold / 2 ? 'adjacent' : 'near',
          entityA: entities[i].id,
          entityB: entities[j].id,
          autoInferred: true,
        });
      }
    }
  }

  return relationships;
}

/** Generates a natural language description of the topology for LLM context */
export function generateTopologyDescription(topology: CameraTopology): string {
  const lines: string[] = [];

  // Property description
  if (topology.property?.description) {
    lines.push(`Property: ${topology.property.description}`);
  }
  if (topology.property?.frontFacing) {
    lines.push(`Front of property faces ${topology.property.frontFacing}.`);
  }

  // Landmarks
  if (topology.landmarks.length > 0) {
    lines.push('\nLandmarks on property:');
    for (const landmark of topology.landmarks) {
      let desc = `- ${landmark.name} (${landmark.type})`;
      if (landmark.description) desc += `: ${landmark.description}`;
      if (landmark.isEntryPoint) desc += ' [Entry point]';
      if (landmark.isExitPoint) desc += ' [Exit point]';
      lines.push(desc);
    }
  }

  // Cameras
  if (topology.cameras.length > 0) {
    lines.push('\nCamera coverage:');
    for (const camera of topology.cameras) {
      let desc = `- ${camera.name}`;
      if (camera.context?.mountLocation) desc += ` (mounted at ${camera.context.mountLocation})`;
      if (camera.context?.coverageDescription) desc += `: ${camera.context.coverageDescription}`;
      if (camera.isEntryPoint) desc += ' [Watches entry point]';
      if (camera.isExitPoint) desc += ' [Watches exit point]';

      // List visible landmarks
      if (camera.context?.visibleLandmarks && camera.context.visibleLandmarks.length > 0) {
        const landmarkNames = camera.context.visibleLandmarks
          .map(id => findLandmark(topology, id)?.name)
          .filter(Boolean);
        if (landmarkNames.length > 0) {
          desc += ` Can see: ${landmarkNames.join(', ')}`;
        }
      }
      lines.push(desc);
    }
  }

  // Connections/paths
  if (topology.connections.length > 0) {
    lines.push('\nMovement paths:');
    for (const conn of topology.connections) {
      const fromCam = findCamera(topology, conn.fromCameraId);
      const toCam = findCamera(topology, conn.toCameraId);
      if (fromCam && toCam) {
        let desc = `- ${fromCam.name} → ${toCam.name}`;
        if (conn.name) desc += ` (${conn.name})`;
        desc += ` [${conn.transitTime.min / 1000}-${conn.transitTime.max / 1000}s transit]`;
        if (conn.bidirectional) desc += ' [bidirectional]';
        lines.push(desc);
      }
    }
  }

  return lines.join('\n');
}

/** Generates context for a specific movement between cameras */
export function generateMovementContext(
  topology: CameraTopology,
  fromCameraId: string,
  toCameraId: string,
  objectClass: string
): string {
  const fromCamera = findCamera(topology, fromCameraId);
  const toCamera = findCamera(topology, toCameraId);
  const connection = findConnection(topology, fromCameraId, toCameraId);

  if (!fromCamera || !toCamera) {
    return `${objectClass} moving between cameras`;
  }

  const lines: string[] = [];

  // Source context
  lines.push(`Origin: ${fromCamera.name}`);
  if (fromCamera.context?.coverageDescription) {
    lines.push(`  Coverage: ${fromCamera.context.coverageDescription}`);
  }

  // Destination context
  lines.push(`Destination: ${toCamera.name}`);
  if (toCamera.context?.coverageDescription) {
    lines.push(`  Coverage: ${toCamera.context.coverageDescription}`);
  }

  // Path context
  if (connection) {
    if (connection.name) lines.push(`Path: ${connection.name}`);
    if (connection.pathLandmarks && connection.pathLandmarks.length > 0) {
      const landmarkNames = connection.pathLandmarks
        .map(id => findLandmark(topology, id)?.name)
        .filter(Boolean);
      if (landmarkNames.length > 0) {
        lines.push(`Passing: ${landmarkNames.join(' → ')}`);
      }
    }
  }

  // Nearby landmarks at destination
  const destLandmarks = getLandmarksVisibleFromCamera(topology, toCameraId);
  if (destLandmarks.length > 0) {
    lines.push(`Near: ${destLandmarks.map(l => l.name).join(', ')}`);
  }

  return lines.join('\n');
}
