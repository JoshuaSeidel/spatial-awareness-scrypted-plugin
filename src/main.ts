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
import {
  CameraTopology,
  createEmptyTopology,
  Landmark,
  LandmarkSuggestion,
  LANDMARK_TEMPLATES,
  inferRelationships,
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

const { deviceManager, systemManager } = sdk;

const TRACKING_ZONE_PREFIX = 'tracking-zone:';
const GLOBAL_TRACKER_ID = 'global-tracker';

export class SpatialAwarenessPlugin extends ScryptedDeviceBase
  implements DeviceProvider, DeviceCreator, Settings, HttpRequestHandler, Readme {

  private trackingEngine: TrackingEngine | null = null;
  private trackingState: TrackingState;
  private alertManager: AlertManager;
  private mqttPublisher: MqttPublisher | null = null;
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
      defaultValue: 0.6,
      description: 'Minimum confidence (0-1) for automatic object correlation',
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
    objectAlertCooldown: {
      title: 'Per-Object Alert Cooldown (seconds)',
      type: 'number',
      defaultValue: 30,
      description: 'Minimum time between alerts for the same tracked object',
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

    // Alert Settings
    enableAlerts: {
      title: 'Enable Alerts',
      type: 'boolean',
      defaultValue: true,
      group: 'Alerts',
    },
    defaultNotifiers: {
      title: 'Notifiers',
      type: 'device',
      multiple: true,
      deviceFilter: `interfaces.includes('${ScryptedInterface.Notifier}')`,
      description: 'Select one or more notifiers to receive alerts',
      group: 'Alerts',
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

    // Alert Rules (stored as JSON)
    alertRules: {
      title: 'Alert Rules',
      type: 'string',
      hide: true,
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
      correlationWindow: (this.storageSettings.values.correlationWindow as number || 30) * 1000,
      correlationThreshold: this.storageSettings.values.correlationThreshold as number || 0.6,
      lostTimeout: (this.storageSettings.values.lostTimeout as number || 300) * 1000,
      useVisualMatching: this.storageSettings.values.useVisualMatching as boolean ?? true,
      loiteringThreshold: (this.storageSettings.values.loiteringThreshold as number || 3) * 1000,
      objectAlertCooldown: (this.storageSettings.values.objectAlertCooldown as number || 30) * 1000,
      useLlmDescriptions: this.storageSettings.values.useLlmDescriptions as boolean ?? true,
      enableLandmarkLearning: this.storageSettings.values.enableLandmarkLearning as boolean ?? true,
      landmarkConfidenceThreshold: this.storageSettings.values.landmarkConfidenceThreshold as number ?? 0.7,
    };

    this.trackingEngine = new TrackingEngine(
      topology,
      this.trackingState,
      this.alertManager,
      config,
      this.console
    );

    // Set up callback to save topology changes (e.g., from accepted landmark suggestions)
    this.trackingEngine.setTopologyChangeCallback((updatedTopology) => {
      this.storage.setItem('topology', JSON.stringify(updatedTopology));
      this.console.log('Topology auto-saved after change');
    });

    await this.trackingEngine.startTracking();
    this.console.log('Tracking engine started');
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
    const settings = await this.storageSettings.getSettings();

    // Topology editor button that opens modal overlay (appended to body for proper z-index)
    const onclickCode = `(function(){var e=document.getElementById('sa-topology-modal');if(e)e.remove();var m=document.createElement('div');m.id='sa-topology-modal';m.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:2147483647;display:flex;align-items:center;justify-content:center;';var c=document.createElement('div');c.style.cssText='width:95vw;height:92vh;max-width:1800px;background:#1a1a2e;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 25px 50px rgba(0,0,0,0.5);';var b=document.createElement('button');b.innerHTML='×';b.style.cssText='position:absolute;top:15px;right:15px;z-index:2147483647;background:#e94560;color:white;border:none;width:40px;height:40px;border-radius:50%;font-size:24px;cursor:pointer;';b.onclick=function(){m.remove();};var f=document.createElement('iframe');f.src='/endpoint/@blueharford/scrypted-spatial-awareness/ui/editor';f.style.cssText='width:100%;height:100%;border:none;';c.appendChild(b);c.appendChild(f);m.appendChild(c);m.onclick=function(ev){if(ev.target===m)m.remove();};document.body.appendChild(m);})()`;

    settings.push({
      key: 'topologyEditor',
      title: 'Topology Editor',
      type: 'html' as any,
      value: `
        <style>
          .sa-open-btn {
            background: linear-gradient(135deg, #e94560 0%, #0f3460 100%);
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .sa-open-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(233, 69, 96, 0.4);
          }
          .sa-btn-container {
            padding: 20px;
            background: #16213e;
            border-radius: 8px;
            text-align: center;
          }
          .sa-btn-desc {
            color: #888;
            margin-bottom: 15px;
            font-size: 14px;
          }
        </style>
        <div class="sa-btn-container">
          <p class="sa-btn-desc">Configure camera positions, connections, and transit times</p>
          <button class="sa-open-btn" onclick="${onclickCode}">
            <span>&#9881;</span> Open Topology Editor
          </button>
        </div>
      `,
      group: 'Topology',
    });

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

    // Add alert rules configuration UI
    const alertRules = this.alertManager.getRules();
    const rulesHtml = this.generateAlertRulesHtml(alertRules);
    settings.push({
      key: 'alertRulesEditor',
      title: 'Alert Rules',
      type: 'html' as any,
      value: rulesHtml,
      group: 'Alerts',
    });

    return settings;
  }

  private generateAlertRulesHtml(rules: any[]): string {
    const ruleRows = rules.map(rule => `
      <tr data-rule-id="${rule.id}">
        <td style="padding:8px;border-bottom:1px solid #333;">
          <input type="checkbox" ${rule.enabled ? 'checked' : ''}
                 onchange="(function(el){var rules=JSON.parse(localStorage.getItem('sa-temp-rules')||'[]');var r=rules.find(x=>x.id==='${rule.id}');if(r)r.enabled=el.checked;localStorage.setItem('sa-temp-rules',JSON.stringify(rules));})(this)" />
        </td>
        <td style="padding:8px;border-bottom:1px solid #333;color:#fff;">${rule.name}</td>
        <td style="padding:8px;border-bottom:1px solid #333;color:#888;">${rule.type}</td>
        <td style="padding:8px;border-bottom:1px solid #333;">
          <span style="padding:2px 8px;border-radius:4px;font-size:12px;background:${
            rule.severity === 'critical' ? '#e94560' :
            rule.severity === 'warning' ? '#f39c12' : '#3498db'
          };color:white;">${rule.severity}</span>
        </td>
        <td style="padding:8px;border-bottom:1px solid #333;color:#888;">${Math.round(rule.cooldown / 1000)}s</td>
      </tr>
    `).join('');

    const initCode = `localStorage.setItem('sa-temp-rules',JSON.stringify(${JSON.stringify(rules)}))`;
    const saveCode = `(function(){var rules=JSON.parse(localStorage.getItem('sa-temp-rules')||'[]');fetch('/endpoint/@blueharford/scrypted-spatial-awareness/api/alert-rules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(rules)}).then(r=>r.json()).then(d=>{if(d.success)alert('Alert rules saved!');else alert('Error: '+d.error);}).catch(e=>alert('Error: '+e));})()`;

    return `
      <style>
        .sa-rules-table { width:100%; border-collapse:collapse; margin-top:10px; }
        .sa-rules-table th { text-align:left; padding:10px 8px; border-bottom:2px solid #e94560; color:#e94560; font-size:13px; }
        .sa-save-rules-btn {
          background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 15px;
        }
        .sa-save-rules-btn:hover { opacity: 0.9; }
        .sa-rules-container { background:#16213e; border-radius:8px; padding:15px; }
        .sa-rules-desc { color:#888; font-size:13px; margin-bottom:10px; }
      </style>
      <div class="sa-rules-container">
        <p class="sa-rules-desc">Enable or disable alert types. Movement alerts notify you when someone moves between cameras.</p>
        <table class="sa-rules-table">
          <thead>
            <tr>
              <th style="width:40px;">On</th>
              <th>Alert Type</th>
              <th>Event</th>
              <th>Severity</th>
              <th>Cooldown</th>
            </tr>
          </thead>
          <tbody>
            ${ruleRows}
          </tbody>
        </table>
        <button class="sa-save-rules-btn" onclick="${saveCode}">Save Alert Rules</button>
        <script>(function(){${initCode}})();</script>
      </div>
    `;
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

      // UI Routes
      if (path.endsWith('/ui/editor') || path.endsWith('/ui/editor/')) {
        return this.serveEditorUI(response);
      }

      if (path.includes('/ui/')) {
        return this.serveStaticFile(path, response);
      }

      // Default: return info page
      response.send(JSON.stringify({
        name: 'Spatial Awareness Plugin',
        version: '0.1.0',
        endpoints: {
          api: {
            trackedObjects: '/api/tracked-objects',
            journey: '/api/journey/{globalId}',
            topology: '/api/topology',
            alerts: '/api/alerts',
            floorPlan: '/api/floor-plan',
          },
          ui: {
            editor: '/ui/editor',
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
      response.send(JSON.stringify(topology), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (request.method === 'PUT' || request.method === 'POST') {
      try {
        const topology = JSON.parse(request.body!) as CameraTopology;
        this.storage.setItem('topology', JSON.stringify(topology));
        await this.startTrackingEngine(topology);
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
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

  private handleFloorPlanRequest(request: HttpRequest, response: HttpResponse): void {
    if (request.method === 'GET') {
      const imageData = this.storage.getItem('floorPlanImage');
      if (imageData) {
        response.send(JSON.stringify({ imageData }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response.send(JSON.stringify({ imageData: null }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (request.method === 'POST') {
      try {
        const body = JSON.parse(request.body!);
        this.storage.setItem('floorPlanImage', body.imageData);
        response.send(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        response.send(JSON.stringify({ error: 'Invalid request body' }), {
          code: 400,
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

  private serveEditorUI(response: HttpResponse): void {
    response.send(EDITOR_HTML, {
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
