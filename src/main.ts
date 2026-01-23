import sdk, {
  DeviceProvider,
  DeviceCreator,
  DeviceCreatorSettings,
  Settings,
  Setting,
  SettingValue,
  ScryptedDeviceBase,
  ScryptedDeviceType,
  ScryptedInterface,
  ScryptedNativeId,
  HttpRequestHandler,
  HttpRequest,
  HttpResponse,
  Readme,
} from '@scrypted/sdk';
import { StorageSettings } from '@scrypted/sdk/storage-settings';
import * as fs from 'fs';
import * as path from 'path';
import {
  CameraTopology,
  createEmptyTopology,
  Landmark,
  LandmarkSuggestion,
  LANDMARK_TEMPLATES,
  inferRelationships,
  DrawnZoneType,
  GlobalZone,
  GlobalZoneType,
  CameraZoneMapping,
  ClipPath,
} from './models/topology';
import { TrackedObject } from './models/tracked-object';
import { Alert, AlertRule, createDefaultRules } from './models/alert';
import { TrackingState } from './state/tracking-state';
import { TrackingEngine, TrackingEngineConfig } from './core/tracking-engine';
import { AlertManager } from './alerts/alert-manager';
import { GlobalTrackerSensor } from './devices/global-tracker-sensor';
import { TrackingZone } from './devices/tracking-zone';
import { MqttPublisher, MqttConfig } from './integrations/mqtt-publisher';
import { EDITOR_HTML } from './ui/editor-html';
import { TRAINING_HTML } from './ui/training-html';
import { TrainingConfig, TrainingLandmark } from './models/training';
import { TopologyDiscoveryEngine } from './core/topology-discovery';
import { DiscoveryConfig, DiscoverySuggestion } from './models/discovery';

const { deviceManager, systemManager, mediaManager } = sdk;

const TRACKING_ZONE_PREFIX = 'tracking-zone:';
const GLOBAL_TRACKER_ID = 'global-tracker';

export class SpatialAwarenessPlugin extends ScryptedDeviceBase
  implements DeviceProvider, DeviceCreator, Settings, HttpRequestHandler, Readme {

  private trackingEngine: TrackingEngine | null = null;
  private trackingState: TrackingState;
  private alertManager: AlertManager;
  private mqttPublisher: MqttPublisher | null = null;
  private discoveryEngine: TopologyDiscoveryEngine | null = null;
  private devices: Map<string, any> = new Map();

  storageSettings = new StorageSettings(this, {
    // Topology Configuration (stored as JSON)
    topology: {
      title: 'Camera Topology',
      type: 'string',
      description: 'JSON configuration of camera relationships',
      hide: true,
    },

    // Floor plan image (stored as base64)
    floorPlanImage: {
      title: 'Floor Plan Image',
      type: 'string',
      hide: true,
    },

    // Correlation Settings
    correlationWindow: {
      title: 'Correlation Window (seconds)',
      type: 'number',
      defaultValue: 30,
      description: 'Maximum time to wait for an object to appear on connected camera',
      group: 'Tracking',
    },
    correlationThreshold: {
      title: 'Correlation Confidence Threshold',
      type: 'number',
      defaultValue: 0.35,
      description: 'Minimum confidence (0-1) for automatic object correlation. Lower values allow more matches.',
      group: 'Tracking',
    },
    lostTimeout: {
      title: 'Lost Object Timeout (seconds)',
      type: 'number',
      defaultValue: 300,
      description: 'Time before marking a tracked object as lost',
      group: 'Tracking',
    },
    useVisualMatching: {
      title: 'Use Visual Matching',
      type: 'boolean',
      defaultValue: true,
      description: 'Use visual embeddings for object correlation (requires compatible detectors)',
      group: 'Tracking',
    },
    loiteringThreshold: {
      title: 'Loitering Threshold (seconds)',
      type: 'number',
      defaultValue: 3,
      description: 'Object must be visible for this duration before triggering movement alerts',
      group: 'Tracking',
    },
    minDetectionScore: {
      title: 'Minimum Detection Confidence',
      type: 'number',
      defaultValue: 0.5,
      description: 'Minimum detection score (0-1) to consider for tracking',
      group: 'Tracking',
    },
    objectAlertCooldown: {
      title: 'Per-Object Alert Cooldown (seconds)',
      type: 'number',
      defaultValue: 30,
      description: 'Minimum time between alerts for the same tracked object',
      group: 'Tracking',
    },
    notifyOnAlertUpdates: {
      title: 'Notify on Alert Updates',
      type: 'boolean',
      defaultValue: false,
      description: 'Send notifications when an existing alert is updated (camera transitions, context changes)',
      group: 'Tracking',
    },
    alertUpdateCooldown: {
      title: 'Alert Update Cooldown (seconds)',
      type: 'number',
      defaultValue: 60,
      description: 'Minimum time between update notifications for the same tracked object (0 = no limit)',
      group: 'Tracking',
    },

    // LLM Integration
    useLlmDescriptions: {
      title: 'Use LLM for Rich Descriptions',
      type: 'boolean',
      defaultValue: true,
      description: 'Use LLM plugin (if installed) to generate descriptive alerts like "Man walking from garage towards front door"',
      group: 'AI & Spatial Reasoning',
    },
    llmDebounceInterval: {
      title: 'LLM Rate Limit (seconds)',
      type: 'number',
      defaultValue: 5,
      description: 'Minimum time between LLM calls to prevent API rate limiting. Increase if you get rate limit errors. (0 = no limit)',
      group: 'AI & Spatial Reasoning',
    },
    llmFallbackEnabled: {
      title: 'Fallback to Basic Notifications',
      type: 'boolean',
      defaultValue: true,
      description: 'When LLM is rate-limited or slow, fall back to basic notifications immediately',
      group: 'AI & Spatial Reasoning',
    },
    llmFallbackTimeout: {
      title: 'LLM Timeout (seconds)',
      type: 'number',
      defaultValue: 3,
      description: 'Maximum time to wait for LLM response before falling back to basic notification',
      group: 'AI & Spatial Reasoning',
    },
    enableTransitTimeLearning: {
      title: 'Learn Transit Times',
      type: 'boolean',
      defaultValue: true,
      description: 'Automatically adjust connection transit times based on observed movement patterns',
      group: 'AI & Spatial Reasoning',
    },
    enableConnectionSuggestions: {
      title: 'Suggest Camera Connections',
      type: 'boolean',
      defaultValue: true,
      description: 'Automatically suggest new camera connections based on observed movement patterns',
      group: 'AI & Spatial Reasoning',
    },
    enableLandmarkLearning: {
      title: 'Learn Landmarks from AI',
      type: 'boolean',
      defaultValue: true,
      description: 'Allow AI to suggest new landmarks based on detected objects and camera context',
      group: 'AI & Spatial Reasoning',
    },
    landmarkConfidenceThreshold: {
      title: 'Landmark Suggestion Confidence',
      type: 'number',
      defaultValue: 0.7,
      description: 'Minimum AI confidence (0-1) to suggest a landmark',
      group: 'AI & Spatial Reasoning',
    },

    // Auto-Topology Discovery Settings
    discoveryIntervalHours: {
      title: 'Auto-Discovery Interval (hours)',
      type: 'number',
      defaultValue: 0,
      description: 'Automatically scan cameras to discover landmarks and connections. Set to 0 to disable. Uses vision LLM to analyze camera views.',
      group: 'Auto-Topology Discovery',
    },
    minLandmarkConfidence: {
      title: 'Min Landmark Confidence',
      type: 'number',
      defaultValue: 0.6,
      description: 'Minimum confidence (0-1) for discovered landmarks',
      group: 'Auto-Topology Discovery',
    },
    minConnectionConfidence: {
      title: 'Min Connection Confidence',
      type: 'number',
      defaultValue: 0.5,
      description: 'Minimum confidence (0-1) for suggested camera connections',
      group: 'Auto-Topology Discovery',
    },
    autoAcceptThreshold: {
      title: 'Auto-Accept Threshold',
      type: 'number',
      defaultValue: 0.85,
      description: 'Suggestions above this confidence are automatically accepted (0-1)',
      group: 'Auto-Topology Discovery',
    },

    // MQTT Settings
    enableMqtt: {
      title: 'Enable MQTT',
      type: 'boolean',
      defaultValue: false,
      group: 'MQTT Integration',
    },
    mqttBroker: {
      title: 'MQTT Broker URL',
      type: 'string',
      placeholder: 'mqtt://localhost:1883',
      group: 'MQTT Integration',
    },
    mqttUsername: {
      title: 'MQTT Username',
      type: 'string',
      group: 'MQTT Integration',
    },
    mqttPassword: {
      title: 'MQTT Password',
      type: 'password',
      group: 'MQTT Integration',
    },
    mqttBaseTopic: {
      title: 'MQTT Base Topic',
      type: 'string',
      defaultValue: 'scrypted/spatial-awareness',
      group: 'MQTT Integration',
    },

    // Integrations
    llmProviders: {
      title: 'LLM Providers',
      type: 'device',
      multiple: true,
      deviceFilter: `interfaces.includes('ChatCompletion')`,
      description: 'Select which LLM providers to use (e.g., OpenAI, Claude, Ollama). Multiple providers will be load-balanced to avoid rate limits.',
      group: 'Integrations',
    },
    defaultNotifiers: {
      title: 'Notification Service',
      type: 'device',
      multiple: true,
      deviceFilter: `interfaces.includes('${ScryptedInterface.Notifier}')`,
      description: 'Select one or more notifiers to receive alerts (e.g., Pushover, Home Assistant)',
      group: 'Integrations',
    },

    // Tracked Cameras
    trackedCameras: {
      title: 'Cameras to Track',
      type: 'device',
      multiple: true,
      deviceFilter: `interfaces.includes('${ScryptedInterface.ObjectDetector}')`,
      group: 'Cameras',
      description: 'Select cameras with object detection to track',
    },
  });

  constructor(nativeId?: ScryptedNativeId) {
    super(nativeId);

    this.trackingState = new TrackingState(this.storage, this.console);
    this.alertManager = new AlertManager(this.console, this.storage);

    // Initialize on next tick to allow Scrypted to fully load
    process.nextTick(() => this.initialize());
  }

  private async initialize(): Promise<void> {
    this.console.log('Initializing Spatial Awareness Plugin');

    // Discover the global tracker device
    await deviceManager.onDeviceDiscovered({
      nativeId: GLOBAL_TRACKER_ID,
      name: 'Global Object Tracker',
      type: ScryptedDeviceType.Sensor,
      interfaces: [
        ScryptedInterface.OccupancySensor,
        ScryptedInterface.Settings,
        ScryptedInterface.Readme,
      ],
    });

    // Load topology if it exists
    const topologyJson = this.storage.getItem('topology');
    if (topologyJson) {
      try {
        const topology = JSON.parse(topologyJson) as CameraTopology;
        await this.startTrackingEngine(topology);
      } catch (e) {
        this.console.error('Failed to parse topology:', e);
      }
    }

    // Load alert rules
    const rulesJson = this.storage.getItem('alertRules');
    if (rulesJson) {
      try {
        const rules = JSON.parse(rulesJson) as AlertRule[];
        this.alertManager.setRules(rules);
      } catch (e) {
        this.console.error('Failed to parse alert rules:', e);
        this.alertManager.setRules(createDefaultRules());
      }
    } else {
      this.alertManager.setRules(createDefaultRules());
    }

    // Initialize MQTT if enabled
    if (this.storageSettings.values.enableMqtt) {
      await this.initializeMqtt();
    }

    this.applyAlertUpdateSettings();

    this.console.log('Spatial Awareness Plugin initialized');
  }

  private async initializeMqtt(): Promise<void> {
    const broker = this.storageSettings.values.mqttBroker as string;
    if (!broker) {
      this.console.warn('MQTT enabled but no broker URL configured');
      return;
    }

    const config: MqttConfig = {
      broker,
      username: this.storageSettings.values.mqttUsername as string,
      password: this.storageSettings.values.mqttPassword as string,
      baseTopic: this.storageSettings.values.mqttBaseTopic as string || 'scrypted/spatial-awareness',
    };

    this.mqttPublisher = new MqttPublisher(config, this.console);
    await this.mqttPublisher.connect();

    // Subscribe to state changes
    this.trackingState.onStateChange((objects) => {
      this.mqttPublisher?.publishState(objects);
    });

    this.console.log('MQTT publisher initialized');
  }

  private async startTrackingEngine(topology: CameraTopology): Promise<void> {
    // Stop existing engine if running
    if (this.trackingEngine) {
      await this.trackingEngine.stopTracking();
    }

    const config: TrackingEngineConfig = {
      correlationWindow: this.getNumberSetting(this.storageSettings.values.correlationWindow, 30) * 1000,
      correlationThreshold: this.getNumberSetting(this.storageSettings.values.correlationThreshold, 0.35),
      lostTimeout: this.getNumberSetting(this.storageSettings.values.lostTimeout, 300) * 1000,
      useVisualMatching: this.storageSettings.values.useVisualMatching as boolean ?? true,
      loiteringThreshold: this.getNumberSetting(this.storageSettings.values.loiteringThreshold, 3) * 1000,
      minDetectionScore: this.getNumberSetting(this.storageSettings.values.minDetectionScore, 0.5),
      objectAlertCooldown: this.getNumberSetting(this.storageSettings.values.objectAlertCooldown, 30) * 1000,
      useLlmDescriptions: this.storageSettings.values.useLlmDescriptions as boolean ?? true,
      llmDeviceIds: this.parseLlmProviders(),
      llmDebounceInterval: this.getNumberSetting(this.storageSettings.values.llmDebounceInterval, 5) * 1000,
      llmFallbackEnabled: this.storageSettings.values.llmFallbackEnabled as boolean ?? true,
      llmFallbackTimeout: this.getNumberSetting(this.storageSettings.values.llmFallbackTimeout, 3) * 1000,
      enableTransitTimeLearning: this.storageSettings.values.enableTransitTimeLearning as boolean ?? true,
      enableConnectionSuggestions: this.storageSettings.values.enableConnectionSuggestions as boolean ?? true,
      enableLandmarkLearning: this.storageSettings.values.enableLandmarkLearning as boolean ?? true,
      landmarkConfidenceThreshold: this.getNumberSetting(this.storageSettings.values.landmarkConfidenceThreshold, 0.7),
    };

    this.trackingEngine = new TrackingEngine(
      topology,
      this.trackingState,
      this.alertManager,
      config,
      this.console
    );

    this.applyAlertUpdateSettings();

    // Set up callback to save topology changes (e.g., from accepted landmark suggestions)
    this.trackingEngine.setTopologyChangeCallback((updatedTopology) => {
      this.storage.setItem('topology', JSON.stringify(updatedTopology));
      this.console.log('Topology auto-saved after change');
    });

    await this.trackingEngine.startTracking();
    this.console.log('Tracking engine started');

    // Initialize or update discovery engine
    await this.initializeDiscoveryEngine(topology);
  }

  private async initializeDiscoveryEngine(topology: CameraTopology): Promise<void> {
    const discoveryConfig: DiscoveryConfig = {
      discoveryIntervalHours: this.getNumberSetting(this.storageSettings.values.discoveryIntervalHours, 0),
      autoAcceptThreshold: this.getNumberSetting(this.storageSettings.values.autoAcceptThreshold, 0.85),
      minLandmarkConfidence: this.getNumberSetting(this.storageSettings.values.minLandmarkConfidence, 0.6),
      minConnectionConfidence: this.getNumberSetting(this.storageSettings.values.minConnectionConfidence, 0.5),
    };

    if (this.discoveryEngine) {
      // Update existing engine
      this.discoveryEngine.updateConfig(discoveryConfig);
      this.discoveryEngine.updateTopology(topology);
    } else {
      // Create new engine
      this.discoveryEngine = new TopologyDiscoveryEngine(discoveryConfig, this.console);
      this.discoveryEngine.updateTopology(topology);

      // Start periodic discovery if enabled
      if (discoveryConfig.discoveryIntervalHours > 0) {
        this.discoveryEngine.startPeriodicDiscovery();
      }
    }
  }

  /** Parse LLM providers from settings - handles both array and single value formats */
  private parseLlmProviders(): string[] | undefined {
    const value = this.storageSettings.values.llmProviders;
    if (!value) return undefined;

    // Handle array format
    if (Array.isArray(value)) {
      const filtered = value.filter(Boolean);
      return filtered.length > 0 ? filtered : undefined;
    }

    // Handle JSON string format
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(Boolean);
          return filtered.length > 0 ? filtered : undefined;
        }
        // Single device ID string
        return value ? [value] : undefined;
      } catch {
        // Not JSON, treat as single device ID
        return value ? [value] : undefined;
      }
    }

    return undefined;
  }

  private getNumberSetting(value: unknown, fallback: number): number {
    if (value === undefined || value === null) return fallback;
    const num = typeof value === 'string' ? Number(value) : (value as number);
    return Number.isFinite(num) ? num : fallback;
  }

  // ==================== DeviceProvider Implementation ====================

  async getDevice(nativeId: string): Promise<any> {
    let device = this.devices.get(nativeId);

    if (!device) {
      if (nativeId === GLOBAL_TRACKER_ID) {
        device = new GlobalTrackerSensor(this, nativeId, this.trackingState);
      } else if (nativeId.startsWith(TRACKING_ZONE_PREFIX)) {
        device = new TrackingZone(this, nativeId, this.trackingState);
      }

      if (device) {
        this.devices.set(nativeId, device);
      }
    }

    return device;
  }

  async releaseDevice(id: string, nativeId: string): Promise<void> {
    this.devices.delete(nativeId);
  }

  // ==================== DeviceCreator Implementation ====================

  async getCreateDeviceSettings(): Promise<Setting[]> {
    return [
      {
        key: 'name',
        title: 'Zone Name',
        description: 'Name for this tracking zone',
        type: 'string',
      },
      {
        key: 'type',
        title: 'Zone Type',
        type: 'string',
        choices: ['entry', 'exit', 'dwell', 'restricted'],
        value: 'entry',
      },
      {
        key: 'cameras',
        title: 'Cameras',
        type: 'device',
        multiple: true,
        deviceFilter: `interfaces.includes('${ScryptedInterface.ObjectDetector}')`,
      },
    ];
  }

  async createDevice(settings: DeviceCreatorSettings): Promise<string> {
    const nativeId = TRACKING_ZONE_PREFIX + Date.now().toString();

    await deviceManager.onDeviceDiscovered({
      nativeId,
      name: (settings.name as string) || 'Tracking Zone',
      type: ScryptedDeviceType.Sensor,
      interfaces: [
        ScryptedInterface.OccupancySensor,
        ScryptedInterface.MotionSensor,
        ScryptedInterface.Settings,
      ],
    });

    // Store zone configuration
    this.storage.setItem(`zone:${nativeId}`, JSON.stringify({
      type: settings.type,
      cameras: settings.cameras,
    }));

    return nativeId;
  }

  // ==================== Settings Implementation ====================

  async getSettings(): Promise<Setting[]> {
    const baseSettings = await this.storageSettings.getSettings();

    // Build settings in desired order
    const settings: Setting[] = [];

    // Helper to find and add settings from baseSettings by group
    const addGroup = (group: string) => {
      baseSettings.filter(s => s.group === group).forEach(s => settings.push(s));
    };

    // ==================== 1. Getting Started ====================
    // Training Mode button that opens mobile-friendly training UI in modal
    const trainingOnclickCode = `(function(){var e=document.getElementById('sa-training-modal');if(e)e.remove();var m=document.createElement('div');m.id='sa-training-modal';m.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:2147483647;display:flex;align-items:center;justify-content:center;';var c=document.createElement('div');c.style.cssText='width:min(420px,95vw);height:92vh;max-height:900px;background:#121212;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';var b=document.createElement('button');b.innerHTML='×';b.style.cssText='position:absolute;top:8px;right:8px;z-index:2147483647;background:rgba(255,255,255,0.1);color:white;border:none;width:32px;height:32px;border-radius:4px;font-size:18px;cursor:pointer;line-height:1;';b.onclick=function(){m.remove();};var f=document.createElement('iframe');f.src='/endpoint/@blueharford/scrypted-spatial-awareness/ui/training';f.style.cssText='width:100%;height:100%;border:none;';c.appendChild(b);c.appendChild(f);m.appendChild(c);m.onclick=function(ev){if(ev.target===m)m.remove();};document.body.appendChild(m);})()`;

    settings.push({
      key: 'trainingMode',
      title: 'Training Mode',
      type: 'html' as any,
      value: `
        <style>
          .sa-training-container {
            padding: 16px;
            background: rgba(255,255,255,0.03);
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.08);
          }
          .sa-training-title {
            color: #4fc3f7;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
            font-family: inherit;
          }
          .sa-training-desc {
            color: rgba(255,255,255,0.6);
            margin-bottom: 12px;
            font-size: 13px;
            line-height: 1.5;
            font-family: inherit;
          }
          .sa-training-btn {
            background: #4fc3f7;
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
            font-family: inherit;
          }
          .sa-training-btn:hover {
            background: #81d4fa;
          }
          .sa-training-steps {
            color: rgba(255,255,255,0.5);
            font-size: 12px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(255,255,255,0.05);
            font-family: inherit;
          }
          .sa-training-steps ol {
            margin: 6px 0 0 16px;
            padding: 0;
          }
          .sa-training-steps li {
            margin-bottom: 2px;
          }
        </style>
        <div class="sa-training-container">
          <div class="sa-training-title">Guided Property Training</div>
          <p class="sa-training-desc">Walk your property while the system learns your camera layout, transit times, and landmarks automatically.</p>
          <button class="sa-training-btn" onclick="${trainingOnclickCode}">
            Start Training Mode
          </button>
          <div class="sa-training-steps">
            <strong>How it works:</strong>
            <ol>
              <li>Start training and walk to each camera</li>
              <li>System auto-detects you and records transit times</li>
              <li>Mark landmarks as you encounter them</li>
              <li>Apply results to generate your topology</li>
            </ol>
          </div>
        </div>
      `,
      group: 'Getting Started',
    });

    // ==================== 2. Topology ====================
    // Topology editor button that opens modal overlay (appended to body for proper z-index)
    const onclickCode = `(function(){var e=document.getElementById('sa-topology-modal');if(e)e.remove();var m=document.createElement('div');m.id='sa-topology-modal';m.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:2147483647;display:flex;align-items:center;justify-content:center;';var c=document.createElement('div');c.style.cssText='width:95vw;height:92vh;max-width:1800px;background:#121212;border-radius:8px;overflow:hidden;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';var b=document.createElement('button');b.innerHTML='×';b.style.cssText='position:absolute;top:8px;right:8px;z-index:2147483647;background:rgba(255,255,255,0.1);color:white;border:none;width:32px;height:32px;border-radius:4px;font-size:18px;cursor:pointer;line-height:1;';b.onclick=function(){m.remove();};var f=document.createElement('iframe');f.src='/endpoint/@blueharford/scrypted-spatial-awareness/ui/editor';f.style.cssText='width:100%;height:100%;border:none;';c.appendChild(b);c.appendChild(f);m.appendChild(c);m.onclick=function(ev){if(ev.target===m)m.remove();};document.body.appendChild(m);})()`;

    settings.push({
      key: 'topologyEditor',
      title: 'Topology Editor',
      type: 'html' as any,
      value: `
        <style>
          .sa-open-btn {
            background: #4fc3f7;
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
            font-family: inherit;
          }
          .sa-open-btn:hover {
            background: #81d4fa;
          }
          .sa-btn-container {
            padding: 16px;
            background: rgba(255,255,255,0.03);
            border-radius: 4px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.08);
          }
          .sa-btn-desc {
            color: rgba(255,255,255,0.6);
            margin-bottom: 12px;
            font-size: 13px;
            font-family: inherit;
          }
        </style>
        <div class="sa-btn-container">
          <p class="sa-btn-desc">Configure camera positions, connections, and transit times</p>
          <button class="sa-open-btn" onclick="${onclickCode}">
            Open Topology Editor
          </button>
        </div>
      `,
      group: 'Topology',
    });

    // ==================== 3. Cameras ====================
    addGroup('Cameras');

    // ==================== 4. Status ====================
    // Add status display
    const activeCount = this.trackingState.getActiveCount();
    const topologyJson = this.storage.getItem('topology');
    let statusText = 'Not configured - add cameras and configure topology';

    if (this.trackingEngine) {
      statusText = `Active: Tracking ${activeCount} object${activeCount !== 1 ? 's' : ''}`;
    } else if (topologyJson) {
      try {
        const topology = JSON.parse(topologyJson) as CameraTopology;
        if (topology.cameras && topology.cameras.length > 0) {
          // Topology exists but engine not running - try to start it
          statusText = `Configured (${topology.cameras.length} cameras) - Starting...`;
          // Restart the tracking engine asynchronously
          this.startTrackingEngine(topology).catch(e => {
            this.console.error('Failed to restart tracking engine:', e);
          });
        }
      } catch (e) {
        statusText = 'Error loading topology';
      }
    }

    settings.push({
      key: 'status',
      title: 'Tracking Status',
      type: 'string',
      readonly: true,
      value: statusText,
      group: 'Status',
    });

    // Add recent alerts summary
    const recentAlerts = this.alertManager.getRecentAlerts(5);
    if (recentAlerts.length > 0) {
      settings.push({
        key: 'recentAlerts',
        title: 'Recent Alerts',
        type: 'string',
        readonly: true,
        value: recentAlerts.map(a => `${a.type}: ${a.message}`).join('\n'),
        group: 'Status',
      });
    }

    // ==================== 5. Tracking ====================
    addGroup('Tracking');

    // ==================== 6. Integrations ====================
    addGroup('Integrations');

    // ==================== 7. AI & Spatial Reasoning ====================
    addGroup('AI & Spatial Reasoning');

    // ==================== 8. Auto-Topology Discovery ====================
    addGroup('Auto-Topology Discovery');

    // ==================== 9. MQTT Integration ====================
    addGroup('MQTT Integration');

    return settings;
  }

  async putSetting(key: string, value: SettingValue): Promise<void> {
    await this.storageSettings.putSetting(key, value);

    // Handle setting changes that require engine restart
    if (
      key === 'trackedCameras' ||
      key === 'correlationWindow' ||
      key === 'correlationThreshold' ||
      key === 'lostTimeout' ||
      key === 'useVisualMatching' ||
      key === 'loiteringThreshold' ||
      key === 'objectAlertCooldown' ||
      key === 'useLlmDescriptions' ||
      key === 'llmDebounceInterval' ||
      key === 'llmFallbackEnabled' ||
      key === 'llmFallbackTimeout' ||
      key === 'llmProviders' ||
      key === 'enableTransitTimeLearning' ||
      key === 'enableConnectionSuggestions' ||
      key === 'enableLandmarkLearning' ||
      key === 'landmarkConfidenceThreshold'
    ) {
      const topologyJson = this.storage.getItem('topology');
      if (topologyJson) {
        try {
          const topology = JSON.parse(topologyJson) as CameraTopology;
          await this.startTrackingEngine(topology);
        } catch (e) {
          this.console.error('Failed to restart tracking engine:', e);
        }
      }
    }

    if (key === 'notifyOnAlertUpdates' || key === 'alertUpdateCooldown') {
      this.applyAlertUpdateSettings();
    }

    // Handle MQTT setting changes
    if (key === 'enableMqtt' || key === 'mqttBroker' || key === 'mqttUsername' ||
        key === 'mqttPassword' || key === 'mqttBaseTopic') {
      if (this.mqttPublisher) {
        this.mqttPublisher.disconnect();
        this.mqttPublisher = null;
      }
      if (this.storageSettings.values.enableMqtt) {
        await this.initializeMqtt();
      }
    }
  }

  private applyAlertUpdateSettings(): void {
    const enabled = this.storageSettings.values.notifyOnAlertUpdates as boolean ?? false;
    const cooldownSeconds = this.getNumberSetting(this.storageSettings.values.alertUpdateCooldown, 60);
    this.alertManager.setUpdateNotificationOptions(enabled, cooldownSeconds * 1000);
  }

  // ==================== HttpRequestHandler Implementation ====================

  async onRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    const url = new URL(request.url!, 'http://localhost');
    const path = url.pathname;

    try {
      // API Routes
      if (path.endsWith('/api/tracked-objects')) {
        return this.handleTrackedObjectsRequest(request, response);
      }

      if (path.match(/\/api\/journey\/[\w-]+$/)) {
        const globalId = path.split('/').pop()!;
        return this.handleJourneyRequest(globalId, response);
      }

      if (path.endsWith('/api/topology')) {
        return await this.handleTopologyRequest(request, response);
      }

      if (path.endsWith('/api/alerts')) {
        return this.handleAlertsRequest(request, response);
      }

      if (path.endsWith('/api/alert-rules')) {
        return this.handleAlertRulesRequest(request, response);
      }

      if (path.endsWith('/api/cameras')) {
        return this.handleCamerasRequest(response);
      }

      if (path.endsWith('/api/floor-plan')) {
        return this.handleFloorPlanRequest(request, response);
      }

      if (path.endsWith('/api/landmarks')) {
        return this.handleLandmarksRequest(request, response);
      }

      if (path.match(/\/api\/landmarks\/[\w-]+$/)) {
        const landmarkId = path.split('/').pop()!;
        return this.handleLandmarkRequest(landmarkId, request, response);
      }

      if (path.endsWith('/api/landmark-suggestions')) {
        return this.handleLandmarkSuggestionsRequest(request, response);
      }

      if (path.match(/\/api\/landmark-suggestions\/[\w-]+\/(accept|reject)$/)) {
        const parts = path.split('/');
        const action = parts.pop()!;
        const suggestionId = parts.pop()!;
        return this.handleSuggestionActionRequest(suggestionId, action, response);
      }

      if (path.endsWith('/api/landmark-templates')) {
        return this.handleLandmarkTemplatesRequest(response);
      }

      if (path.endsWith('/api/infer-relationships')) {
        return this.handleInferRelationshipsRequest(response);
      }

      // Connection suggestions
      if (path.endsWith('/api/connection-suggestions')) {
        return this.handleConnectionSuggestionsRequest(request, response);
      }

      if (path.match(/\/api\/connection-suggestions\/[\w->]+\/(accept|reject)$/)) {
        const parts = path.split('/');
        const action = parts.pop()!;
        const suggestionId = parts.pop()!;
        return this.handleConnectionSuggestionActionRequest(suggestionId, action, response);
      }

      // Live tracking state
      if (path.endsWith('/api/live-tracking')) {
        return this.handleLiveTrackingRequest(response);
      }

      // Journey visualization
      if (path.match(/\/api\/journey-path\/[\w-]+$/)) {
        const globalId = path.split('/').pop()!;
        return this.handleJourneyPathRequest(globalId, response);
      }

      // Training Mode endpoints
      if (path.endsWith('/api/training/start')) {
        return this.handleTrainingStartRequest(request, response);
      }
      if (path.endsWith('/api/training/pause')) {
        return this.handleTrainingPauseRequest(response);
      }
      if (path.endsWith('/api/training/resume')) {
        return this.handleTrainingResumeRequest(response);
      }
      if (path.endsWith('/api/training/end')) {
        return this.handleTrainingEndRequest(response);
      }
      if (path.endsWith('/api/training/status')) {
        return this.handleTrainingStatusRequest(response);
      }
      if (path.endsWith('/api/training/landmark')) {
        return this.handleTrainingLandmarkRequest(request, response);
      }
      if (path.endsWith('/api/training/apply')) {
        return this.handleTrainingApplyRequest(response);
      }

      // Discovery endpoints
      if (path.endsWith('/api/discovery/scan')) {
        return this.handleDiscoveryScanRequest(response);
      }
      if (path.endsWith('/api/discovery/status')) {
        return this.handleDiscoveryStatusRequest(response);
      }
      if (path.endsWith('/api/discovery/suggestions')) {
        return this.handleDiscoverySuggestionsRequest(response);
      }
      if (path.match(/\/api\/discovery\/suggestions\/[\w-]+\/(accept|reject)$/)) {
        const parts = path.split('/');
        const action = parts.pop()!;
        const suggestionId = parts.pop()!;
        return this.handleDiscoverySuggestionActionRequest(suggestionId, action, response);
      }
      if (path.match(/\/api\/discovery\/camera\/[\w-]+$/)) {
        const cameraId = path.split('/').pop()!;
        return this.handleDiscoveryCameraAnalysisRequest(cameraId, response);
      }

      // UI Routes
      if (path.endsWith('/ui/editor') || path.endsWith('/ui/editor/')) {
        return this.serveEditorUI(response);
      }

      if (path.endsWith('/ui/training') || path.endsWith('/ui/training/')) {
        return this.serveTrainingUI(response);
      }

      if (path.includes('/ui/')) {
        return this.serveStaticFile(path, response);
      }

      // Default: return info page
      response.send(JSON.stringify({
        name: 'Spatial Awareness Plugin',
        version: '0.5.0-beta',
        endpoints: {
          api: {
            trackedObjects: '/api/tracked-objects',
            journey: '/api/journey/{globalId}',
            journeyPath: '/api/journey-path/{globalId}',
            topology: '/api/topology',
            alerts: '/api/alerts',
            floorPlan: '/api/floor-plan',
            liveTracking: '/api/live-tracking',
            connectionSuggestions: '/api/connection-suggestions',
            landmarkSuggestions: '/api/landmark-suggestions',
            training: {
              start: '/api/training/start',
              pause: '/api/training/pause',
              resume: '/api/training/resume',
              end: '/api/training/end',
              status: '/api/training/status',
              landmark: '/api/training/landmark',
              apply: '/api/training/apply',
            },
            discovery: {
              scan: '/api/discovery/scan',
              status: '/api/discovery/status',
              suggestions: '/api/discovery/suggestions',
              camera: '/api/discovery/camera/{cameraId}',
            },
          },
          ui: {
            editor: '/ui/editor',
            training: '/ui/training',
          },
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      this.console.error('HTTP request error:', e);
      response.send(JSON.stringify({ error: (e as Error).message }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrackedObjectsRequest(request: HttpRequest, response: HttpResponse): void {
    const objects = this.trackingState.getAllObjects();
    response.send(JSON.stringify(objects), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleJourneyRequest(globalId: string, response: HttpResponse): void {
    const tracked = this.trackingState.getObject(globalId);
    if (tracked) {
      response.send(JSON.stringify({
        globalId: tracked.globalId,
        className: tracked.className,
        label: tracked.label,
        journey: tracked.journey,
        sightings: tracked.sightings.map(s => ({
          cameraId: s.cameraId,
          cameraName: s.cameraName,
          timestamp: s.timestamp,
        })),
        firstSeen: tracked.firstSeen,
        lastSeen: tracked.lastSeen,
        state: tracked.state,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ error: 'Object not found' }), {
        code: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleTopologyRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    if (request.method === 'GET') {
      const topologyJson = this.storage.getItem('topology');
      const topology = topologyJson ? JSON.parse(topologyJson) : createEmptyTopology();
      this.console.log(`[Topology API] GET - drawnZones: ${topology.drawnZones?.length || 0}`);
      response.send(JSON.stringify(topology), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (request.method === 'PUT' || request.method === 'POST') {
      try {
        const topology = JSON.parse(request.body!) as CameraTopology;
        this.console.log(`[Topology API] PUT received - drawnZones: ${topology.drawnZones?.length || 0}`);
        if (topology.drawnZones?.length) {
          this.console.log(`[Topology API] Zone names: ${topology.drawnZones.map(z => z.name).join(', ')}`);
        }
        this.storage.setItem('topology', JSON.stringify(topology));
        await this.startTrackingEngine(topology);
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        this.console.error(`[Topology API] PUT error:`, e);
        response.send(JSON.stringify({ error: 'Invalid topology JSON' }), {
          code: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  private handleAlertsRequest(request: HttpRequest, response: HttpResponse): void {
    const alerts = this.alertManager.getRecentAlerts();
    response.send(JSON.stringify(alerts), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleAlertRulesRequest(request: HttpRequest, response: HttpResponse): void {
    if (request.method === 'GET') {
      const rules = this.alertManager.getRules();
      response.send(JSON.stringify(rules), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (request.method === 'PUT' || request.method === 'POST') {
      try {
        const rules = JSON.parse(request.body!);
        this.alertManager.setRules(rules);
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        response.send(JSON.stringify({ error: 'Invalid rules JSON' }), {
          code: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  private handleCamerasRequest(response: HttpResponse): void {
    try {
      // Get all devices with ObjectDetector interface
      const cameras: { id: string; name: string }[] = [];

      for (const id of Object.keys(systemManager.getSystemState())) {
        try {
          const device = systemManager.getDeviceById(id);
          if (device && device.interfaces?.includes(ScryptedInterface.ObjectDetector)) {
            cameras.push({
              id: id,
              name: device.name || `Camera ${id}`,
            });
          }
        } catch (e) {
          // Skip devices that can't be accessed
        }
      }

      response.send(JSON.stringify(cameras), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      this.console.error('Error getting cameras:', e);
      response.send(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async getFloorPlanPath(): Promise<string> {
    // Use mediaManager.getFilesPath() for proper persistent storage
    const filesPath = await mediaManager.getFilesPath();
    this.console.log('Files path from mediaManager:', filesPath);
    // Ensure directory exists
    if (!fs.existsSync(filesPath)) {
      fs.mkdirSync(filesPath, { recursive: true });
    }
    return path.join(filesPath, 'floorplan.jpg');
  }

  private async handleFloorPlanRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    if (request.method === 'GET') {
      try {
        const floorPlanPath = await this.getFloorPlanPath();
        this.console.log('Loading floor plan from:', floorPlanPath, 'exists:', fs.existsSync(floorPlanPath));
        if (fs.existsSync(floorPlanPath)) {
          const imageBuffer = fs.readFileSync(floorPlanPath);
          const imageData = 'data:image/jpeg;base64,' + imageBuffer.toString('base64');
          this.console.log('Floor plan loaded, size:', imageBuffer.length);
          response.send(JSON.stringify({ imageData }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          response.send(JSON.stringify({ imageData: null }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        this.console.error('Failed to read floor plan:', e);
        response.send(JSON.stringify({ imageData: null }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (request.method === 'POST') {
      try {
        const body = JSON.parse(request.body!);
        const imageData = body.imageData as string;

        // Extract base64 data (remove data:image/xxx;base64, prefix)
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const floorPlanPath = await this.getFloorPlanPath();
        fs.writeFileSync(floorPlanPath, imageBuffer);

        this.console.log('Floor plan saved to:', floorPlanPath, 'size:', imageBuffer.length);
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        this.console.error('Failed to save floor plan:', e);
        response.send(JSON.stringify({ error: 'Failed to save floor plan' }), {
          code: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  private handleLandmarksRequest(request: HttpRequest, response: HttpResponse): void {
    const topology = this.getTopology();
    if (!topology) {
      response.send(JSON.stringify({ landmarks: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    if (request.method === 'GET') {
      response.send(JSON.stringify({
        landmarks: topology.landmarks || [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (request.method === 'POST') {
      try {
        const landmark = JSON.parse(request.body!) as Landmark;
        if (!landmark.id) {
          landmark.id = `landmark_${Date.now()}`;
        }
        if (!topology.landmarks) {
          topology.landmarks = [];
        }
        topology.landmarks.push(landmark);
        this.storage.setItem('topology', JSON.stringify(topology));
        if (this.trackingEngine) {
          this.trackingEngine.updateTopology(topology);
        }
        response.send(JSON.stringify({ success: true, landmark }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        response.send(JSON.stringify({ error: 'Invalid landmark data' }), {
          code: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  private handleLandmarkRequest(
    landmarkId: string,
    request: HttpRequest,
    response: HttpResponse
  ): void {
    const topology = this.getTopology();
    if (!topology) {
      response.send(JSON.stringify({ error: 'No topology configured' }), {
        code: 404,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const landmarkIndex = topology.landmarks?.findIndex(l => l.id === landmarkId) ?? -1;

    if (request.method === 'GET') {
      const landmark = topology.landmarks?.[landmarkIndex];
      if (landmark) {
        response.send(JSON.stringify(landmark), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Landmark not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (request.method === 'PUT') {
      try {
        const updates = JSON.parse(request.body!) as Partial<Landmark>;
        if (landmarkIndex >= 0) {
          topology.landmarks![landmarkIndex] = {
            ...topology.landmarks![landmarkIndex],
            ...updates,
            id: landmarkId, // Preserve ID
          };
          this.storage.setItem('topology', JSON.stringify(topology));
          if (this.trackingEngine) {
            this.trackingEngine.updateTopology(topology);
          }
          response.send(JSON.stringify({ success: true, landmark: topology.landmarks![landmarkIndex] }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          response.send(JSON.stringify({ error: 'Landmark not found' }), {
            code: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        response.send(JSON.stringify({ error: 'Invalid landmark data' }), {
          code: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (request.method === 'DELETE') {
      if (landmarkIndex >= 0) {
        topology.landmarks!.splice(landmarkIndex, 1);
        this.storage.setItem('topology', JSON.stringify(topology));
        if (this.trackingEngine) {
          this.trackingEngine.updateTopology(topology);
        }
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Landmark not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  private handleLandmarkSuggestionsRequest(request: HttpRequest, response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ suggestions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const suggestions = this.trackingEngine.getPendingLandmarkSuggestions();
    response.send(JSON.stringify({
      suggestions,
      count: suggestions.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleSuggestionActionRequest(
    suggestionId: string,
    action: string,
    response: HttpResponse
  ): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    if (action === 'accept') {
      const landmark = this.trackingEngine.acceptLandmarkSuggestion(suggestionId);
      if (landmark) {
        response.send(JSON.stringify({ success: true, landmark }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (action === 'reject') {
      const success = this.trackingEngine.rejectLandmarkSuggestion(suggestionId);
      if (success) {
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      response.send(JSON.stringify({ error: 'Invalid action' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleLandmarkTemplatesRequest(response: HttpResponse): void {
    response.send(JSON.stringify({
      templates: LANDMARK_TEMPLATES,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleInferRelationshipsRequest(response: HttpResponse): void {
    const topology = this.getTopology();
    if (!topology) {
      response.send(JSON.stringify({ relationships: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const inferred = inferRelationships(topology);
    response.send(JSON.stringify({
      relationships: inferred,
      count: inferred.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleConnectionSuggestionsRequest(request: HttpRequest, response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ suggestions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const suggestions = this.trackingEngine.getConnectionSuggestions();
    response.send(JSON.stringify({
      suggestions,
      count: suggestions.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleConnectionSuggestionActionRequest(
    suggestionId: string,
    action: string,
    response: HttpResponse
  ): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    if (action === 'accept') {
      const connection = this.trackingEngine.acceptConnectionSuggestion(suggestionId);
      if (connection) {
        // Save updated topology
        const topology = this.trackingEngine.getTopology();
        this.storage.setItem('topology', JSON.stringify(topology));

        response.send(JSON.stringify({ success: true, connection }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (action === 'reject') {
      const success = this.trackingEngine.rejectConnectionSuggestion(suggestionId);
      if (success) {
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      response.send(JSON.stringify({ error: 'Invalid action' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleLiveTrackingRequest(response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ objects: [], timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const liveState = this.trackingEngine.getLiveTrackingState();
    response.send(JSON.stringify(liveState), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleJourneyPathRequest(globalId: string, response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const journeyPath = this.trackingEngine.getJourneyPath(globalId);
    if (journeyPath) {
      response.send(JSON.stringify(journeyPath), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ error: 'Object not found' }), {
        code: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ==================== Training Mode Handlers ====================

  private handleTrainingStartRequest(request: HttpRequest, response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running. Configure topology first.' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    try {
      let config: Partial<TrainingConfig> | undefined;
      let trainerName: string | undefined;

      if (request.body) {
        const body = JSON.parse(request.body);
        trainerName = body.trainerName;
        config = body.config;
      }

      const session = this.trackingEngine.startTrainingSession(trainerName, config);
      response.send(JSON.stringify(session), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      response.send(JSON.stringify({ error: (e as Error).message }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrainingPauseRequest(response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const success = this.trackingEngine.pauseTrainingSession();
    if (success) {
      response.send(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ error: 'No active training session to pause' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrainingResumeRequest(response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const success = this.trackingEngine.resumeTrainingSession();
    if (success) {
      response.send(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ error: 'No paused training session to resume' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleTrainingEndRequest(response: HttpResponse): Promise<void> {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const session = this.trackingEngine.endTrainingSession();
    if (session) {
      // Get unique visited cameras
      const visitedCameraIds = [...new Set(session.visits.map(v => v.cameraId))];

      // Auto-run discovery on visited cameras to detect landmarks and zones
      if (this.discoveryEngine && visitedCameraIds.length > 0) {
        this.console.log(`[Training] Running discovery analysis on ${visitedCameraIds.length} visited cameras...`);

        let landmarksFound = 0;
        let zonesFound = 0;

        for (const cameraId of visitedCameraIds) {
          try {
            const analysis = await this.discoveryEngine.analyzeScene(cameraId);
            if (analysis.isValid) {
              landmarksFound += analysis.landmarks.length;
              zonesFound += analysis.zones.length;
              this.console.log(`[Training] ${cameraId}: Found ${analysis.landmarks.length} landmarks, ${analysis.zones.length} zones`);
            }
          } catch (e) {
            this.console.warn(`[Training] Failed to analyze ${cameraId}:`, e);
          }
        }

        // Get all pending suggestions and auto-accept them
        const suggestions = this.discoveryEngine.getPendingSuggestions();
        for (const suggestion of suggestions) {
          this.applyDiscoverySuggestion(suggestion);
          this.discoveryEngine.acceptSuggestion(suggestion.id);
        }

        // Persist topology after applying suggestions
        if (suggestions.length > 0 && this.trackingEngine) {
          const updatedTopology = this.trackingEngine.getTopology();
          await this.storageSettings.putSetting('topology', JSON.stringify(updatedTopology));
          this.console.log(`[Training] Auto-applied ${suggestions.length} discoveries (${landmarksFound} landmarks, ${zonesFound} zones)`);
        }
      }

      response.send(JSON.stringify(session), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ error: 'No training session to end' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrainingStatusRequest(response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ state: 'idle', stats: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const status = this.trackingEngine.getTrainingStatus();
    if (status) {
      response.send(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      response.send(JSON.stringify({ state: 'idle', stats: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrainingLandmarkRequest(request: HttpRequest, response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    try {
      const body = JSON.parse(request.body!) as Omit<TrainingLandmark, 'id' | 'markedAt'>;
      const landmark = this.trackingEngine.markTrainingLandmark(body);
      if (landmark) {
        response.send(JSON.stringify({ success: true, landmark }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'No active training session' }), {
          code: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      response.send(JSON.stringify({ error: 'Invalid request body' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleTrainingApplyRequest(response: HttpResponse): void {
    if (!this.trackingEngine) {
      response.send(JSON.stringify({ error: 'Tracking engine not running' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const result = this.trackingEngine.applyTrainingToTopology();
    if (result.success) {
      // Save the updated topology
      const topology = this.trackingEngine.getTopology();
      this.storage.setItem('topology', JSON.stringify(topology));
    }
    response.send(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ==================== Discovery Handlers ====================

  private async handleDiscoveryScanRequest(response: HttpResponse): Promise<void> {
    if (!this.discoveryEngine) {
      response.send(JSON.stringify({ error: 'Discovery engine not initialized. Configure topology first.' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    try {
      this.console.log('[Discovery] Manual scan triggered via API');
      const correlation = await this.discoveryEngine.runFullDiscovery();
      const status = this.discoveryEngine.getStatus();
      const suggestions = this.discoveryEngine.getPendingSuggestions();

      response.send(JSON.stringify({
        success: true,
        status,
        correlation,
        suggestions,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      this.console.error('[Discovery] Scan failed:', e);
      response.send(JSON.stringify({ error: `Scan failed: ${(e as Error).message}` }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private handleDiscoveryStatusRequest(response: HttpResponse): void {
    if (!this.discoveryEngine) {
      response.send(JSON.stringify({
        isRunning: false,
        isScanning: false,
        lastScanTime: null,
        nextScanTime: null,
        camerasAnalyzed: 0,
        pendingSuggestions: 0,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const status = this.discoveryEngine.getStatus();
    response.send(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleDiscoverySuggestionsRequest(response: HttpResponse): void {
    if (!this.discoveryEngine) {
      response.send(JSON.stringify({ suggestions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    const suggestions = this.discoveryEngine.getPendingSuggestions();
    response.send(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleDiscoverySuggestionActionRequest(
    suggestionId: string,
    action: string,
    response: HttpResponse
  ): void {
    if (!this.discoveryEngine) {
      response.send(JSON.stringify({ error: 'Discovery engine not initialized' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    if (action === 'accept') {
      const suggestion = this.discoveryEngine.acceptSuggestion(suggestionId);
      if (suggestion) {
        // Apply accepted suggestion to topology
        this.applyDiscoverySuggestion(suggestion);
        response.send(JSON.stringify({ success: true, suggestion }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (action === 'reject') {
      const success = this.discoveryEngine.rejectSuggestion(suggestionId);
      if (success) {
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ error: 'Suggestion not found' }), {
          code: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      response.send(JSON.stringify({ error: 'Invalid action' }), {
        code: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleDiscoveryCameraAnalysisRequest(
    cameraId: string,
    response: HttpResponse
  ): Promise<void> {
    if (!this.discoveryEngine) {
      response.send(JSON.stringify({ error: 'Discovery engine not initialized' }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    try {
      const analysis = await this.discoveryEngine.analyzeScene(cameraId);
      response.send(JSON.stringify(analysis), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      response.send(JSON.stringify({ error: `Analysis failed: ${(e as Error).message}` }), {
        code: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private applyDiscoverySuggestion(suggestion: DiscoverySuggestion): void {
    if (!this.trackingEngine) return;

    const topology = this.trackingEngine.getTopology();
    let updated = false;

    if (suggestion.type === 'landmark' && suggestion.landmark) {
      // Calculate position for the landmark WITHIN the camera's field of view
      let position = suggestion.landmark.position;
      if (!position || (position.x === 0 && position.y === 0)) {
        // Debug logging
        this.console.log(`[Discovery] Processing landmark "${suggestion.landmark.name}"`);
        this.console.log(`[Discovery] sourceCameras: ${JSON.stringify(suggestion.sourceCameras)}`);
        this.console.log(`[Discovery] visibleFromCameras: ${JSON.stringify(suggestion.landmark.visibleFromCameras)}`);
        this.console.log(`[Discovery] Available cameras: ${topology.cameras.map(c => `${c.name}(${c.deviceId})`).join(', ')}`);

        // Find a camera that can see this landmark
        // PREFER sourceCameras (set from analysis.cameraId) over visibleFromCameras (from LLM parsing)
        const sourceCameraRef = suggestion.sourceCameras?.[0];
        const visibleCameraRef = suggestion.landmark.visibleFromCameras?.[0];
        const cameraRef = sourceCameraRef || visibleCameraRef;

        // Use flexible matching (deviceId, name, or case-insensitive)
        const camera = cameraRef ? topology.cameras.find(c =>
          c.deviceId === cameraRef ||
          c.name === cameraRef ||
          c.name.toLowerCase() === cameraRef.toLowerCase()
        ) : null;

        if (camera) {
          this.console.log(`[Discovery] Matched camera: ${camera.name} (${camera.deviceId})`);
          this.console.log(`[Discovery] Camera position: ${JSON.stringify(camera.floorPlanPosition)}`);
          this.console.log(`[Discovery] Camera FOV: ${JSON.stringify(camera.fov)}`);
        } else {
          this.console.warn(`[Discovery] No camera matched for ref="${cameraRef}" (source="${sourceCameraRef}", visible="${visibleCameraRef}")`);
        }

        if (camera?.floorPlanPosition) {
          // Get camera's FOV direction and range (cast to any for flexible access)
          const fov = (camera.fov || { mode: 'simple', angle: 90, direction: 0, range: 80 }) as any;
          const direction = fov.direction || 0;
          const range = fov.range || 80;
          const fovAngle = fov.angle || 90;

          // Calculate position in front of camera within its FOV
          // Convert direction to radians (0 = up/north, 90 = right/east)
          const dirRad = (direction - 90) * Math.PI / 180;
          const halfFov = (fovAngle / 2) * Math.PI / 180;

          // Get floor plan scale (pixels per foot) - default 5
          const floorPlanScale = topology.floorPlanScale || 5;

          // Use the ACTUAL distance from LLM analysis (distanceFeet) - this is the key fix!
          // The LLM estimates distance based on object size, perspective, and camera context
          const landmarkData = suggestion.landmark as any;
          const distanceFeet = landmarkData.distanceFeet || 50; // Default 50ft if not set
          const distanceInPixels = distanceFeet * floorPlanScale;

          // Debug: log the distance data to verify it's being used correctly
          this.console.log(`[Discovery] Landmark "${suggestion.landmark.name}" distance data: distanceFeet=${distanceFeet}, distance="${landmarkData.distance || 'not set'}", floorPlanScale=${floorPlanScale}, distanceInPixels=${distanceInPixels}`);

          // Use bounding box for horizontal positioning within the FOV
          const bbox = landmarkData.boundingBox as [number, number, number, number] | undefined;

          let angleOffset: number;

          if (bbox && bbox.length >= 2) {
            // Use bounding box X for horizontal position in FOV
            const bboxCenterX = bbox[0] + (bbox[2] || 0) / 2; // 0 = left edge, 1 = right edge
            // Map X position to angle within FOV
            angleOffset = (bboxCenterX - 0.5) * 2 * halfFov;
            this.console.log(`[Discovery] Using bounding box [${bbox.join(',')}] for horizontal angle offset`);
          } else {
            // No bounding box - spread horizontally based on existing landmarks
            const cameraDeviceId = camera.deviceId;
            const existingFromCamera = (topology.landmarks || []).filter(l =>
              l.visibleFromCameras?.includes(cameraDeviceId) ||
              l.visibleFromCameras?.includes(camera.name)
            ).length;
            // Spread horizontally across FOV
            angleOffset = (existingFromCamera % 3 - 1) * halfFov * 0.6;
            this.console.log(`[Discovery] No bounding box, spreading horizontally (existing: ${existingFromCamera})`);
          }

          const finalAngle = dirRad + angleOffset;

          position = {
            x: camera.floorPlanPosition.x + Math.cos(finalAngle) * distanceInPixels,
            y: camera.floorPlanPosition.y + Math.sin(finalAngle) * distanceInPixels,
          };

          this.console.log(`[Discovery] Placing landmark "${suggestion.landmark.name}" at ${distanceFeet}ft (${distanceInPixels}px) from ${camera.name}: dir=${direction}°, angle=${(angleOffset * 180 / Math.PI).toFixed(1)}°`);
        } else {
          // Position in a grid pattern starting from center
          const landmarkCount = topology.landmarks?.length || 0;
          const gridSize = 80;
          const cols = 5;
          position = {
            x: 200 + (landmarkCount % cols) * gridSize,
            y: 100 + Math.floor(landmarkCount / cols) * gridSize,
          };
        }
      }

      // Add new landmark to topology
      const landmark: Landmark = {
        id: `landmark_${Date.now()}`,
        name: suggestion.landmark.name!,
        type: suggestion.landmark.type!,
        position,
        description: suggestion.landmark.description,
        visibleFromCameras: suggestion.landmark.visibleFromCameras,
        aiSuggested: true,
        aiConfidence: suggestion.confidence,
      };

      if (!topology.landmarks) {
        topology.landmarks = [];
      }
      topology.landmarks.push(landmark);
      updated = true;

      this.console.log(`[Discovery] Added landmark: ${landmark.name} at (${position.x}, ${position.y})`);
    }

    if (suggestion.type === 'zone' && suggestion.zone) {
      // Create a drawn zone from the discovery zone
      const zone = suggestion.zone;

      // Find cameras that see this zone
      const sourceCameras = suggestion.sourceCameras || [];
      const cameraRef = sourceCameras[0];
      const camera = cameraRef
        ? topology.cameras.find(c =>
            c.deviceId === cameraRef ||
            c.name === cameraRef ||
            c.name.toLowerCase() === cameraRef.toLowerCase()
          )
        : null;

      this.console.log(`[Discovery] Processing zone "${zone.name}" from camera ref="${cameraRef}"`);
      if (camera) {
        this.console.log(`[Discovery] Matched camera: ${camera.name} (${camera.deviceId})`);
      } else if (cameraRef) {
        this.console.warn(`[Discovery] No camera matched for zone source ref="${cameraRef}"`);
      }

      // Create zone polygon WITHIN the camera's field of view
      let polygon: { x: number; y: number }[] = [];
      const timestamp = Date.now();

      if (camera?.floorPlanPosition) {
        // Get camera's FOV direction (cast to any for flexible access)
        const fov = (camera.fov || { mode: 'simple', angle: 90, direction: 0, range: 80 }) as any;
        const direction = fov.direction || 0;
        const fovAngle = fov.angle || 90;

        // Get floor plan scale (pixels per foot)
        const floorPlanScale = topology.floorPlanScale || 5;

        // Convert direction to radians (0 = up/north, 90 = right/east)
        const dirRad = (direction - 90) * Math.PI / 180;
        const halfFov = (fovAngle / 2) * Math.PI / 180;

        const camX = camera.floorPlanPosition.x;
        const camY = camera.floorPlanPosition.y;

        // Use distanceFeet from the zone metadata for accurate positioning
        const zoneData = zone as any;
        const distanceFeet = zoneData.distanceFeet || 40; // Default 40ft if not set
        const distanceInPixels = distanceFeet * floorPlanScale;

        // Zone size based on coverage (larger coverage = wider zone)
        const zoneWidthFeet = Math.sqrt(zone.coverage) * 30; // e.g., 50% coverage = ~21ft wide
        const zoneWidthPixels = zoneWidthFeet * floorPlanScale;
        const zoneDepthPixels = (zone.coverage * 20) * floorPlanScale; // Depth based on coverage

        // Use bounding box for horizontal positioning if available
        const bbox = zone.boundingBox; // [x, y, width, height] normalized 0-1

        let angleStart: number;
        let angleEnd: number;
        let innerRadius: number;
        let outerRadius: number;

        if (bbox && bbox.length >= 4) {
          // Map bounding box X to angle within FOV
          const bboxLeft = bbox[0];
          const bboxRight = bbox[0] + bbox[2];
          angleStart = dirRad + (bboxLeft - 0.5) * 2 * halfFov;
          angleEnd = dirRad + (bboxRight - 0.5) * 2 * halfFov;

          // Use distanceFeet for depth, with a spread based on coverage
          innerRadius = Math.max(distanceInPixels - zoneDepthPixels / 2, 10);
          outerRadius = distanceInPixels + zoneDepthPixels / 2;

          this.console.log(`[Discovery] Zone "${zone.name}" at ${distanceFeet}ft using bbox [${bbox.join(',')}]`);
        } else {
          // Fallback: wedge-shaped zone covering portion of FOV
          const existingFromCamera = (topology.drawnZones || []).filter((z: any) =>
            z.linkedCameras?.includes(sourceCameras[0])
          ).length;

          // Spread horizontally based on existing zones
          const offset = (existingFromCamera % 3 - 1) * halfFov * 0.5;
          angleStart = dirRad + offset - halfFov * 0.3;
          angleEnd = dirRad + offset + halfFov * 0.3;

          // Use distanceFeet for depth
          innerRadius = Math.max(distanceInPixels - zoneDepthPixels / 2, 10);
          outerRadius = distanceInPixels + zoneDepthPixels / 2;

          this.console.log(`[Discovery] Zone "${zone.name}" at ${distanceFeet}ft using fallback spread`);
        }

        // Create arc polygon
        const steps = 8;
        // Inner arc (from start angle to end angle)
        for (let i = 0; i <= steps; i++) {
          const angle = angleStart + (angleEnd - angleStart) * i / steps;
          polygon.push({
            x: camX + Math.cos(angle) * innerRadius,
            y: camY + Math.sin(angle) * innerRadius,
          });
        }
        // Outer arc (from end angle to start angle)
        for (let i = steps; i >= 0; i--) {
          const angle = angleStart + (angleEnd - angleStart) * i / steps;
          polygon.push({
            x: camX + Math.cos(angle) * outerRadius,
            y: camY + Math.sin(angle) * outerRadius,
          });
        }

        this.console.log(`[Discovery] Creating zone "${zone.name}" at ${distanceFeet}ft (${distanceInPixels}px) from ${camera.name}`);
      } else {
        // Fallback: rectangular zone at default location
        const centerX = 300 + (topology.drawnZones?.length || 0) * 120;
        const centerY = 200;
        const size = 100;
        polygon = [
          { x: centerX - size/2, y: centerY - size/2 },
          { x: centerX + size/2, y: centerY - size/2 },
          { x: centerX + size/2, y: centerY + size/2 },
          { x: centerX - size/2, y: centerY + size/2 },
        ];
      }

      // 1. Create DrawnZone (visual on floor plan)
      const drawnZone = {
        id: `zone_${timestamp}`,
        name: zone.name,
        type: (zone.type || 'custom') as DrawnZoneType,
        description: zone.description,
        polygon: polygon as any,
        linkedCameras: sourceCameras,
      };

      if (!topology.drawnZones) {
        topology.drawnZones = [];
      }
      topology.drawnZones.push(drawnZone);

      // 2. Create GlobalZone (for tracking/alerting)
      const globalZoneType = this.mapZoneTypeToGlobalType(zone.type);
      const cameraZones: CameraZoneMapping[] = sourceCameras
        .map(camRef => {
          const cam = topology.cameras.find(c =>
            c.deviceId === camRef ||
            c.name === camRef ||
            c.name.toLowerCase() === camRef.toLowerCase()
          );
          if (!cam) {
            this.console.warn(`[Discovery] GlobalZone: No camera matched for ref="${camRef}"`);
            return null;
          }
          return {
            cameraId: cam.deviceId,
            zone: [[0, 0], [100, 0], [100, 100], [0, 100]] as ClipPath, // Full frame default
          };
        })
        .filter((z): z is CameraZoneMapping => z !== null);

      if (cameraZones.length > 0) {
        const globalZone: GlobalZone = {
          id: `global_${timestamp}`,
          name: zone.name,
          type: globalZoneType,
          cameraZones,
        };

        if (!topology.globalZones) {
          topology.globalZones = [];
        }
        topology.globalZones.push(globalZone);
        this.console.log(`[Discovery] Added zone: ${zone.name} (${zone.type}) - DrawnZone and GlobalZone created`);
      } else {
        this.console.log(`[Discovery] Added zone: ${zone.name} (${zone.type}) - DrawnZone only (no cameras matched)`);
      }

      updated = true;
    }

    if (suggestion.type === 'connection' && suggestion.connection) {
      // Add new connection to topology
      const conn = suggestion.connection;

      // Resolve camera references - LLM may return names instead of deviceIds
      // Use case-insensitive matching for names
      const fromCamera = topology.cameras.find(c =>
        c.deviceId === conn.fromCameraId ||
        c.name === conn.fromCameraId ||
        c.name.toLowerCase() === conn.fromCameraId.toLowerCase()
      );
      const toCamera = topology.cameras.find(c =>
        c.deviceId === conn.toCameraId ||
        c.name === conn.toCameraId ||
        c.name.toLowerCase() === conn.toCameraId.toLowerCase()
      );

      // Don't create connection if cameras not found
      if (!fromCamera || !toCamera) {
        this.console.warn(`[Discovery] Cannot create connection: camera not found. from="${conn.fromCameraId}" to="${conn.toCameraId}"`);
        this.console.warn(`[Discovery] Available cameras: ${topology.cameras.map(c => `${c.name} (${c.deviceId})`).join(', ')}`);
        return;
      }

      // Check if connection already exists
      const existingConn = topology.connections.find(c =>
        (c.fromCameraId === fromCamera.deviceId && c.toCameraId === toCamera.deviceId) ||
        (c.bidirectional && c.fromCameraId === toCamera.deviceId && c.toCameraId === fromCamera.deviceId)
      );
      if (existingConn) {
        this.console.log(`[Discovery] Connection already exists between ${fromCamera.name} and ${toCamera.name}`);
        return;
      }

      // Warn if cameras don't have positions yet
      if (!fromCamera.floorPlanPosition || !toCamera.floorPlanPosition) {
        this.console.warn(`[Discovery] Note: One or both cameras not positioned on floor plan yet`);
      }

      const newConnection = {
        id: `conn_${Date.now()}`,
        fromCameraId: fromCamera.deviceId,
        toCameraId: toCamera.deviceId,
        bidirectional: conn.bidirectional,
        // Default exit/entry zones covering full frame
        exitZone: [[0, 0], [100, 0], [100, 100], [0, 100]] as [number, number][],
        entryZone: [[0, 0], [100, 0], [100, 100], [0, 100]] as [number, number][],
        transitTime: {
          typical: conn.transitSeconds * 1000,
          min: Math.max(1000, conn.transitSeconds * 500),
          max: conn.transitSeconds * 2000,
        },
        name: conn.via ? `Via ${conn.via}` : undefined,
      };

      topology.connections.push(newConnection);
      updated = true;

      this.console.log(`[Discovery] Added connection: ${fromCamera.name} (${fromCamera.deviceId}) -> ${toCamera.name} (${toCamera.deviceId})`);
    }

    if (updated) {
      // Save updated topology
      this.storage.setItem('topology', JSON.stringify(topology));
      this.trackingEngine.updateTopology(topology);
    }
  }

  /** Map discovered zone types to GlobalZone types for tracking/alerting */
  private mapZoneTypeToGlobalType(type: string): GlobalZoneType {
    const mapping: Record<string, GlobalZoneType> = {
      'yard': 'dwell',
      'driveway': 'entry',
      'street': 'entry',
      'patio': 'dwell',
      'walkway': 'entry',
      'parking': 'dwell',
      'garden': 'dwell',
      'pool': 'restricted',
      'entrance': 'entry',
      'garage': 'entry',
      'deck': 'dwell',
      'custom': 'dwell',
    };
    return mapping[type] || 'dwell';
  }

  private serveEditorUI(response: HttpResponse): void {
    response.send(EDITOR_HTML, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  private serveTrainingUI(response: HttpResponse): void {
    response.send(TRAINING_HTML, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  private serveStaticFile(path: string, response: HttpResponse): void {
    // Serve static files for the UI
    response.send('Not found', { code: 404 });
  }

  // ==================== Readme Implementation ====================

  async getReadmeMarkdown(): Promise<string> {
    return `
# Spatial Awareness Plugin

This plugin enables cross-camera object tracking across your entire NVR system.

## Features

- **Cross-Camera Tracking**: Correlate objects as they move between cameras
- **Journey History**: Complete path history for each tracked object
- **Entry/Exit Detection**: Know when objects enter or leave your property
- **Visual Floor Plan**: Configure camera topology with a visual editor
- **MQTT Integration**: Export tracking data to Home Assistant
- **REST API**: Query tracked objects and journeys programmatically
- **Smart Alerts**: Get notified about property entry/exit, unusual paths, and more

## Setup

1. **Add Cameras**: Select cameras with object detection in the plugin settings
2. **Configure Topology**: Define camera relationships and transit times
3. **Enable Integrations**: Optionally enable MQTT for Home Assistant
4. **Create Zones**: Add tracking zones for specific area monitoring

## API Endpoints

- \`GET /api/tracked-objects\` - List all tracked objects
- \`GET /api/journey/{id}\` - Get journey for specific object
- \`GET /api/topology\` - Get camera topology
- \`PUT /api/topology\` - Update camera topology
- \`GET /api/alerts\` - Get recent alerts

## Visual Editor

Access the visual topology editor at \`/ui/editor\` to configure camera relationships using a floor plan.

## Alert Types

- **Property Entry**: Object entered the property
- **Property Exit**: Object exited the property
- **Unusual Path**: Object took an unexpected route
- **Dwell Time**: Object lingered too long in an area
- **Restricted Zone**: Object entered a restricted area
`;
  }

  // ==================== Public Methods for Child Devices ====================

  getTrackingState(): TrackingState {
    return this.trackingState;
  }

  getAlertManager(): AlertManager {
    return this.alertManager;
  }

  getTopology(): CameraTopology | null {
    const topologyJson = this.storage.getItem('topology');
    return topologyJson ? JSON.parse(topologyJson) : null;
  }
}

export default SpatialAwarenessPlugin;
