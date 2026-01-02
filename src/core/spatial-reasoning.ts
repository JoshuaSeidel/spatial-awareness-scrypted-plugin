/**
 * Spatial Reasoning Engine
 * Uses RAG (Retrieval Augmented Generation) to provide rich contextual understanding
 * of movement across the property topology
 */

import sdk, {
  ScryptedInterface,
  ObjectDetection,
  Camera,
  MediaObject,
} from '@scrypted/sdk';
import {
  CameraTopology,
  CameraNode,
  Landmark,
  findCamera,
  findLandmark,
  findConnection,
  getLandmarksVisibleFromCamera,
  generateTopologyDescription,
  generateMovementContext,
  LandmarkSuggestion,
  LANDMARK_TEMPLATES,
} from '../models/topology';
import { TrackedObject, ObjectSighting } from '../models/tracked-object';

const { systemManager } = sdk;

/** Configuration for the spatial reasoning engine */
export interface SpatialReasoningConfig {
  /** Enable LLM-based descriptions */
  enableLlm: boolean;
  /** Enable landmark learning/suggestions */
  enableLandmarkLearning: boolean;
  /** Minimum confidence for landmark suggestions */
  landmarkConfidenceThreshold: number;
  /** Cache TTL for topology context (ms) */
  contextCacheTtl: number;
}

/** Result of a spatial reasoning query */
export interface SpatialReasoningResult {
  /** Rich description of the movement */
  description: string;
  /** Landmarks involved in the movement */
  involvedLandmarks: Landmark[];
  /** Suggested path description */
  pathDescription?: string;
  /** Confidence in the reasoning (0-1) */
  confidence: number;
  /** Whether LLM was used */
  usedLlm: boolean;
}

/** Context chunk for RAG retrieval */
interface ContextChunk {
  id: string;
  type: 'camera' | 'landmark' | 'connection' | 'property';
  content: string;
  metadata: Record<string, any>;
}

export class SpatialReasoningEngine {
  private config: SpatialReasoningConfig;
  private console: Console;
  private topology: CameraTopology | null = null;
  private llmDevice: ObjectDetection | null = null;
  private contextChunks: ContextChunk[] = [];
  private topologyContextCache: string | null = null;
  private contextCacheTime: number = 0;
  private landmarkSuggestions: Map<string, LandmarkSuggestion> = new Map();

  constructor(config: SpatialReasoningConfig, console: Console) {
    this.config = config;
    this.console = console;
  }

  /** Update the topology and rebuild context */
  updateTopology(topology: CameraTopology): void {
    this.topology = topology;
    this.rebuildContextChunks();
    this.topologyContextCache = null;
    this.contextCacheTime = 0;
  }

  /** Build context chunks for RAG retrieval */
  private rebuildContextChunks(): void {
    if (!this.topology) return;

    this.contextChunks = [];

    // Property context
    if (this.topology.property) {
      this.contextChunks.push({
        id: 'property',
        type: 'property',
        content: this.buildPropertyContext(),
        metadata: { ...this.topology.property },
      });
    }

    // Camera contexts
    for (const camera of this.topology.cameras) {
      this.contextChunks.push({
        id: `camera_${camera.deviceId}`,
        type: 'camera',
        content: this.buildCameraContext(camera),
        metadata: {
          deviceId: camera.deviceId,
          name: camera.name,
          isEntryPoint: camera.isEntryPoint,
          isExitPoint: camera.isExitPoint,
        },
      });
    }

    // Landmark contexts
    for (const landmark of this.topology.landmarks || []) {
      this.contextChunks.push({
        id: `landmark_${landmark.id}`,
        type: 'landmark',
        content: this.buildLandmarkContext(landmark),
        metadata: {
          id: landmark.id,
          name: landmark.name,
          type: landmark.type,
          isEntryPoint: landmark.isEntryPoint,
          isExitPoint: landmark.isExitPoint,
        },
      });
    }

    // Connection contexts
    for (const connection of this.topology.connections) {
      this.contextChunks.push({
        id: `connection_${connection.id}`,
        type: 'connection',
        content: this.buildConnectionContext(connection),
        metadata: {
          id: connection.id,
          fromCameraId: connection.fromCameraId,
          toCameraId: connection.toCameraId,
        },
      });
    }

    this.console.log(`Built ${this.contextChunks.length} context chunks for spatial reasoning`);
  }

  /** Build property context string */
  private buildPropertyContext(): string {
    if (!this.topology?.property) return '';
    const p = this.topology.property;
    const parts: string[] = [];

    if (p.propertyType) parts.push(`Property type: ${p.propertyType}`);
    if (p.description) parts.push(p.description);
    if (p.frontFacing) parts.push(`Front faces ${p.frontFacing}`);
    if (p.features?.length) parts.push(`Features: ${p.features.join(', ')}`);

    return parts.join('. ');
  }

  /** Build camera context string */
  private buildCameraContext(camera: CameraNode): string {
    const parts: string[] = [`Camera: ${camera.name}`];

    if (camera.context?.mountLocation) {
      parts.push(`Mounted at: ${camera.context.mountLocation}`);
    }
    if (camera.context?.coverageDescription) {
      parts.push(`Coverage: ${camera.context.coverageDescription}`);
    }
    if (camera.context?.mountHeight) {
      parts.push(`Height: ${camera.context.mountHeight} feet`);
    }
    if (camera.isEntryPoint) parts.push('Watches property entry point');
    if (camera.isExitPoint) parts.push('Watches property exit point');

    // Visible landmarks
    if (this.topology && camera.context?.visibleLandmarks?.length) {
      const landmarkNames = camera.context.visibleLandmarks
        .map(id => findLandmark(this.topology!, id)?.name)
        .filter(Boolean);
      if (landmarkNames.length) {
        parts.push(`Can see: ${landmarkNames.join(', ')}`);
      }
    }

    return parts.join('. ');
  }

  /** Build landmark context string */
  private buildLandmarkContext(landmark: Landmark): string {
    const parts: string[] = [`${landmark.name} (${landmark.type})`];

    if (landmark.description) parts.push(landmark.description);
    if (landmark.isEntryPoint) parts.push('Property entry point');
    if (landmark.isExitPoint) parts.push('Property exit point');

    // Adjacent landmarks
    if (this.topology && landmark.adjacentTo?.length) {
      const adjacentNames = landmark.adjacentTo
        .map(id => findLandmark(this.topology!, id)?.name)
        .filter(Boolean);
      if (adjacentNames.length) {
        parts.push(`Adjacent to: ${adjacentNames.join(', ')}`);
      }
    }

    return parts.join('. ');
  }

  /** Build connection context string */
  private buildConnectionContext(connection: any): string {
    if (!this.topology) return '';

    const fromCamera = findCamera(this.topology, connection.fromCameraId);
    const toCamera = findCamera(this.topology, connection.toCameraId);

    if (!fromCamera || !toCamera) return '';

    const parts: string[] = [
      `Path from ${fromCamera.name} to ${toCamera.name}`,
    ];

    if (connection.name) parts.push(`Called: ${connection.name}`);

    const transitSecs = Math.round(connection.transitTime.typical / 1000);
    parts.push(`Typical transit: ${transitSecs} seconds`);

    if (connection.bidirectional) parts.push('Bidirectional path');

    // Path landmarks
    if (connection.pathLandmarks?.length) {
      const landmarkNames = connection.pathLandmarks
        .map((id: string) => findLandmark(this.topology!, id)?.name)
        .filter(Boolean);
      if (landmarkNames.length) {
        parts.push(`Passes: ${landmarkNames.join(' → ')}`);
      }
    }

    return parts.join('. ');
  }

  /** Get cached or generate topology description */
  private getTopologyContext(): string {
    const now = Date.now();
    if (this.topologyContextCache && (now - this.contextCacheTime) < this.config.contextCacheTtl) {
      return this.topologyContextCache;
    }

    if (!this.topology) return '';

    this.topologyContextCache = generateTopologyDescription(this.topology);
    this.contextCacheTime = now;

    return this.topologyContextCache;
  }

  /** Retrieve relevant context chunks for a movement query */
  private retrieveRelevantContext(
    fromCameraId: string,
    toCameraId: string
  ): ContextChunk[] {
    const relevant: ContextChunk[] = [];

    // Always include property context
    const propertyChunk = this.contextChunks.find(c => c.type === 'property');
    if (propertyChunk) relevant.push(propertyChunk);

    // Include both camera contexts
    const fromChunk = this.contextChunks.find(c => c.id === `camera_${fromCameraId}`);
    const toChunk = this.contextChunks.find(c => c.id === `camera_${toCameraId}`);
    if (fromChunk) relevant.push(fromChunk);
    if (toChunk) relevant.push(toChunk);

    // Include direct connection if exists
    const connectionChunk = this.contextChunks.find(c =>
      c.type === 'connection' &&
      ((c.metadata.fromCameraId === fromCameraId && c.metadata.toCameraId === toCameraId) ||
       (c.metadata.fromCameraId === toCameraId && c.metadata.toCameraId === fromCameraId))
    );
    if (connectionChunk) relevant.push(connectionChunk);

    // Include visible landmarks from both cameras
    if (this.topology) {
      const fromLandmarks = getLandmarksVisibleFromCamera(this.topology, fromCameraId);
      const toLandmarks = getLandmarksVisibleFromCamera(this.topology, toCameraId);
      const allLandmarkIds = new Set([
        ...fromLandmarks.map(l => l.id),
        ...toLandmarks.map(l => l.id),
      ]);

      for (const landmarkId of allLandmarkIds) {
        const chunk = this.contextChunks.find(c => c.id === `landmark_${landmarkId}`);
        if (chunk) relevant.push(chunk);
      }
    }

    return relevant;
  }

  /** Find or initialize LLM device */
  private async findLlmDevice(): Promise<ObjectDetection | null> {
    if (this.llmDevice) return this.llmDevice;

    try {
      for (const id of Object.keys(systemManager.getSystemState())) {
        const device = systemManager.getDeviceById(id);
        if (device?.interfaces?.includes(ScryptedInterface.ObjectDetection)) {
          const name = device.name?.toLowerCase() || '';
          if (name.includes('llm') || name.includes('gpt') || name.includes('claude') ||
              name.includes('ollama') || name.includes('gemini')) {
            this.llmDevice = device as unknown as ObjectDetection;
            this.console.log(`Found LLM device: ${device.name}`);
            return this.llmDevice;
          }
        }
      }
    } catch (e) {
      this.console.warn('Error finding LLM device:', e);
    }

    return null;
  }

  /** Generate entry description when object enters property */
  generateEntryDescription(
    tracked: TrackedObject,
    cameraId: string
  ): SpatialReasoningResult {
    if (!this.topology) {
      return {
        description: `${this.capitalizeFirst(tracked.className)} entered property`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    const camera = findCamera(this.topology, cameraId);
    if (!camera) {
      return {
        description: `${this.capitalizeFirst(tracked.className)} entered property`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    const landmarks = getLandmarksVisibleFromCamera(this.topology, cameraId);
    const objectType = this.capitalizeFirst(tracked.className);

    // Build entry description using topology context
    const location = this.describeLocation(camera, landmarks, 'to');

    // Check if we can determine where they came from (e.g., street, neighbor)
    const entryLandmark = landmarks.find(l => l.isEntryPoint);
    const streetLandmark = landmarks.find(l => l.type === 'street');
    const neighborLandmark = landmarks.find(l => l.type === 'neighbor');

    let source = '';
    if (streetLandmark) {
      source = ` from ${streetLandmark.name}`;
    } else if (neighborLandmark) {
      source = ` from ${neighborLandmark.name}`;
    }

    return {
      description: `${objectType} arrived at ${location}${source}`,
      involvedLandmarks: landmarks,
      confidence: 0.8,
      usedLlm: false,
    };
  }

  /** Generate exit description when object leaves property */
  generateExitDescription(
    tracked: TrackedObject,
    cameraId: string
  ): SpatialReasoningResult {
    if (!this.topology) {
      return {
        description: `${this.capitalizeFirst(tracked.className)} left property`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    const camera = findCamera(this.topology, cameraId);
    if (!camera) {
      return {
        description: `${this.capitalizeFirst(tracked.className)} left property`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    const landmarks = getLandmarksVisibleFromCamera(this.topology, cameraId);
    const objectType = this.capitalizeFirst(tracked.className);

    // Build exit description
    const location = this.describeLocation(camera, landmarks, 'from');

    // Check for exit point landmarks
    const exitLandmark = landmarks.find(l => l.isExitPoint);
    const streetLandmark = landmarks.find(l => l.type === 'street');

    let destination = '';
    if (streetLandmark) {
      destination = ` towards ${streetLandmark.name}`;
    } else if (exitLandmark) {
      destination = ` via ${exitLandmark.name}`;
    }

    // Include time on property if available
    const dwellTime = Math.round((tracked.lastSeen - tracked.firstSeen) / 1000);
    let timeContext = '';
    if (dwellTime > 60) {
      timeContext = ` after ${Math.round(dwellTime / 60)}m on property`;
    } else if (dwellTime > 10) {
      timeContext = ` after ${dwellTime}s`;
    }

    // Summarize journey if they visited multiple cameras
    let journeyContext = '';
    if (tracked.journey.length > 0) {
      const cameraNames = [tracked.entryCameraName || 'entrance'];
      for (const segment of tracked.journey) {
        if (segment.toCameraName && !cameraNames.includes(segment.toCameraName)) {
          cameraNames.push(segment.toCameraName);
        }
      }
      if (cameraNames.length > 1) {
        // Simplify camera names
        const simplified = cameraNames.map(n => this.inferAreaFromCameraName(n) || n);
        journeyContext = ` — visited ${simplified.join(' → ')}`;
      }
    }

    return {
      description: `${objectType} left ${location}${destination}${timeContext}${journeyContext}`,
      involvedLandmarks: landmarks,
      confidence: 0.8,
      usedLlm: false,
    };
  }

  /** Generate rich movement description using LLM */
  async generateMovementDescription(
    tracked: TrackedObject,
    fromCameraId: string,
    toCameraId: string,
    transitTime: number,
    mediaObject?: MediaObject
  ): Promise<SpatialReasoningResult> {
    if (!this.topology) {
      return {
        description: `${tracked.className} moving between cameras`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    const fromCamera = findCamera(this.topology, fromCameraId);
    const toCamera = findCamera(this.topology, toCameraId);

    if (!fromCamera || !toCamera) {
      return {
        description: `${tracked.className} moving between cameras`,
        involvedLandmarks: [],
        confidence: 0.5,
        usedLlm: false,
      };
    }

    // Get involved landmarks
    const fromLandmarks = getLandmarksVisibleFromCamera(this.topology, fromCameraId);
    const toLandmarks = getLandmarksVisibleFromCamera(this.topology, toCameraId);
    const allLandmarks = [...new Set([...fromLandmarks, ...toLandmarks])];

    // Build basic description without LLM
    let basicDescription = this.buildBasicDescription(
      tracked,
      fromCamera,
      toCamera,
      transitTime,
      fromLandmarks,
      toLandmarks
    );

    // Try LLM for enhanced description
    if (this.config.enableLlm && mediaObject) {
      const llmDescription = await this.getLlmEnhancedDescription(
        tracked,
        fromCamera,
        toCamera,
        transitTime,
        fromLandmarks,
        toLandmarks,
        mediaObject
      );

      if (llmDescription) {
        return {
          description: llmDescription,
          involvedLandmarks: allLandmarks,
          pathDescription: this.buildPathDescription(fromCamera, toCamera),
          confidence: 0.9,
          usedLlm: true,
        };
      }
    }

    return {
      description: basicDescription,
      involvedLandmarks: allLandmarks,
      pathDescription: this.buildPathDescription(fromCamera, toCamera),
      confidence: 0.7,
      usedLlm: false,
    };
  }

  /** Build basic movement description without LLM */
  private buildBasicDescription(
    tracked: TrackedObject,
    fromCamera: CameraNode,
    toCamera: CameraNode,
    transitTime: number,
    fromLandmarks: Landmark[],
    toLandmarks: Landmark[]
  ): string {
    const objectType = this.capitalizeFirst(tracked.className);
    const transitSecs = Math.round(transitTime / 1000);

    // Get connection for path context
    const connection = this.topology ? findConnection(this.topology, fromCamera.deviceId, toCamera.deviceId) : null;

    // Build origin description using landmarks, camera context, or camera name
    let origin = this.describeLocation(fromCamera, fromLandmarks, 'from');

    // Build destination description
    let destination = this.describeLocation(toCamera, toLandmarks, 'to');

    // Check if we have a named path/connection
    let pathContext = '';
    if (connection?.name) {
      pathContext = ` via ${connection.name}`;
    } else if (connection?.pathLandmarks?.length && this.topology) {
      const pathNames = connection.pathLandmarks
        .map(id => findLandmark(this.topology!, id)?.name)
        .filter(Boolean);
      if (pathNames.length > 0) {
        pathContext = ` past ${pathNames.join(' and ')}`;
      }
    }

    // Include journey context if this is not the first camera
    let journeyContext = '';
    if (tracked.journey.length > 0) {
      const totalTime = Math.round((Date.now() - tracked.firstSeen) / 1000);
      if (totalTime > 60) {
        journeyContext = ` (${Math.round(totalTime / 60)}m on property)`;
      }
    }

    // Determine movement verb based on transit time and object type
    const verb = this.getMovementVerb(tracked.className, transitSecs);

    return `${objectType} ${verb} ${origin} heading ${destination}${pathContext}${journeyContext}`;
  }

  /** Describe a location using landmarks, camera context, or camera name */
  private describeLocation(camera: CameraNode, landmarks: Landmark[], direction: 'from' | 'to'): string {
    // Priority 1: Use entry/exit landmarks
    const entryExitLandmark = landmarks.find(l =>
      (direction === 'from' && l.isExitPoint) || (direction === 'to' && l.isEntryPoint)
    );
    if (entryExitLandmark) {
      return direction === 'from' ? `the ${entryExitLandmark.name}` : `the ${entryExitLandmark.name}`;
    }

    // Priority 2: Use access landmarks (driveway, walkway, etc.)
    const accessLandmark = landmarks.find(l => l.type === 'access');
    if (accessLandmark) {
      return `the ${accessLandmark.name}`;
    }

    // Priority 3: Use zone landmarks (front yard, back yard)
    const zoneLandmark = landmarks.find(l => l.type === 'zone');
    if (zoneLandmark) {
      return `the ${zoneLandmark.name}`;
    }

    // Priority 4: Use any landmark
    if (landmarks.length > 0) {
      return `near ${landmarks[0].name}`;
    }

    // Priority 5: Use camera coverage description
    if (camera.context?.coverageDescription) {
      const desc = camera.context.coverageDescription.split('.')[0].toLowerCase();
      return `the ${desc}`;
    }

    // Priority 6: Infer from camera name (e.g., "Front Door Camera" -> "front door area")
    const cameraArea = this.inferAreaFromCameraName(camera.name);
    if (cameraArea) {
      return `the ${cameraArea}`;
    }

    // Fallback: Just use camera name
    return direction === 'from' ? `${camera.name} area` : `towards ${camera.name}`;
  }

  /** Infer area name from camera name */
  private inferAreaFromCameraName(cameraName: string): string | null {
    const name = cameraName.toLowerCase();
    // Remove common camera suffixes
    const cleaned = name
      .replace(/\s*(camera|cam|nvr|ipc|poe)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length > 0 && cleaned !== cameraName.toLowerCase()) {
      return cleaned;
    }
    return null;
  }

  /** Get appropriate movement verb based on context */
  private getMovementVerb(className: string, transitSecs: number): string {
    if (className === 'car' || className === 'vehicle' || className === 'truck') {
      return transitSecs < 10 ? 'driving from' : 'moved from';
    }
    if (transitSecs < 5) {
      return 'walking from';
    }
    if (transitSecs < 30) {
      return 'moved from';
    }
    return 'traveled from';
  }

  /** Build path description from connection */
  private buildPathDescription(fromCamera: CameraNode, toCamera: CameraNode): string | undefined {
    if (!this.topology) return undefined;

    const connection = findConnection(this.topology, fromCamera.deviceId, toCamera.deviceId);
    if (!connection) return undefined;

    if (connection.pathLandmarks?.length) {
      const landmarkNames = connection.pathLandmarks
        .map(id => findLandmark(this.topology!, id)?.name)
        .filter(Boolean);
      if (landmarkNames.length) {
        return `Via ${landmarkNames.join(' → ')}`;
      }
    }

    return connection.name || undefined;
  }

  /** Get LLM-enhanced description */
  private async getLlmEnhancedDescription(
    tracked: TrackedObject,
    fromCamera: CameraNode,
    toCamera: CameraNode,
    transitTime: number,
    fromLandmarks: Landmark[],
    toLandmarks: Landmark[],
    mediaObject: MediaObject
  ): Promise<string | null> {
    const llm = await this.findLlmDevice();
    if (!llm) return null;

    try {
      // Retrieve relevant context for RAG
      const relevantChunks = this.retrieveRelevantContext(
        fromCamera.deviceId,
        toCamera.deviceId
      );

      // Build RAG context
      const ragContext = relevantChunks.map(c => c.content).join('\n\n');

      // Build the prompt
      const prompt = this.buildLlmPrompt(
        tracked,
        fromCamera,
        toCamera,
        transitTime,
        fromLandmarks,
        toLandmarks,
        ragContext
      );

      // Call LLM
      const result = await llm.detectObjects(mediaObject, {
        settings: { prompt }
      } as any);

      // Extract description from result
      if (result.detections?.[0]?.label) {
        return result.detections[0].label;
      }

      return null;
    } catch (e) {
      this.console.warn('LLM description generation failed:', e);
      return null;
    }
  }

  /** Build LLM prompt with RAG context */
  private buildLlmPrompt(
    tracked: TrackedObject,
    fromCamera: CameraNode,
    toCamera: CameraNode,
    transitTime: number,
    fromLandmarks: Landmark[],
    toLandmarks: Landmark[],
    ragContext: string
  ): string {
    const transitSecs = Math.round(transitTime / 1000);

    return `You are a security camera system describing movement on a property.

PROPERTY CONTEXT:
${ragContext}

CURRENT EVENT:
- Object type: ${tracked.className}
- Moving from: ${fromCamera.name}${fromLandmarks.length ? ` (near ${fromLandmarks.map(l => l.name).join(', ')})` : ''}
- Moving to: ${toCamera.name}${toLandmarks.length ? ` (near ${toLandmarks.map(l => l.name).join(', ')})` : ''}
- Transit time: ${transitSecs} seconds

INSTRUCTIONS:
Generate a single, concise sentence describing this movement. Include:
1. Description of the ${tracked.className} (if person: gender, clothing; if vehicle: color, type)
2. Where they came from (using landmark names if available)
3. Where they're heading (using landmark names if available)

Examples of good descriptions:
- "Man in blue jacket walking from the driveway towards the front door"
- "Black SUV pulling into the driveway from the street"
- "Woman with dog walking from the backyard towards the side gate"
- "Delivery person approaching the front porch from the mailbox"

Generate ONLY the description, nothing else:`;
  }

  /** Suggest a new landmark based on AI analysis */
  async suggestLandmark(
    cameraId: string,
    mediaObject: MediaObject,
    objectClass: string,
    position: { x: number; y: number }
  ): Promise<LandmarkSuggestion | null> {
    if (!this.config.enableLandmarkLearning) return null;

    const llm = await this.findLlmDevice();
    if (!llm) return null;

    try {
      const prompt = `Analyze this security camera image. A ${objectClass} was detected.

Looking at the surroundings and environment, identify any notable landmarks or features visible that could help describe this location. Consider:
- Structures (house, garage, shed, porch)
- Features (mailbox, tree, pool, garden)
- Access points (driveway, walkway, gate, door)
- Boundaries (fence, wall, hedge)

If you can identify a clear landmark feature, respond with ONLY a JSON object:
{"name": "Landmark Name", "type": "structure|feature|boundary|access|vehicle|neighbor|zone|street", "description": "Brief description"}

If no clear landmark is identifiable, respond with: {"name": null}`;

      const result = await llm.detectObjects(mediaObject, {
        settings: { prompt }
      } as any);

      if (result.detections?.[0]?.label) {
        try {
          const parsed = JSON.parse(result.detections[0].label);
          if (parsed.name && parsed.type) {
            const suggestionId = `suggest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const suggestion: LandmarkSuggestion = {
              id: suggestionId,
              landmark: {
                id: `landmark_${Date.now()}`,
                name: parsed.name,
                type: parsed.type,
                position,
                description: parsed.description,
                aiSuggested: true,
                aiConfidence: 0.7,
                visibleFromCameras: [cameraId],
              },
              detectedByCameras: [cameraId],
              timestamp: Date.now(),
              detectionCount: 1,
              status: 'pending',
            };

            // Store suggestion
            const existingKey = this.findSimilarSuggestion(parsed.name, position);
            if (existingKey) {
              // Increment count for similar suggestion
              const existing = this.landmarkSuggestions.get(existingKey)!;
              existing.detectionCount++;
              existing.landmark.aiConfidence = Math.min(0.95, existing.landmark.aiConfidence! + 0.05);
              if (!existing.detectedByCameras.includes(cameraId)) {
                existing.detectedByCameras.push(cameraId);
              }
              return existing;
            } else {
              this.landmarkSuggestions.set(suggestionId, suggestion);
              return suggestion;
            }
          }
        } catch (parseError) {
          // LLM didn't return valid JSON
        }
      }

      return null;
    } catch (e) {
      this.console.warn('Landmark suggestion failed:', e);
      return null;
    }
  }

  /** Find similar existing suggestion by name proximity and position */
  private findSimilarSuggestion(name: string, position: { x: number; y: number }): string | null {
    const nameLower = name.toLowerCase();
    const POSITION_THRESHOLD = 100; // pixels

    for (const [key, suggestion] of this.landmarkSuggestions) {
      if (suggestion.status !== 'pending') continue;

      const suggestionName = suggestion.landmark.name.toLowerCase();
      const distance = Math.sqrt(
        Math.pow(suggestion.landmark.position.x - position.x, 2) +
        Math.pow(suggestion.landmark.position.y - position.y, 2)
      );

      // Similar name and nearby position
      if ((suggestionName.includes(nameLower) || nameLower.includes(suggestionName)) &&
          distance < POSITION_THRESHOLD) {
        return key;
      }
    }

    return null;
  }

  /** Get pending landmark suggestions above confidence threshold */
  getPendingSuggestions(): LandmarkSuggestion[] {
    return Array.from(this.landmarkSuggestions.values())
      .filter(s =>
        s.status === 'pending' &&
        s.landmark.aiConfidence! >= this.config.landmarkConfidenceThreshold
      )
      .sort((a, b) => b.detectionCount - a.detectionCount);
  }

  /** Accept a landmark suggestion */
  acceptSuggestion(suggestionId: string): Landmark | null {
    const suggestion = this.landmarkSuggestions.get(suggestionId);
    if (!suggestion) return null;

    suggestion.status = 'accepted';
    const landmark = { ...suggestion.landmark };
    landmark.aiSuggested = false; // Mark as confirmed

    this.landmarkSuggestions.delete(suggestionId);

    return landmark;
  }

  /** Reject a landmark suggestion */
  rejectSuggestion(suggestionId: string): boolean {
    const suggestion = this.landmarkSuggestions.get(suggestionId);
    if (!suggestion) return false;

    suggestion.status = 'rejected';
    this.landmarkSuggestions.delete(suggestionId);

    return true;
  }

  /** Utility to capitalize first letter */
  private capitalizeFirst(str: string): string {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : 'Object';
  }

  /** Get landmark templates for UI */
  getLandmarkTemplates(): typeof LANDMARK_TEMPLATES {
    return LANDMARK_TEMPLATES;
  }
}
