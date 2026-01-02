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
} from '../models/discovery';
import {
  CameraTopology,
  CameraNode,
  Landmark,
  findCamera,
} from '../models/topology';
import { mediaObjectToBase64, buildImageContent, ImageData, LlmProvider, isVisionNotSupportedError } from './spatial-reasoning';

const { systemManager } = sdk;

/** Interface for ChatCompletion devices */
interface ChatCompletionDevice extends ScryptedDevice {
  getChatCompletion?(params: any): Promise<any>;
}

/** Scene analysis prompt for single camera */
const SCENE_ANALYSIS_PROMPT = `Analyze this security camera image and identify what you see.

1. LANDMARKS - Identify fixed features visible:
   - Structures (house, garage, shed, porch, deck)
   - Features (mailbox, tree, pool, garden, fountain)
   - Access points (door, gate, driveway entrance, walkway)
   - Boundaries (fence, wall, hedge)

2. ZONES - Identify area types visible:
   - What type of area is this? (front yard, backyard, driveway, street, patio, walkway)
   - Estimate what percentage of the frame each zone covers (0.0 to 1.0)

3. EDGES - What's visible at the frame edges:
   - Top edge: (sky, roof, trees, etc.)
   - Left edge: (fence, neighbor, street, etc.)
   - Right edge: (fence, garage, etc.)
   - Bottom edge: (ground, driveway, grass, etc.)

4. ORIENTATION - Estimate camera facing direction based on shadows, sun position, or landmarks

Respond with ONLY valid JSON in this exact format:
{
  "landmarks": [
    {"name": "Front Door", "type": "access", "confidence": 0.9, "description": "White front door with black frame"}
  ],
  "zones": [
    {"name": "Front Yard", "type": "yard", "coverage": 0.4, "description": "Grass lawn area"}
  ],
  "edges": {"top": "sky with clouds", "left": "fence and trees", "right": "garage wall", "bottom": "concrete walkway"},
  "orientation": "north"
}`;

/** Multi-camera correlation prompt */
const CORRELATION_PROMPT = `I have scene analyses from multiple security cameras at the same property. Help me correlate them to understand the property layout.

CAMERA SCENES:
{scenes}

Identify:
1. Shared landmarks - Features that appear in multiple camera views
2. Camera connections - How someone could move between camera views and estimated walking time
3. Overall layout - Describe the property layout based on what you see

Respond with ONLY valid JSON:
{
  "sharedLandmarks": [
    {"name": "Driveway", "type": "access", "seenByCameras": ["camera1", "camera2"], "confidence": 0.8, "description": "Concrete driveway"}
  ],
  "connections": [
    {"from": "camera1", "to": "camera2", "transitSeconds": 10, "via": "driveway", "confidence": 0.7, "bidirectional": true}
  ],
  "layoutDescription": "Single-story house with front yard facing street, driveway on the left side, backyard accessible through side gate"
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

  /** Find LLM device with ChatCompletion interface */
  private async findLlmDevice(): Promise<ChatCompletionDevice | null> {
    if (this.llmDevice) return this.llmDevice;
    if (this.llmSearched) return null;

    this.llmSearched = true;

    try {
      for (const id of Object.keys(systemManager.getSystemState())) {
        const device = systemManager.getDeviceById(id);
        if (!device) continue;

        if (device.interfaces?.includes('ChatCompletion')) {
          const deviceName = device.name?.toLowerCase() || '';

          // Detect provider type for image format selection
          if (deviceName.includes('openai') || deviceName.includes('gpt')) {
            this.llmProviderType = 'openai';
          } else if (deviceName.includes('anthropic') || deviceName.includes('claude')) {
            this.llmProviderType = 'anthropic';
          } else if (deviceName.includes('ollama') || deviceName.includes('gemini') ||
                     deviceName.includes('google') || deviceName.includes('llama')) {
            // These providers use OpenAI-compatible format
            this.llmProviderType = 'openai';
          } else {
            this.llmProviderType = 'unknown';
          }

          this.llmDevice = device as unknown as ChatCompletionDevice;
          this.console.log(`[Discovery] Connected to LLM: ${device.name}`);
          this.console.log(`[Discovery] Image format: ${this.llmProviderType}`);
          return this.llmDevice;
        }
      }

      this.console.warn('[Discovery] No ChatCompletion device found. Vision-based discovery unavailable.');
    } catch (e) {
      this.console.error('[Discovery] Error finding LLM device:', e);
    }

    return null;
  }

  /** Get camera snapshot as ImageData */
  private async getCameraSnapshot(cameraId: string): Promise<ImageData | null> {
    try {
      const camera = systemManager.getDeviceById<Camera>(cameraId);
      if (!camera?.interfaces?.includes(ScryptedInterface.Camera)) {
        return null;
      }

      const mediaObject = await camera.takePicture();
      return mediaObjectToBase64(mediaObject);
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

    const llm = await this.findLlmDevice();
    if (!llm?.getChatCompletion) {
      analysis.error = 'No LLM device available';
      return analysis;
    }

    const imageData = await this.getCameraSnapshot(cameraId);
    if (!imageData) {
      analysis.error = 'Failed to capture camera snapshot';
      return analysis;
    }

    // Try with detected provider format first, then fallback to alternate format
    const formatsToTry: LlmProvider[] = [this.llmProviderType];

    // Add fallback format
    if (this.llmProviderType === 'openai') {
      formatsToTry.push('anthropic');
    } else if (this.llmProviderType === 'anthropic') {
      formatsToTry.push('openai');
    } else {
      // Unknown - try both
      formatsToTry.push('openai');
    }

    let lastError: any = null;

    for (const formatType of formatsToTry) {
      try {
        this.console.log(`[Discovery] Trying ${formatType} image format for ${cameraName}...`);

        // Build multimodal message with provider-specific image format
        const result = await llm.getChatCompletion({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: SCENE_ANALYSIS_PROMPT },
                buildImageContent(imageData, formatType),
              ],
            },
          ],
          max_tokens: 500,
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

            const parsed = JSON.parse(jsonStr);

            // Map parsed data to our types
            if (Array.isArray(parsed.landmarks)) {
              analysis.landmarks = parsed.landmarks.map((l: any) => ({
                name: l.name || 'Unknown',
                type: this.mapLandmarkType(l.type),
                confidence: typeof l.confidence === 'number' ? l.confidence : 0.7,
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
              }));
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
        if (isVisionNotSupportedError(e)) {
          this.console.warn(`[Discovery] ${formatType} format not supported, trying fallback...`);
          continue; // Try next format
        }

        // Not a format error - don't retry
        this.console.warn(`[Discovery] Scene analysis failed for ${cameraName}:`, e);
        break;
      }
    }

    // All formats failed
    if (lastError) {
      const errorStr = String(lastError);
      if (isVisionNotSupportedError(lastError)) {
        analysis.error = 'Vision/image analysis not supported by configured LLM. Ensure you have a vision-capable model (e.g., gpt-4o, gpt-4-turbo, claude-3-sonnet) configured.';
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

      // Correlate if we have multiple cameras
      let correlation: TopologyCorrelation | null = null;
      if (analyses.length >= 2) {
        correlation = await this.correlateScenes(analyses);
        if (correlation) {
          this.generateSuggestionsFromCorrelation(correlation);
        }
      } else if (analyses.length === 1) {
        // Single camera - generate suggestions from its analysis
        this.generateSuggestionsFromAnalysis(analyses[0]);
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
        max_tokens: 800,
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
            correlation.sharedLandmarks = parsed.sharedLandmarks.map((l: any) => ({
              name: l.name || 'Unknown',
              type: this.mapLandmarkType(l.type),
              seenByCameras: Array.isArray(l.seenByCameras) ? l.seenByCameras : [],
              confidence: typeof l.confidence === 'number' ? l.confidence : 0.7,
              description: l.description,
            }));
          }

          if (Array.isArray(parsed.connections)) {
            correlation.suggestedConnections = parsed.connections.map((c: any) => ({
              fromCameraId: c.from || c.fromCameraId || '',
              toCameraId: c.to || c.toCameraId || '',
              transitSeconds: typeof c.transitSeconds === 'number' ? c.transitSeconds : 15,
              via: c.via || '',
              confidence: typeof c.confidence === 'number' ? c.confidence : 0.6,
              bidirectional: c.bidirectional !== false,
            }));
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

    // Generate landmark suggestions
    for (const landmark of analysis.landmarks) {
      if (landmark.confidence >= this.config.minLandmarkConfidence) {
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
          },
        };
        this.suggestions.set(suggestion.id, suggestion);
      }
    }

    // Generate zone suggestions
    for (const zone of analysis.zones) {
      if (zone.coverage >= 0.2) {
        const suggestion: DiscoverySuggestion = {
          id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'zone',
          timestamp: Date.now(),
          sourceCameras: [analysis.cameraId],
          confidence: 0.7,
          status: 'pending',
          zone: zone,
        };
        this.suggestions.set(suggestion.id, suggestion);
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
