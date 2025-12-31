/**
 * Alert Manager
 * Generates and dispatches alerts based on tracking events
 */

import sdk, { Notifier, Camera, ScryptedInterface, MediaObject } from '@scrypted/sdk';
import {
  Alert,
  AlertRule,
  AlertType,
  AlertDetails,
  AlertCondition,
  createAlert,
  createDefaultRules,
} from '../models/alert';
import { TrackedObject, GlobalTrackingId } from '../models/tracked-object';

const { systemManager, mediaManager } = sdk;

export class AlertManager {
  private rules: AlertRule[] = [];
  private recentAlerts: Alert[] = [];
  private cooldowns: Map<string, number> = new Map();
  private console: Console;
  private storage: Storage;
  private maxAlerts: number = 100;

  constructor(console: Console, storage: Storage) {
    this.console = console;
    this.storage = storage;
    this.loadRules();
  }

  /**
   * Check if an alert should be generated and send it
   */
  async checkAndAlert(
    type: AlertType,
    tracked: TrackedObject,
    details: Partial<AlertDetails>
  ): Promise<Alert | null> {
    // Find matching rule
    const rule = this.rules.find(r => r.type === type && r.enabled);
    if (!rule) return null;

    // Check if rule applies to this object class
    if (rule.objectClasses && rule.objectClasses.length > 0) {
      if (!rule.objectClasses.includes(tracked.className)) {
        return null;
      }
    }

    // Check if rule applies to this camera
    if (rule.cameraIds && rule.cameraIds.length > 0 && details.cameraId) {
      if (!rule.cameraIds.includes(details.cameraId)) {
        return null;
      }
    }

    // Check cooldown
    const cooldownKey = `${rule.id}:${tracked.globalId}`;
    const lastAlert = this.cooldowns.get(cooldownKey) || 0;
    if (rule.cooldown > 0 && Date.now() - lastAlert < rule.cooldown) {
      return null;
    }

    // Check conditions
    if (!this.evaluateConditions(rule.conditions, tracked)) {
      return null;
    }

    // Create alert
    const fullDetails: AlertDetails = {
      ...details,
      objectClass: tracked.className,
      objectLabel: tracked.label,
    };

    const alert = createAlert(
      type,
      tracked.globalId,
      fullDetails,
      rule.severity,
      rule.id
    );

    // Store alert
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.maxAlerts) {
      this.recentAlerts.pop();
    }

    // Update cooldown
    this.cooldowns.set(cooldownKey, Date.now());

    // Send notifications
    await this.sendNotifications(alert, rule);

    this.console.log(`Alert generated: [${alert.severity}] ${alert.message}`);

    return alert;
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    const notifierIds = rule.notifiers.length > 0
      ? rule.notifiers
      : this.getDefaultNotifiers();

    // Try to get a thumbnail from the camera
    let mediaObject: MediaObject | undefined;
    const cameraId = alert.details.toCameraId || alert.details.cameraId;
    if (cameraId) {
      try {
        const camera = systemManager.getDeviceById<Camera>(cameraId);
        if (camera && camera.interfaces?.includes(ScryptedInterface.Camera)) {
          mediaObject = await camera.takePicture();
        }
      } catch (e) {
        this.console.warn(`Failed to get thumbnail from camera ${cameraId}:`, e);
      }
    }

    for (const notifierId of notifierIds) {
      try {
        const notifier = systemManager.getDeviceById<Notifier>(notifierId);
        if (!notifier) {
          this.console.warn(`Notifier not found: ${notifierId}`);
          continue;
        }

        await notifier.sendNotification(
          this.getNotificationTitle(alert),
          {
            body: alert.message,
            data: {
              type: alert.type,
              severity: alert.severity,
              trackedObjectId: alert.trackedObjectId,
              timestamp: alert.timestamp,
            },
          },
          mediaObject
        );

        this.console.log(`Notification sent to ${notifierId}${mediaObject ? ' with thumbnail' : ''}`);
      } catch (e) {
        this.console.error(`Failed to send notification to ${notifierId}:`, e);
      }
    }
  }

  /**
   * Get notification title based on alert type
   */
  private getNotificationTitle(alert: Alert): string {
    const prefix = alert.severity === 'critical' ? '🚨 ' :
                   alert.severity === 'warning' ? '⚠️ ' : '';

    switch (alert.type) {
      case 'property_entry':
        return `${prefix}🚶 Entry Detected`;
      case 'property_exit':
        return `${prefix}🚶 Exit Detected`;
      case 'movement':
        return `${prefix}🚶 Movement Detected`;
      case 'unusual_path':
        return `${prefix}Unusual Path`;
      case 'dwell_time':
        return `${prefix}⏱️ Extended Presence`;
      case 'restricted_zone':
        return `${prefix}Restricted Zone Alert`;
      case 'lost_tracking':
        return `${prefix}Lost Tracking`;
      case 'reappearance':
        return `${prefix}Object Reappeared`;
      default:
        return `${prefix}Spatial Awareness Alert`;
    }
  }

  /**
   * Get default notifier IDs from storage
   */
  private getDefaultNotifiers(): string[] {
    try {
      // Try new multiple notifiers setting first
      const notifiers = this.storage.getItem('defaultNotifiers');
      if (notifiers) {
        // Could be JSON array or comma-separated string
        try {
          const parsed = JSON.parse(notifiers);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Not JSON, might be comma-separated or single value
          if (notifiers.includes(',')) {
            return notifiers.split(',').map(s => s.trim()).filter(Boolean);
          }
          return [notifiers];
        }
      }
      // Fallback to old single notifier setting
      const defaultNotifier = this.storage.getItem('defaultNotifier');
      return defaultNotifier ? [defaultNotifier] : [];
    } catch {
      return [];
    }
  }

  /**
   * Evaluate alert conditions against a tracked object
   */
  private evaluateConditions(
    conditions: AlertCondition[],
    tracked: TrackedObject
  ): boolean {
    for (const condition of conditions) {
      const value = this.getFieldValue(condition.field, tracked);

      switch (condition.operator) {
        case 'equals':
          if (value !== condition.value) return false;
          break;
        case 'not_equals':
          if (value === condition.value) return false;
          break;
        case 'contains':
          if (!String(value).includes(String(condition.value))) return false;
          break;
        case 'greater_than':
          if (Number(value) <= Number(condition.value)) return false;
          break;
        case 'less_than':
          if (Number(value) >= Number(condition.value)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Get a field value from tracked object by path
   */
  private getFieldValue(field: string, tracked: TrackedObject): any {
    const parts = field.split('.');
    let value: any = tracked;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): Alert[] {
    return this.recentAlerts.slice(0, limit);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.recentAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get alerts for a specific tracked object
   */
  getAlertsForObject(globalId: GlobalTrackingId): Alert[] {
    return this.recentAlerts.filter(a => a.trackedObjectId === globalId);
  }

  /**
   * Set alert rules
   */
  setRules(rules: AlertRule[]): void {
    this.rules = rules;
    this.saveRules();
  }

  /**
   * Get current rules
   */
  getRules(): AlertRule[] {
    return this.rules;
  }

  /**
   * Add or update a rule
   */
  upsertRule(rule: AlertRule): void {
    const index = this.rules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
      this.rules[index] = rule;
    } else {
      this.rules.push(rule);
    }
    this.saveRules();
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      this.saveRules();
      return true;
    }
    return false;
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.saveRules();
      return true;
    }
    return false;
  }

  /**
   * Load rules from storage
   */
  private loadRules(): void {
    try {
      const json = this.storage.getItem('alertRules');
      if (json) {
        this.rules = JSON.parse(json);
      } else {
        this.rules = createDefaultRules();
      }
    } catch (e) {
      this.console.error('Failed to load alert rules:', e);
      this.rules = createDefaultRules();
    }
  }

  /**
   * Save rules to storage
   */
  private saveRules(): void {
    try {
      this.storage.setItem('alertRules', JSON.stringify(this.rules));
    } catch (e) {
      this.console.error('Failed to save alert rules:', e);
    }
  }

  /**
   * Clear all cooldowns
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  /**
   * Clear alert history
   */
  clearHistory(): void {
    this.recentAlerts = [];
  }
}
