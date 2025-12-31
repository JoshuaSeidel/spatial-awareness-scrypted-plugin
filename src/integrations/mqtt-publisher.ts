/**
 * MQTT Publisher
 * Publishes tracking state and alerts to MQTT for Home Assistant integration
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { TrackedObject } from '../models/tracked-object';
import { Alert } from '../models/alert';

export interface MqttConfig {
  broker: string;
  username?: string;
  password?: string;
  baseTopic: string;
}

export class MqttPublisher {
  private client: MqttClient | null = null;
  private config: MqttConfig;
  private console: Console;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: MqttConfig, console: Console) {
    this.config = config;
    this.console = console;
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const options: IClientOptions = {
      clientId: `scrypted-spatial-awareness-${Date.now()}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
    };

    if (this.config.username) {
      options.username = this.config.username;
      options.password = this.config.password;
    }

    try {
      this.client = mqtt.connect(this.config.broker, options);

      this.client.on('connect', () => {
        this.connected = true;
        this.console.log(`MQTT connected to ${this.config.broker}`);
        this.publishDiscovery();
      });

      this.client.on('error', (error) => {
        this.console.error('MQTT error:', error);
      });

      this.client.on('close', () => {
        this.connected = false;
        this.console.log('MQTT connection closed');
      });

      this.client.on('offline', () => {
        this.connected = false;
        this.console.log('MQTT offline');
      });
    } catch (e) {
      this.console.error('Failed to connect to MQTT:', e);
    }
  }

  /**
   * Disconnect from MQTT broker
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Publish Home Assistant MQTT discovery messages
   */
  private publishDiscovery(): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;

    // Occupancy sensor for property
    const occupancyConfig = {
      name: 'Property Occupancy',
      unique_id: 'spatial_awareness_occupancy',
      state_topic: `${baseTopic}/occupancy/state`,
      device_class: 'occupancy',
      payload_on: 'ON',
      payload_off: 'OFF',
      device: {
        identifiers: ['spatial_awareness'],
        name: 'Spatial Awareness',
        model: 'Cross-Camera Tracker',
        manufacturer: 'Scrypted',
      },
    };

    this.client.publish(
      `homeassistant/binary_sensor/spatial_awareness_occupancy/config`,
      JSON.stringify(occupancyConfig),
      { retain: true }
    );

    // Active count sensor
    const countConfig = {
      name: 'Active Tracked Objects',
      unique_id: 'spatial_awareness_count',
      state_topic: `${baseTopic}/count/state`,
      icon: 'mdi:account-multiple',
      device: {
        identifiers: ['spatial_awareness'],
      },
    };

    this.client.publish(
      `homeassistant/sensor/spatial_awareness_count/config`,
      JSON.stringify(countConfig),
      { retain: true }
    );

    // Person count sensor
    const personCountConfig = {
      name: 'People on Property',
      unique_id: 'spatial_awareness_person_count',
      state_topic: `${baseTopic}/person_count/state`,
      icon: 'mdi:account-group',
      device: {
        identifiers: ['spatial_awareness'],
      },
    };

    this.client.publish(
      `homeassistant/sensor/spatial_awareness_person_count/config`,
      JSON.stringify(personCountConfig),
      { retain: true }
    );

    // Vehicle count sensor
    const vehicleCountConfig = {
      name: 'Vehicles on Property',
      unique_id: 'spatial_awareness_vehicle_count',
      state_topic: `${baseTopic}/vehicle_count/state`,
      icon: 'mdi:car',
      device: {
        identifiers: ['spatial_awareness'],
      },
    };

    this.client.publish(
      `homeassistant/sensor/spatial_awareness_vehicle_count/config`,
      JSON.stringify(vehicleCountConfig),
      { retain: true }
    );

    this.console.log('MQTT discovery published');
  }

  /**
   * Publish current tracking state
   */
  publishState(objects: TrackedObject[]): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;
    const activeObjects = objects.filter(o => o.state === 'active' || o.state === 'pending');

    // Occupancy
    const occupied = activeObjects.length > 0;
    this.client.publish(`${baseTopic}/occupancy/state`, occupied ? 'ON' : 'OFF', { retain: true });

    // Counts
    this.client.publish(`${baseTopic}/count/state`, String(activeObjects.length), { retain: true });

    const personCount = activeObjects.filter(o => o.className === 'person').length;
    this.client.publish(`${baseTopic}/person_count/state`, String(personCount), { retain: true });

    const vehicleCount = activeObjects.filter(o =>
      ['car', 'vehicle', 'truck'].includes(o.className)
    ).length;
    this.client.publish(`${baseTopic}/vehicle_count/state`, String(vehicleCount), { retain: true });

    // Full state JSON
    const statePayload = {
      timestamp: Date.now(),
      occupied,
      activeCount: activeObjects.length,
      personCount,
      vehicleCount,
      objects: activeObjects.map(o => ({
        id: o.globalId,
        class: o.className,
        label: o.label,
        cameras: o.activeOnCameras,
        firstSeen: o.firstSeen,
        lastSeen: o.lastSeen,
        state: o.state,
      })),
    };

    this.client.publish(`${baseTopic}/state`, JSON.stringify(statePayload), { retain: true });
  }

  /**
   * Publish an alert
   */
  publishAlert(alert: Alert): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;

    const alertPayload = {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      timestamp: alert.timestamp,
      objectId: alert.trackedObjectId,
      details: alert.details,
    };

    // Publish to alerts topic
    this.client.publish(`${baseTopic}/alerts`, JSON.stringify(alertPayload));

    // Also publish to type-specific topic
    this.client.publish(`${baseTopic}/alerts/${alert.type}`, JSON.stringify(alertPayload));
  }

  /**
   * Publish object entry event
   */
  publishEntry(object: TrackedObject, cameraName: string): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;

    const payload = {
      event: 'entry',
      timestamp: Date.now(),
      object: {
        id: object.globalId,
        class: object.className,
        label: object.label,
      },
      camera: cameraName,
    };

    this.client.publish(`${baseTopic}/events/entry`, JSON.stringify(payload));
  }

  /**
   * Publish object exit event
   */
  publishExit(object: TrackedObject, cameraName: string): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;

    const payload = {
      event: 'exit',
      timestamp: Date.now(),
      object: {
        id: object.globalId,
        class: object.className,
        label: object.label,
        dwellTime: object.lastSeen - object.firstSeen,
      },
      camera: cameraName,
    };

    this.client.publish(`${baseTopic}/events/exit`, JSON.stringify(payload));
  }

  /**
   * Publish camera transition event
   */
  publishTransition(object: TrackedObject, fromCamera: string, toCamera: string): void {
    if (!this.client || !this.connected) return;

    const baseTopic = this.config.baseTopic;

    const payload = {
      event: 'transition',
      timestamp: Date.now(),
      object: {
        id: object.globalId,
        class: object.className,
        label: object.label,
      },
      from: fromCamera,
      to: toCamera,
    };

    this.client.publish(`${baseTopic}/events/transition`, JSON.stringify(payload));
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
