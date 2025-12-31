/**
 * Tracking Zone Device
 * Virtual sensor for monitoring specific areas across cameras
 */

import {
  MotionSensor,
  OccupancySensor,
  ScryptedDeviceBase,
  Settings,
  Setting,
  SettingValue,
  ScryptedNativeId,
  ScryptedInterface,
} from '@scrypted/sdk';
import { StorageSettings } from '@scrypted/sdk/storage-settings';
import { TrackingState } from '../state/tracking-state';
import { TrackedObject } from '../models/tracked-object';
import { GlobalZoneType } from '../models/topology';

export interface TrackingZoneConfig {
  type: GlobalZoneType;
  cameras: string[];
  dwellThreshold?: number;
}

export class TrackingZone extends ScryptedDeviceBase
  implements MotionSensor, OccupancySensor, Settings {

  private trackingState: TrackingState;
  private plugin: any;
  private config: TrackingZoneConfig = {
    type: 'entry',
    cameras: [],
  };

  storageSettings = new StorageSettings(this, {
    zoneType: {
      title: 'Zone Type',
      type: 'string',
      choices: ['entry', 'exit', 'dwell', 'restricted'],
      defaultValue: 'entry',
      description: 'Type of zone for alerting purposes',
    },
    cameras: {
      title: 'Cameras',
      type: 'device',
      multiple: true,
      deviceFilter: `interfaces.includes('${ScryptedInterface.ObjectDetector}')`,
      description: 'Cameras that make up this zone',
    },
    dwellThreshold: {
      title: 'Dwell Time Threshold (seconds)',
      type: 'number',
      defaultValue: 60,
      description: 'For dwell zones: alert if object stays longer than this',
    },
    trackClasses: {
      title: 'Track Object Types',
      type: 'string',
      multiple: true,
      choices: ['person', 'car', 'vehicle', 'animal', 'package'],
      description: 'Object types to monitor in this zone (empty = all)',
    },
  });

  constructor(
    plugin: any,
    nativeId: ScryptedNativeId,
    trackingState: TrackingState
  ) {
    super(nativeId);
    this.plugin = plugin;
    this.trackingState = trackingState;

    // Load config
    this.loadConfig();

    // Listen for state changes
    trackingState.onStateChange(() => this.evaluateZone());

    // Initial evaluation
    this.evaluateZone();
  }

  /**
   * Load configuration from storage
   */
  private loadConfig(): void {
    try {
      const configJson = this.storage.getItem('zoneConfig');
      if (configJson) {
        this.config = JSON.parse(configJson);
      }
    } catch (e) {
      this.console.error('Failed to load zone config:', e);
    }
  }

  /**
   * Save configuration to storage
   */
  private saveConfig(): void {
    try {
      this.storage.setItem('zoneConfig', JSON.stringify(this.config));
    } catch (e) {
      this.console.error('Failed to save zone config:', e);
    }
  }

  /**
   * Configure the zone programmatically
   */
  configure(config: Partial<TrackingZoneConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
    this.evaluateZone();
  }

  /**
   * Evaluate the zone state based on current tracking data
   */
  private evaluateZone(): void {
    const cameras = this.getCameraIds();
    if (cameras.length === 0) {
      this.occupied = false;
      this.motionDetected = false;
      return;
    }

    const trackClasses = this.storageSettings.values.trackClasses as string[] || [];
    let hasObject = false;
    let hasMovement = false;
    const now = Date.now();

    for (const cameraId of cameras) {
      const objects = this.trackingState.getObjectsOnCamera(cameraId);

      for (const obj of objects) {
        // Filter by class if specified
        if (trackClasses.length > 0 && !trackClasses.includes(obj.className)) {
          continue;
        }

        hasObject = true;

        // Check for recent movement
        const recentSightings = obj.sightings.filter(
          s => s.cameraId === cameraId && now - s.timestamp < 5000
        );

        if (recentSightings.some(s => s.detection.movement?.moving)) {
          hasMovement = true;
        }
      }
    }

    this.occupied = hasObject;
    this.motionDetected = hasMovement;
  }

  /**
   * Get camera IDs from settings
   */
  private getCameraIds(): string[] {
    const cameras = this.storageSettings.values.cameras;
    if (Array.isArray(cameras)) {
      return cameras as string[];
    }
    if (cameras) {
      return [cameras as string];
    }
    return this.config.cameras || [];
  }

  /**
   * Get objects currently in this zone
   */
  getObjectsInZone(): TrackedObject[] {
    const cameras = this.getCameraIds();
    const trackClasses = this.storageSettings.values.trackClasses as string[] || [];
    const objects: TrackedObject[] = [];
    const seen = new Set<string>();

    for (const cameraId of cameras) {
      for (const obj of this.trackingState.getObjectsOnCamera(cameraId)) {
        if (seen.has(obj.globalId)) continue;
        seen.add(obj.globalId);

        if (trackClasses.length === 0 || trackClasses.includes(obj.className)) {
          objects.push(obj);
        }
      }
    }

    return objects;
  }

  // ==================== Settings Implementation ====================

  async getSettings(): Promise<Setting[]> {
    const settings = await this.storageSettings.getSettings();

    // Add current status
    const objectsInZone = this.getObjectsInZone();

    settings.push({
      key: 'currentStatus',
      title: 'Current Status',
      type: 'string',
      readonly: true,
      value: this.occupied
        ? `Occupied: ${objectsInZone.length} object${objectsInZone.length !== 1 ? 's' : ''}`
        : 'Empty',
      group: 'Status',
    });

    if (objectsInZone.length > 0) {
      settings.push({
        key: 'objectsList',
        title: 'Objects in Zone',
        type: 'string',
        readonly: true,
        value: objectsInZone
          .map(o => `${o.className}${o.label ? ` (${o.label})` : ''}`)
          .join(', '),
        group: 'Status',
      });
    }

    return settings;
  }

  async putSetting(key: string, value: SettingValue): Promise<void> {
    await this.storageSettings.putSetting(key, value);

    // Update config based on settings
    this.config.type = this.storageSettings.values.zoneType as GlobalZoneType || 'entry';
    this.config.cameras = this.getCameraIds();
    this.config.dwellThreshold = (this.storageSettings.values.dwellThreshold as number || 60) * 1000;

    this.saveConfig();
    this.evaluateZone();
  }
}
