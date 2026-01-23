/**
 * Topology Discovery Engine
 * Uses vision LLM to analyze camera snapshots and discover topology elements
 */

import sdk, {
  ScryptedInterface,
  Camera,
  MediaObject,
  ScryptedDevice,
} from '@scrypted/sdk';
import {
  DiscoveryConfig,
  DEFAULT_DISCOVERY_CONFIG,
  SceneAnalysis,
  DiscoveredLandmark,
  DiscoveredZone,
  EdgeAnalysis,
  TopologyCorrelation,
  SharedLandmark,
  SuggestedConnection,
  DiscoverySuggestion,
  DiscoveryStatus,
  DEFAULT_DISCOVERY_STATUS,
  RATE_LIMIT_WARNING_THRESHOLD,
  DistanceEstimate,
  distanceToFeet,
} from '../models/discovery';
import {
  CameraTopology,
  CameraNode,
  Landmark,
  findCamera,
} from '../models/topology';
import { mediaObjectToBase64, buildImageContent, ImageData, LlmProvider, isVisionFormatError } from './spatial-reasoning';

const { systemManager } = sdk;

/** Interface for ChatCompletion devices */
interface ChatCompletionDevice extends ScryptedDevice {
  getChatCompletion?(params: any): Promise<any>;
}

/** Scene analysis prompt for single camera */
const SCENE_ANALYSIS_PROMPT = `You are analyzing a security camera image. Describe EVERYTHING you can see in detail.

## INSTRUCTIONS
Look at this image carefully and identify ALL visible objects, structures, and areas. Be thorough - even small or partially visible items are important for security awareness.

## 1. LANDMARKS - List EVERY distinct object or feature you can see:

**Structures** (buildings, parts of buildings):
- Houses, garages, sheds, porches, decks, patios, carports, gazebos
- Walls, pillars, columns, railings, stairs, steps

**Vegetation** (plants, trees, landscaping):
- Trees (describe type if identifiable: oak, palm, pine, etc.)
- Bushes, shrubs, hedges
- Flower beds, gardens, planters, potted plants
- Grass/lawn areas, mulch beds

**Boundaries & Barriers**:
- Fences (wood, chain-link, aluminum, vinyl, iron, privacy)
- Walls (brick, stone, concrete, retaining)
- Gates, gate posts
- Hedges used as boundaries

**Access Points & Pathways**:
- Doors (front, side, garage, screen)
- Driveways (concrete, asphalt, gravel, pavers)
- Walkways, sidewalks, paths, stepping stones
- Stairs, ramps, porches

**Utility & Fixtures**:
- Mailboxes, package boxes
- Light fixtures, lamp posts, solar lights
- A/C units, utility boxes, meters
- Trash cans, recycling bins
- Hoses, spigots, sprinklers

**Outdoor Items**:
- Vehicles (cars, trucks, motorcycles, boats, trailers)
- Furniture (chairs, tables, benches, swings)
- Grills, fire pits, outdoor kitchens
- Play equipment, trampolines, pools
- Decorations, flags, signs

**Off-Property Elements** (important for security context):
- Street, road, sidewalk
- Neighbor's property/fence/house
- Public areas visible

For EACH landmark, estimate its DISTANCE from the camera:
- "close" = 0-10 feet (within arm's reach of camera)
- "near" = 10-30 feet
- "medium" = 30-60 feet
- "far" = 60-100 feet
- "distant" = 100+ feet (edge of property or beyond)

## 2. ZONES - Identify distinct AREAS visible:
- Front yard, backyard, side yard
- Driveway, parking area
- Patio, deck, porch
- Garden area, lawn
- Street/road
- Neighbor's yard

For each zone, provide:
- coverage: percentage of the image it covers (0.0 to 1.0)
- distance: how far the CENTER of the zone is from camera ("close", "near", "medium", "far", "distant")
- boundingBox: [x, y, width, height] in normalized coordinates (0-1) where the zone appears in the image

## 3. EDGES - What's at each edge of the frame:
This helps understand what's just out of view.

## 4. CAMERA CONTEXT:
- Estimated mounting height (ground level, 8ft, 12ft, roofline, etc.)
- Approximate field of view (narrow, medium, wide)
- Facing direction if determinable (north, south, street-facing, etc.)

Respond with ONLY valid JSON:
{
  "landmarks": [
    {"name": "Mailbox", "type": "feature", "distance": "medium", "confidence": 0.95, "description": "Black metal mailbox on wooden post, approximately 40 feet from camera"},
    {"name": "Aluminum Fence", "type": "boundary", "distance": "near", "confidence": 0.9, "description": "Silver aluminum fence running along left side of property, about 15-20 feet away"},
    {"name": "Large Oak Tree", "type": "feature", "distance": "far", "confidence": 0.85, "description": "Mature oak tree near property line, roughly 80 feet from camera"}
  ],
  "zones": [
    {"name": "Front Yard", "type": "yard", "coverage": 0.5, "distance": "medium", "boundingBox": [0.2, 0.4, 0.6, 0.4], "description": "Grass lawn with some bare patches"},
    {"name": "Driveway", "type": "driveway", "coverage": 0.25, "distance": "near", "boundingBox": [0.6, 0.5, 0.3, 0.4], "description": "Concrete driveway leading to garage"},
    {"name": "Street", "type": "street", "coverage": 0.1, "distance": "distant", "boundingBox": [0.0, 0.1, 1.0, 0.15], "description": "Public road beyond property line"}
  ],
  "edges": {
    "top": "sky, tree canopy",
    "left": "aluminum fence, neighbor's yard beyond",
    "right": "side of house, garage door",
    "bottom": "concrete walkway, grass edge"
  },
  "cameraContext": {
    "mountHeight": "8 feet",
    "fieldOfView": "wide",
    "facingDirection": "street-facing"
  }
}

BE THOROUGH. List every distinct item you can identify. A typical outdoor scene should have 5-15+ landmarks.`;

/** Multi-camera correlation prompt */
const CORRELATION_PROMPT = `I have detailed scene analyses from multiple security cameras at the same property. Help me understand which landmarks appear in multiple camera views.

CAMERA SCENES:
{scenes}

## PRIORITY ORDER (most important first):

### 1. SHARED LANDMARKS (HIGHEST PRIORITY)
Identify features that are visible from MULTIPLE cameras. This is crucial for understanding the property layout.
- Look for the SAME fence, tree, mailbox, driveway, structure, etc. appearing in different camera views
- Even partial visibility counts (e.g., a tree visible in full from one camera and just the edge from another)
- Include landmarks that are at the boundary between camera views

### 2. PROPERTY LAYOUT
Based on what each camera sees and their overlapping features, describe:
- Which areas each camera covers
- How the cameras relate spatially (e.g., "Camera A looks toward Camera B's direction")
- Overall property shape and features

### 3. CONNECTIONS (Lower Priority)
Only if clearly determinable, suggest walking paths between camera views.

IMPORTANT: For camera references, use the EXACT device ID shown in parentheses (e.g., "device_123"), NOT the camera name.

Respond with ONLY valid JSON:
{
  "sharedLandmarks": [
    {"name": "Aluminum Fence", "type": "boundary", "seenByCameras": ["device_123", "device_456"], "confidence": 0.85, "description": "Silver aluminum fence visible on right edge of Camera A and left edge of Camera B"},
    {"name": "Large Oak Tree", "type": "feature", "seenByCameras": ["device_123", "device_789"], "confidence": 0.9, "description": "Mature oak tree in front yard, visible from both front and side cameras"},
    {"name": "Concrete Driveway", "type": "access", "seenByCameras": ["device_123", "device_456", "device_789"], "confidence": 0.95, "description": "Driveway visible from multiple angles"}
  ],
  "connections": [
    {"from": "device_123", "to": "device_456", "transitSeconds": 8, "via": "along driveway", "confidence": 0.6, "bidirectional": true}
  ],
  "layoutDescription": "Ranch-style house. Front camera covers front yard and street. Garage camera covers driveway entrance. Side camera covers side yard with aluminum fence separating from neighbor. Backyard camera shows deck and pool area."
}`;

export class TopologyDiscoveryEngine {
  private config: DiscoveryConfig;
  private console: Console;
  private topology: CameraTopology | null = null;
  private llmDevice: ChatCompletionDevice | null = null;
  private llmSearched: boolean = false;
  private llmProviderType: LlmProvider = 'unknown';

  // Scene analysis cache (camera ID -> analysis)
  private sceneCache: Map<string, SceneAnalysis> = new Map();

  // Pending suggestions for user review
  private suggestions: Map<string, DiscoverySuggestion> = new Map();

  // Discovery status
  private status: DiscoveryStatus = { ...DEFAULT_DISCOVERY_STATUS };

  // Periodic discovery timer
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<DiscoveryConfig>, console: Console) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.console = console;
  }

  /** Update configuration */
  updateConfig(config: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart periodic discovery if config changed
    if (this.status.isRunning) {
      this.stopPeriodicDiscovery();
      if (this.config.discoveryIntervalHours > 0) {
        this.startPeriodicDiscovery();
      }
    }
  }

  /** Update topology reference */
  updateTopology(topology: CameraTopology): void {
    this.topology = topology;
  }

  /** Get current status */
  getStatus(): DiscoveryStatus {
    return { ...this.status };
  }

  /** Get list of LLMs excluded for lack of vision support */
  getExcludedVisionLlmNames(): string[] {
    return this.llmDevices
      .filter(l => !l.visionCapable)
      .map(l => l.name || l.id);
  }

  /** Get pending suggestions */
  getPendingSuggestions(): DiscoverySuggestion[] {
    return Array.from(this.suggestions.values())
      .filter(s => s.status === 'pending')
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Get cached scene analysis for a camera */
  getSceneAnalysis(cameraId: string): SceneAnalysis | null {
    return this.sceneCache.get(cameraId) || null;
  }

  /** Check if rate limit warning should be shown */
  shouldShowRateLimitWarning(): boolean {
    return this.config.discoveryIntervalHours > 0 &&
           this.config.discoveryIntervalHours < RATE_LIMIT_WARNING_THRESHOLD;
  }

  /** Check if discovery is enabled */
  isEnabled(): boolean {
    return this.config.discoveryIntervalHours > 0;
  }

  // Load balancing for multiple LLMs
  private llmDevices: Array<{
    device: ChatCompletionDevice;
    id: string;
    name: string;
    providerType: LlmProvider;
    lastUsed: number;
    errorCount: number;
    visionCapable: boolean;
  }> = [];

  /** Find ALL LLM devices for load balancing */
  private async findAllLlmDevices(): Promise<void> {
    if (this.llmSearched) return;
    this.llmSearched = true;

    try {
      for (const id of Object.keys(systemManager.getSystemState())) {
        const device = systemManager.getDeviceById(id);
        if (!device) continue;

        if (device.interfaces?.includes('ChatCompletion')) {
          const deviceName = device.name?.toLowerCase() || '';

          let providerType: LlmProvider = 'unknown';
          if (deviceName.includes('openai') || deviceName.includes('gpt')) {
            providerType = 'openai';
          } else if (deviceName.includes('anthropic') || deviceName.includes('claude')) {
            providerType = 'anthropic';
          } else if (deviceName.includes('ollama') || deviceName.includes('gemini') ||
                     deviceName.includes('google') || deviceName.includes('llama')) {
            providerType = 'openai';
          }

          this.llmDevices.push({
            device: device as unknown as ChatCompletionDevice,
            id,
            name: device.name || id,
            providerType,
            lastUsed: 0,
            errorCount: 0,
            visionCapable: true,
          });

          this.console.log(`[Discovery] Found LLM: ${device.name}`);
        }
      }

      if (this.llmDevices.length === 0) {
        this.console.warn('[Discovery] No ChatCompletion devices found. Vision-based discovery unavailable.');
      } else {
        this.console.log(`[Discovery] Load balancing across ${this.llmDevices.length} LLM device(s)`);
      }
    } catch (e) {
      this.console.error('[Discovery] Error finding LLM devices:', e);
    }
  }

  /** Find LLM device with ChatCompletion interface - uses load balancing */
  private async findLlmDevice(): Promise<ChatCompletionDevice | null> {
    await this.findAllLlmDevices();

    if (this.llmDevices.length === 0) return null;

    // If only one LLM, just use it
    if (this.llmDevices.length === 1) {
      const llm = this.llmDevices[0];
      this.llmDevice = llm.device;
      this.llmProviderType = llm.providerType;
      return llm.device;
    }

    // Find the LLM with oldest lastUsed time (least recently used)
    let bestIndex = 0;
    let bestScore = Infinity;

    for (let i = 0; i < this.llmDevices.length; i++) {
      const llm = this.llmDevices[i];
      const score = llm.lastUsed + (llm.errorCount * 60000);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const selected = this.llmDevices[bestIndex];
    this.llmDevice = selected.device;
    this.llmProviderType = selected.providerType;

    // Mark as used
    selected.lastUsed = Date.now();

    this.console.log(`[Discovery] Selected LLM: ${selected.name}`);
    return selected.device;
  }

  /** Select an LLM device, excluding any IDs if provided */
  private async selectLlmDevice(excludeIds: Set<string>): Promise<ChatCompletionDevice | null> {
    await this.findAllLlmDevices();

    if (this.llmDevices.length === 0) return null;

    let bestIndex = -1;
    let bestScore = Infinity;

    for (let i = 0; i < this.llmDevices.length; i++) {
      const llm = this.llmDevices[i];
      if (excludeIds.has(llm.id)) continue;
      if (!llm.visionCapable) continue;
      const score = llm.lastUsed + (llm.errorCount * 60000);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) return null;

    const selected = this.llmDevices[bestIndex];
    this.llmDevice = selected.device;
    this.llmProviderType = selected.providerType;
    selected.lastUsed = Date.now();

    this.console.log(`[Discovery] Selected LLM: ${selected.name}`);
    return selected.device;
  }

  private isRetryableLlmError(error: any): boolean {
    const errorStr = String(error).toLowerCase();
    return (
      errorStr.includes('404') ||
      errorStr.includes('not found') ||
      errorStr.includes('no such model') ||
      errorStr.includes('model not found') ||
      errorStr.includes('endpoint')
    );
  }

  /** Mark an LLM as having an error */
  private markLlmError(device: ChatCompletionDevice): void {
    const llm = this.llmDevices.find(l => l.device === device);
    if (llm) {
      llm.errorCount++;
      this.console.log(`[Discovery] ${llm.name} error count: ${llm.errorCount}`);
    }
  }

  /** Get camera snapshot as ImageData */
  private async getCameraSnapshot(cameraId: string): Promise<ImageData | null> {
    try {
      const camera = systemManager.getDeviceById<Camera>(cameraId);
      if (!camera?.interfaces?.includes(ScryptedInterface.Camera)) {
        this.console.warn(`[Discovery] Camera ${cameraId} doesn't have Camera interface`);
        return null;
      }

      this.console.log(`[Discovery] Taking snapshot from camera: ${camera.name || cameraId}`);
      const mediaObject = await camera.takePicture();

      if (!mediaObject) {
        this.console.warn(`[Discovery] takePicture() returned null for ${camera.name}`);
        return null;
      }

      this.console.log(`[Discovery] MediaObject received: mimeType=${mediaObject.mimeType}`);

      const imageData = await mediaObjectToBase64(mediaObject);

      if (!imageData) {
        this.console.warn(`[Discovery] Failed to convert MediaObject to base64 for ${camera.name}`);
      }

      return imageData;
    } catch (e) {
      this.console.warn(`[Discovery] Failed to get snapshot from camera ${cameraId}:`, e);
      return null;
    }
  }

  /** Analyze a single camera's scene */
  async analyzeScene(cameraId: string): Promise<SceneAnalysis> {
    const camera = this.topology ? findCamera(this.topology, cameraId) : null;
    const cameraName = camera?.name || cameraId;

    const analysis: SceneAnalysis = {
      cameraId,
      cameraName,
      timestamp: Date.now(),
      landmarks: [],
      zones: [],
      edges: { top: '', left: '', right: '', bottom: '' },
      orientation: 'unknown',
      potentialOverlaps: [],
      isValid: false,
    };

    const imageData = await this.getCameraSnapshot(cameraId);
    if (!imageData) {
      analysis.error = 'Failed to capture camera snapshot';
      return analysis;
    }

    await this.findAllLlmDevices();
    const excludeIds = new Set<string>();
    let lastError: any = null;
    const maxAttempts = Math.max(1, this.llmDevices.length || 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const llm = await this.selectLlmDevice(excludeIds);
      if (!llm?.getChatCompletion) {
        analysis.error = 'No LLM device available';
        return analysis;
      }

      let allFormatsVisionError = false;

      // Try with detected provider format first, then fallback to alternates
      // The order matters: try the most likely formats first
      const formatsToTry: LlmProvider[] = [];

      // Start with detected format
      formatsToTry.push(this.llmProviderType);

      // Add fallbacks based on detected provider
      if (this.llmProviderType === 'openai') {
        formatsToTry.push('scrypted', 'anthropic');
      } else if (this.llmProviderType === 'anthropic') {
        formatsToTry.push('scrypted', 'openai');
      } else if (this.llmProviderType === 'scrypted') {
        formatsToTry.push('anthropic', 'openai');
      } else {
        // Unknown - try all formats
        formatsToTry.push('scrypted', 'anthropic', 'openai');
      }

      let visionFormatFailures = 0;
      for (const formatType of formatsToTry) {
        try {
          this.console.log(`[Discovery] Trying ${formatType} image format for ${cameraName}...`);

        // Build prompt with camera context (height)
        const cameraNode = this.topology ? findCamera(this.topology, cameraId) : null;
        const mountHeight = cameraNode?.context?.mountHeight || 8;
        const cameraRange = (cameraNode?.fov as any)?.range || 80;

        // Add camera-specific context to the prompt
        const contextPrefix = `CAMERA INFORMATION:
- Camera Name: ${cameraName}
- Mount Height: ${mountHeight} feet above ground
- Approximate viewing range: ${cameraRange} feet

Use the mount height to help estimate distances - objects at ground level will appear at different angles depending on distance from a camera mounted at ${mountHeight} feet.

`;

        // Build multimodal message with provider-specific image format
          const result = await llm.getChatCompletion({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: contextPrefix + SCENE_ANALYSIS_PROMPT },
                buildImageContent(imageData, formatType),
              ],
            },
          ],
          max_tokens: 4000, // Increased for detailed scene analysis
          temperature: 0.3,
        });

          const content = result?.choices?.[0]?.message?.content;
          if (content && typeof content === 'string') {
            try {
              // Extract JSON from response (handle markdown code blocks)
              let jsonStr = content.trim();
              if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
              }

              // Try to recover truncated JSON
              const parsed = this.parseJsonWithRecovery(jsonStr, cameraName);

              // Map parsed data to our types
              if (Array.isArray(parsed.landmarks)) {
                analysis.landmarks = parsed.landmarks.map((l: any) => ({
                  name: l.name || 'Unknown',
                  type: this.mapLandmarkType(l.type),
                  confidence: typeof l.confidence === 'number' ? l.confidence : 0.7,
                  distance: this.mapDistance(l.distance),
                  description: l.description || '',
                  boundingBox: l.boundingBox,
                }));
              }

              if (Array.isArray(parsed.zones)) {
                analysis.zones = parsed.zones.map((z: any) => ({
                  name: z.name || 'Unknown',
                  type: this.mapZoneType(z.type),
                  coverage: typeof z.coverage === 'number' ? z.coverage : 0.5,
                  description: z.description || '',
                  boundingBox: z.boundingBox,
                  distance: this.mapDistance(z.distance), // Parse distance for zones too
                } as DiscoveredZone & { distance?: DistanceEstimate }));
              }

              if (parsed.edges && typeof parsed.edges === 'object') {
                analysis.edges = {
                  top: parsed.edges.top || '',
                  left: parsed.edges.left || '',
                  right: parsed.edges.right || '',
                  bottom: parsed.edges.bottom || '',
                };
              }

              if (parsed.orientation) {
                analysis.orientation = this.mapOrientation(parsed.orientation);
              }

              analysis.isValid = true;
              this.console.log(`[Discovery] Analyzed ${cameraName}: ${analysis.landmarks.length} landmarks, ${analysis.zones.length} zones (using ${formatType} format)`);

              // Update the preferred format for future requests
              if (formatType !== this.llmProviderType) {
                this.console.log(`[Discovery] Switching to ${formatType} format for future requests`);
                this.llmProviderType = formatType;
              }

              // Success - exit the retry loop
              return analysis;
            } catch (parseError) {
              this.console.warn(`[Discovery] Failed to parse LLM response for ${cameraName}:`, parseError);
              analysis.error = 'Failed to parse LLM response';
              return analysis;
            }
          }
        } catch (e) {
          lastError = e;

          // Check if this is a vision/multimodal format error
          if (isVisionFormatError(e)) {
            this.console.warn(`[Discovery] ${formatType} format failed, trying fallback...`);
            visionFormatFailures++;
            continue; // Try next format
          }

          // Retry with a different LLM if error indicates bad endpoint/model
          if (this.isRetryableLlmError(e)) {
            this.console.warn(`[Discovery] LLM error for ${cameraName}, trying another provider...`);
            this.markLlmError(llm);
            const llmEntry = this.llmDevices.find(d => d.device === llm);
            if (llmEntry) {
              excludeIds.add(llmEntry.id);
            }
            break;
          }

          // Not a format error - don't retry
          this.console.warn(`[Discovery] Scene analysis failed for ${cameraName}:`, e);
          break;
        }
      }

      allFormatsVisionError = visionFormatFailures > 0 && visionFormatFailures === formatsToTry.length;
      if (allFormatsVisionError) {
        const llmEntry = this.llmDevices.find(d => d.device === llm);
        if (llmEntry) {
          llmEntry.visionCapable = false;
          excludeIds.add(llmEntry.id);
          this.console.warn(`[Discovery] ${llmEntry.name} does not support vision. Excluding from discovery.`);
        }
      }
    }

    // All formats failed
    if (lastError) {
      // Track error for load balancing
      // Note: llm may be null here if no device was available
      if (lastError && !this.isRetryableLlmError(lastError)) {
        // Best-effort error accounting for the most recent device
        const lastDevice = this.llmDevice;
        if (lastDevice) {
          this.markLlmError(lastDevice);
        }
      }

      const errorStr = String(lastError);
      if (isVisionFormatError(lastError)) {
        analysis.error = 'Vision/image analysis failed with all formats. Ensure you have a vision-capable model (e.g., gpt-4o, gpt-4-turbo, claude-3-sonnet) configured and the @scrypted/llm plugin supports vision.';
      } else {
        analysis.error = `Analysis failed: ${errorStr}`;
      }
    }

    // Cache the analysis
    this.sceneCache.set(cameraId, analysis);

    return analysis;
  }

  /** Map LLM landmark type to our type */
  private mapLandmarkType(type: string): import('../models/topology').LandmarkType {
    const typeMap: Record<string, import('../models/topology').LandmarkType> = {
      structure: 'structure',
      feature: 'feature',
      boundary: 'boundary',
      access: 'access',
      vehicle: 'vehicle',
      neighbor: 'neighbor',
      zone: 'zone',
      street: 'street',
    };
    return typeMap[type?.toLowerCase()] || 'feature';
  }

  /** Map LLM zone type to our type */
  private mapZoneType(type: string): import('../models/discovery').DiscoveredZoneType {
    const typeMap: Record<string, import('../models/discovery').DiscoveredZoneType> = {
      yard: 'yard',
      driveway: 'driveway',
      street: 'street',
      patio: 'patio',
      deck: 'patio',
      walkway: 'walkway',
      parking: 'parking',
      garden: 'garden',
      pool: 'pool',
    };
    return typeMap[type?.toLowerCase()] || 'unknown';
  }

  /** Map LLM orientation to our type */
  private mapOrientation(orientation: string): SceneAnalysis['orientation'] {
    const dir = orientation?.toLowerCase();
    if (dir?.includes('north') && dir?.includes('east')) return 'northeast';
    if (dir?.includes('north') && dir?.includes('west')) return 'northwest';
    if (dir?.includes('south') && dir?.includes('east')) return 'southeast';
    if (dir?.includes('south') && dir?.includes('west')) return 'southwest';
    if (dir?.includes('north')) return 'north';
    if (dir?.includes('south')) return 'south';
    if (dir?.includes('east')) return 'east';
    if (dir?.includes('west')) return 'west';
    return 'unknown';
  }

  /** Map LLM distance to our type */
  private mapDistance(distance: string): DistanceEstimate {
    const dist = distance?.toLowerCase();
    if (dist?.includes('close')) return 'close';
    if (dist?.includes('near')) return 'near';
    if (dist?.includes('medium')) return 'medium';
    if (dist?.includes('far') && !dist?.includes('distant')) return 'far';
    if (dist?.includes('distant')) return 'distant';
    return 'medium'; // Default to medium if not specified
  }

  /** Get default distance in feet based on zone type */
  private getDefaultZoneDistance(zoneType: string): number {
    switch (zoneType) {
      case 'patio':
      case 'walkway':
        return 10; // Close zones
      case 'driveway':
      case 'parking':
        return 25; // Near zones
      case 'yard':
      case 'garden':
      case 'pool':
        return 40; // Medium zones
      case 'street':
        return 100; // Far zones
      case 'unknown':
      default:
        return 50; // Default to medium distance
    }
  }

  /** Try to parse JSON with recovery for truncated responses */
  private parseJsonWithRecovery(jsonStr: string, context: string): any {
    // First, try direct parse
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // Log the raw response for debugging (first 500 chars)
      this.console.log(`[Discovery] Raw LLM response for ${context} (first 500 chars): ${jsonStr.substring(0, 500)}...`);
    }

    // Try to recover truncated JSON by finding complete sections
    try {
      // Find where valid JSON might end (look for last complete object/array)
      let recoveredJson = jsonStr;

      // Try to close unclosed strings
      const lastQuote = recoveredJson.lastIndexOf('"');
      const lastColon = recoveredJson.lastIndexOf(':');
      if (lastQuote > lastColon) {
        // We might be in the middle of a string value
        const beforeQuote = recoveredJson.substring(0, lastQuote);
        const afterLastCompleteEntry = beforeQuote.lastIndexOf('},');
        if (afterLastCompleteEntry > 0) {
          recoveredJson = beforeQuote.substring(0, afterLastCompleteEntry + 1);
        }
      }

      // Close any unclosed arrays/objects
      let openBraces = (recoveredJson.match(/{/g) || []).length;
      let closeBraces = (recoveredJson.match(/}/g) || []).length;
      let openBrackets = (recoveredJson.match(/\[/g) || []).length;
      let closeBrackets = (recoveredJson.match(/\]/g) || []).length;

      // Add missing closing brackets/braces
      while (closeBrackets < openBrackets) {
        recoveredJson += ']';
        closeBrackets++;
      }
      while (closeBraces < openBraces) {
        recoveredJson += '}';
        closeBraces++;
      }

      const recovered = JSON.parse(recoveredJson);
      this.console.log(`[Discovery] Recovered truncated JSON for ${context}`);
      return recovered;
    } catch (recoveryError) {
      // Last resort: try to extract just landmarks array
      try {
        const landmarksMatch = jsonStr.match(/"landmarks"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
        const zonesMatch = jsonStr.match(/"zones"\s*:\s*\[([\s\S]*?)(?:\]|$)/);

        const result: any = { landmarks: [], zones: [], edges: {}, orientation: 'unknown' };

        if (landmarksMatch) {
          // Try to parse individual landmark objects
          const landmarksStr = landmarksMatch[1];
          const landmarkObjects = landmarksStr.match(/\{[^{}]*\}/g) || [];
          result.landmarks = landmarkObjects.map((obj: string) => {
            try {
              return JSON.parse(obj);
            } catch {
              return null;
            }
          }).filter(Boolean);
          this.console.log(`[Discovery] Extracted ${result.landmarks.length} landmarks from partial response for ${context}`);
        }

        if (zonesMatch) {
          const zonesStr = zonesMatch[1];
          const zoneObjects = zonesStr.match(/\{[^{}]*\}/g) || [];
          result.zones = zoneObjects.map((obj: string) => {
            try {
              return JSON.parse(obj);
            } catch {
              return null;
            }
          }).filter(Boolean);
          this.console.log(`[Discovery] Extracted ${result.zones.length} zones from partial response for ${context}`);
        }

        if (result.landmarks.length > 0 || result.zones.length > 0) {
          return result;
        }
      } catch (extractError) {
        // Give up
      }

      this.console.warn(`[Discovery] Could not recover JSON for ${context}`);
      throw new Error(`Failed to parse LLM response: truncated or malformed JSON`);
    }
  }

  /** Resolve a camera reference (name or deviceId) to its deviceId */
  private resolveCameraRef(ref: string): string | null {
    if (!this.topology?.cameras || !ref) return null;

    // Try exact deviceId match first
    const byId = this.topology.cameras.find(c => c.deviceId === ref);
    if (byId) return byId.deviceId;

    // Try exact name match
    const byName = this.topology.cameras.find(c => c.name === ref);
    if (byName) return byName.deviceId;

    // Try case-insensitive name match
    const refLower = ref.toLowerCase();
    const byNameLower = this.topology.cameras.find(c => c.name.toLowerCase() === refLower);
    if (byNameLower) return byNameLower.deviceId;

    // Try partial name match (LLM might truncate or abbreviate)
    const byPartial = this.topology.cameras.find(c =>
      c.name.toLowerCase().includes(refLower) || refLower.includes(c.name.toLowerCase())
    );
    if (byPartial) return byPartial.deviceId;

    this.console.warn(`[Discovery] Could not resolve camera reference: "${ref}"`);
    return null;
  }

  /** Normalize camera references in an array to deviceIds */
  private normalizeCameraRefs(refs: string[]): string[] {
    return refs
      .map(ref => this.resolveCameraRef(ref))
      .filter((id): id is string => id !== null);
  }

  /** Analyze all cameras and correlate findings */
  async runFullDiscovery(): Promise<TopologyCorrelation | null> {
    if (!this.topology?.cameras?.length) {
      this.console.warn('[Discovery] No cameras in topology');
      return null;
    }

    this.status.isScanning = true;
    this.status.lastError = undefined;

    try {
      this.console.log(`[Discovery] Starting full discovery scan of ${this.topology.cameras.length} cameras`);

      // Analyze each camera
      const analyses: SceneAnalysis[] = [];
      for (const camera of this.topology.cameras) {
        const analysis = await this.analyzeScene(camera.deviceId);
        if (analysis.isValid) {
          analyses.push(analysis);
        }
        // Rate limit - wait 2 seconds between cameras
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.status.camerasAnalyzed = analyses.length;
      this.console.log(`[Discovery] Analyzed ${analyses.length} cameras successfully`);

      // Handle case where no cameras were successfully analyzed
      if (analyses.length === 0) {
        this.console.warn('[Discovery] No cameras were successfully analyzed');
        this.status.lastError = 'No cameras were successfully analyzed - check LLM configuration';
        this.status.lastScanTime = Date.now();
        return null;
      }

      // ALWAYS generate suggestions from each camera's analysis first
      // This ensures landmarks and zones from individual cameras are captured
      for (const analysis of analyses) {
        this.generateSuggestionsFromAnalysis(analysis);
      }
      this.console.log(`[Discovery] Generated suggestions from ${analyses.length} camera analyses`);

      // Then correlate if we have multiple cameras (adds shared landmarks and connections)
      let correlation: TopologyCorrelation | null = null;
      if (analyses.length >= 2) {
        correlation = await this.correlateScenes(analyses);
        if (correlation) {
          this.generateSuggestionsFromCorrelation(correlation);
        }
      }

      this.status.lastScanTime = Date.now();
      this.status.pendingSuggestions = this.getPendingSuggestions().length;

      return correlation;
    } catch (e) {
      this.console.error('[Discovery] Full discovery failed:', e);
      this.status.lastError = `Discovery failed: ${e}`;
      return null;
    } finally {
      this.status.isScanning = false;
    }
  }

  /** Correlate scenes from multiple cameras */
  private async correlateScenes(analyses: SceneAnalysis[]): Promise<TopologyCorrelation | null> {
    const llm = await this.findLlmDevice();
    if (!llm?.getChatCompletion) {
      return null;
    }

    try {
      // Build scenes description for prompt
      const scenesText = analyses.map(a => {
        const landmarkList = a.landmarks.map(l => `${l.name} (${l.type})`).join(', ');
        const zoneList = a.zones.map(z => `${z.name} (${z.type}, ${Math.round(z.coverage * 100)}%)`).join(', ');
        return `Camera "${a.cameraName}" (${a.cameraId}):
  - Landmarks: ${landmarkList || 'None identified'}
  - Zones: ${zoneList || 'None identified'}
  - Edges: Top=${a.edges.top}, Left=${a.edges.left}, Right=${a.edges.right}, Bottom=${a.edges.bottom}
  - Orientation: ${a.orientation}`;
      }).join('\n\n');

      const prompt = CORRELATION_PROMPT.replace('{scenes}', scenesText);

      const result = await llm.getChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.4,
      });

      const content = result?.choices?.[0]?.message?.content;
      if (content && typeof content === 'string') {
        try {
          let jsonStr = content.trim();
          if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
          }

          const parsed = JSON.parse(jsonStr);

          const correlation: TopologyCorrelation = {
            sharedLandmarks: [],
            suggestedConnections: [],
            layoutDescription: parsed.layoutDescription || '',
            timestamp: Date.now(),
          };

          if (Array.isArray(parsed.sharedLandmarks)) {
            correlation.sharedLandmarks = parsed.sharedLandmarks.map((l: any) => {
              // Normalize camera references to deviceIds
              const rawRefs = Array.isArray(l.seenByCameras) ? l.seenByCameras : [];
              const normalizedRefs = this.normalizeCameraRefs(rawRefs);
              if (rawRefs.length > 0 && normalizedRefs.length === 0) {
                this.console.warn(`[Discovery] Landmark "${l.name}" has no resolvable camera refs: ${JSON.stringify(rawRefs)}`);
              }
              return {
                name: l.name || 'Unknown',
                type: this.mapLandmarkType(l.type),
                seenByCameras: normalizedRefs,
                confidence: typeof l.confidence === 'number' ? l.confidence : 0.7,
                description: l.description,
              };
            });
          }

          if (Array.isArray(parsed.connections)) {
            correlation.suggestedConnections = parsed.connections.map((c: any) => {
              // Normalize camera references to deviceIds
              const fromRef = c.from || c.fromCameraId || '';
              const toRef = c.to || c.toCameraId || '';
              const fromId = this.resolveCameraRef(fromRef);
              const toId = this.resolveCameraRef(toRef);
              if (!fromId || !toId) {
                this.console.warn(`[Discovery] Connection has unresolvable camera refs: from="${fromRef}" to="${toRef}"`);
              }
              return {
                fromCameraId: fromId || fromRef,
                toCameraId: toId || toRef,
                transitSeconds: typeof c.transitSeconds === 'number' ? c.transitSeconds : 15,
                via: c.via || '',
                confidence: typeof c.confidence === 'number' ? c.confidence : 0.6,
                bidirectional: c.bidirectional !== false,
              };
            });
          }

          this.console.log(`[Discovery] Correlation found ${correlation.sharedLandmarks.length} shared landmarks, ${correlation.suggestedConnections.length} connections`);

          return correlation;
        } catch (parseError) {
          this.console.warn('[Discovery] Failed to parse correlation response:', parseError);
        }
      }
    } catch (e) {
      this.console.warn('[Discovery] Correlation failed:', e);
    }

    return null;
  }

  /** Generate suggestions from a single camera analysis */
  private generateSuggestionsFromAnalysis(analysis: SceneAnalysis): void {
    if (!analysis.isValid) return;

    this.console.log(`[Discovery] Generating suggestions from ${analysis.landmarks.length} landmarks, ${analysis.zones.length} zones`);

    // Generate landmark suggestions
    for (const landmark of analysis.landmarks) {
      if (landmark.confidence >= this.config.minLandmarkConfidence) {
        // Calculate distance in feet from distance estimate
        const distanceFeet = landmark.distance ? distanceToFeet(landmark.distance) : 50;

        const suggestion: DiscoverySuggestion = {
          id: `landmark_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'landmark',
          timestamp: Date.now(),
          sourceCameras: [analysis.cameraId],
          confidence: landmark.confidence,
          status: 'pending',
          landmark: {
            name: landmark.name,
            type: landmark.type,
            description: landmark.description,
            visibleFromCameras: [analysis.cameraId],
            // Include extra metadata for positioning
            boundingBox: landmark.boundingBox,
            distance: landmark.distance,
            distanceFeet: distanceFeet,
          } as any, // Extra metadata not in base Landmark interface
        };
        this.suggestions.set(suggestion.id, suggestion);
        this.console.log(`[Discovery] Landmark suggestion: ${landmark.name} (${landmark.type}, ${landmark.distance || 'medium'}, ~${distanceFeet}ft)`);
      }
    }

    // Generate zone suggestions (even for smaller coverage - 10% is enough)
    for (const zone of analysis.zones) {
      if (zone.coverage >= 0.1) {
        // Calculate distance in feet from distance estimate (for zones with distance info)
        const zoneWithDist = zone as DiscoveredZone & { distance?: DistanceEstimate };
        const distanceFeet = zoneWithDist.distance ? distanceToFeet(zoneWithDist.distance) : this.getDefaultZoneDistance(zone.type);

        const suggestion: DiscoverySuggestion = {
          id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'zone',
          timestamp: Date.now(),
          sourceCameras: [analysis.cameraId],
          confidence: Math.min(0.9, 0.5 + zone.coverage), // Higher coverage = higher confidence
          status: 'pending',
          zone: {
            ...zone,
            // Include distance metadata for positioning
            distanceFeet: distanceFeet,
          } as any,
        };
        this.suggestions.set(suggestion.id, suggestion);
        this.console.log(`[Discovery] Zone suggestion: ${zone.name} (${zone.type}, ${Math.round(zone.coverage * 100)}% coverage, ~${distanceFeet}ft)`);
      }
    }
  }

  /** Generate suggestions from multi-camera correlation */
  private generateSuggestionsFromCorrelation(correlation: TopologyCorrelation): void {
    // Generate landmark suggestions from shared landmarks
    for (const shared of correlation.sharedLandmarks) {
      const suggestion: DiscoverySuggestion = {
        id: `shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'landmark',
        timestamp: Date.now(),
        sourceCameras: shared.seenByCameras,
        confidence: shared.confidence,
        status: 'pending',
        landmark: {
          name: shared.name,
          type: shared.type,
          description: shared.description,
          visibleFromCameras: shared.seenByCameras,
        },
      };
      this.suggestions.set(suggestion.id, suggestion);
    }

    // Generate connection suggestions
    for (const conn of correlation.suggestedConnections) {
      const suggestion: DiscoverySuggestion = {
        id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'connection',
        timestamp: Date.now(),
        sourceCameras: [conn.fromCameraId, conn.toCameraId],
        confidence: conn.confidence,
        status: 'pending',
        connection: conn,
      };
      this.suggestions.set(suggestion.id, suggestion);
    }
  }

  /** Accept a suggestion */
  acceptSuggestion(suggestionId: string): DiscoverySuggestion | null {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== 'pending') return null;

    suggestion.status = 'accepted';
    this.status.pendingSuggestions = this.getPendingSuggestions().length;

    return suggestion;
  }

  /** Reject a suggestion */
  rejectSuggestion(suggestionId: string): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.status !== 'pending') return false;

    suggestion.status = 'rejected';
    this.status.pendingSuggestions = this.getPendingSuggestions().length;

    return true;
  }

  /** Start periodic discovery */
  startPeriodicDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
    }

    if (this.config.discoveryIntervalHours <= 0) {
      this.console.log('[Discovery] Periodic discovery disabled (interval = 0)');
      return;
    }

    this.status.isRunning = true;
    const intervalMs = this.config.discoveryIntervalHours * 60 * 60 * 1000;

    this.console.log(`[Discovery] Starting periodic discovery every ${this.config.discoveryIntervalHours} hours`);

    // Schedule next scan
    this.status.nextScanTime = Date.now() + intervalMs;

    this.discoveryTimer = setInterval(async () => {
      if (!this.status.isScanning) {
        await this.runFullDiscovery();
        this.status.nextScanTime = Date.now() + intervalMs;
      }
    }, intervalMs);
  }

  /** Stop periodic discovery */
  stopPeriodicDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }

    this.status.isRunning = false;
    this.status.nextScanTime = null;

    this.console.log('[Discovery] Stopped periodic discovery');
  }

  /** Clear all cached data and suggestions */
  clearCache(): void {
    this.sceneCache.clear();
    this.suggestions.clear();
    this.status.pendingSuggestions = 0;
    this.status.camerasAnalyzed = 0;
  }
}
