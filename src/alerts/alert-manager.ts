/**
 * Alert Manager
 * Generates and dispatches alerts based on tracking events
 */

import type { Notifier, Camera, MediaObject } from '@scrypted/sdk';
import {
  Alert,
  AlertRule,
  AlertType,
  AlertDetails,
  AlertCondition,
  createAlert,
  createDefaultRules,
  generateAlertMessage,
} from '../models/alert';
import { TrackedObject, GlobalTrackingId } from '../models/tracked-object';
import {
  getActiveAlertKey,
  hasMeaningfulAlertChange,
  shouldSendUpdateNotification,
} from './alert-utils';

let sdkModule: typeof import('@scrypted/sdk') | null = null;
const getSdk = async () => {
  if (!sdkModule) {
    sdkModule = await import('@scrypted/sdk');
  }
  return sdkModule;
};

export class AlertManager {
  private rules: AlertRule[] = [];
  private recentAlerts: Alert[] = [];
  private cooldowns: Map<string, number> = new Map();
  private activeAlerts: Map<string, { alert: Alert; lastUpdate: number; lastNotified: number }> = new Map();
  private readonly activeAlertTtlMs: number = 10 * 60 * 1000;
  private notifyOnUpdates: boolean = false;
  private updateNotificationCooldownMs: number = 60000;
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
    details: Partial<AlertDetails>,
    mediaObjectOverride?: MediaObject
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

    // Check conditions
    if (!this.evaluateConditions(rule.conditions, tracked)) {
      return null;
    }

    // Update existing movement alert if active (prevents alert spam)
    if (type === 'movement') {
      const updated = await this.updateActiveAlert(type, rule.id, tracked, details);
      if (updated) return updated;
    }

    // Check cooldown (only for new alerts)
    const cooldownKey = `${rule.id}:${tracked.globalId}`;
    const lastAlert = this.cooldowns.get(cooldownKey) || 0;
    if (rule.cooldown > 0 && Date.now() - lastAlert < rule.cooldown) {
      return null;
    }

    // Create alert
    // Note: details.objectLabel may contain LLM-generated description - preserve it if provided
    const fullDetails: AlertDetails = {
      ...details,
      objectClass: tracked.className,
      objectLabel: details.objectLabel || tracked.label,
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

    if (type === 'movement') {
      const key = getActiveAlertKey(type, rule.id, tracked.globalId);
      this.activeAlerts.set(key, { alert, lastUpdate: Date.now(), lastNotified: alert.timestamp });
    }

    // Update cooldown
    this.cooldowns.set(cooldownKey, Date.now());

    // Send notifications
    await this.sendNotifications(alert, rule, mediaObjectOverride);

    this.console.log(`Alert generated: [${alert.severity}] ${alert.message}`);

    return alert;
  }

  async updateMovementAlert(
    tracked: TrackedObject,
    details: Partial<AlertDetails>
  ): Promise<Alert | null> {
    const rule = this.rules.find(r => r.type === 'movement' && r.enabled);
    if (!rule) return null;

    if (rule.objectClasses && rule.objectClasses.length > 0) {
      if (!rule.objectClasses.includes(tracked.className)) {
        return null;
      }
    }

    if (rule.cameraIds && rule.cameraIds.length > 0 && details.cameraId) {
      if (!rule.cameraIds.includes(details.cameraId)) {
        return null;
      }
    }

    if (!this.evaluateConditions(rule.conditions, tracked)) {
      return null;
    }

    return this.updateActiveAlert('movement', rule.id, tracked, details);
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(
    alert: Alert,
    rule: AlertRule,
    mediaObjectOverride?: MediaObject
  ): Promise<void> {
    const sdkModule = await getSdk();
    const { ScryptedInterface } = sdkModule;
    const { systemManager } = sdkModule.default;
    const notifierIds = rule.notifiers.length > 0
      ? rule.notifiers
      : this.getDefaultNotifiers();

    // Debug: log which notifiers we're using
    this.console.log(`[Notification] Rule ${rule.id} has ${rule.notifiers.length} notifiers, using ${notifierIds.length} notifier(s): ${notifierIds.join(', ') || 'NONE'}`);

    if (notifierIds.length === 0) {
      this.console.warn(`[Notification] No notifiers configured! Configure a notifier in plugin settings.`);
      return;
    }

    // Try to get a thumbnail from the camera
    let mediaObject: MediaObject | undefined = mediaObjectOverride;
    if (!mediaObject) {
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

  clearActiveAlertsForObject(globalId: GlobalTrackingId): void {
    for (const [key, entry] of this.activeAlerts.entries()) {
      if (entry.alert.trackedObjectId === globalId) {
        this.activeAlerts.delete(key);
      }
    }
  }

  setUpdateNotificationOptions(enabled: boolean, cooldownMs: number): void {
    this.notifyOnUpdates = enabled;
    this.updateNotificationCooldownMs = Math.max(0, cooldownMs);
  }

  private async updateActiveAlert(
    type: AlertType,
    ruleId: string,
    tracked: TrackedObject,
    details: Partial<AlertDetails>
  ): Promise<Alert | null> {
    const key = getActiveAlertKey(type, ruleId, tracked.globalId);
    const existing = this.activeAlerts.get(key);
    if (!existing) return null;

    const now = Date.now();
    if (now - existing.lastUpdate > this.activeAlertTtlMs) {
      this.activeAlerts.delete(key);
      return null;
    }

    const updatedDetails: AlertDetails = {
      ...existing.alert.details,
      ...details,
      objectClass: tracked.className,
      objectLabel: details.objectLabel || tracked.label,
    };

    const shouldUpdate = hasMeaningfulAlertChange(existing.alert.details, updatedDetails);
    if (!shouldUpdate) return existing.alert;

    existing.alert.details = updatedDetails;
    existing.alert.message = generateAlertMessage(type, updatedDetails);
    existing.alert.timestamp = now;
    existing.lastUpdate = now;

    const idx = this.recentAlerts.findIndex(a => a.id === existing.alert.id);
    if (idx >= 0) {
      this.recentAlerts.splice(idx, 1);
    }
    this.recentAlerts.unshift(existing.alert);
    if (this.recentAlerts.length > this.maxAlerts) {
      this.recentAlerts.pop();
    }

    if (this.notifyOnUpdates) {
      const rule = this.rules.find(r => r.id === ruleId);
      if (rule && shouldSendUpdateNotification(this.notifyOnUpdates, existing.lastNotified, now, this.updateNotificationCooldownMs)) {
        existing.lastNotified = now;
        await this.sendNotifications(existing.alert, rule);
      }
    }

    return existing.alert;
  }


  /**
   * Get notification title based on alert type
   * For movement alerts with LLM descriptions, use the smart description as title
   */
  private getNotificationTitle(alert: Alert): string {
    const prefix = alert.severity === 'critical' ? '🚨 ' :
                   alert.severity === 'warning' ? '⚠️ ' : '';

    // Use object class in title
    const objectType = alert.details.objectClass
      ? alert.details.objectClass.charAt(0).toUpperCase() + alert.details.objectClass.slice(1)
      : 'Object';

    switch (alert.type) {
      case 'property_entry':
        // Legacy - use simple title
        return `${prefix}${objectType} Arrived`;
      case 'property_exit':
        // Legacy - use simple title
        return `${prefix}${objectType} Left`;
      case 'movement':
        // For smart activity alerts, use the LLM description as title if available
        // This gives us rich context like "Person walking toward front door"
        if (alert.details.objectLabel && alert.details.usedLlm) {
          // Truncate to reasonable title length (first sentence or 60 chars)
          let smartTitle = alert.details.objectLabel;
          const firstPeriod = smartTitle.indexOf('.');
          if (firstPeriod > 0 && firstPeriod < 60) {
            smartTitle = smartTitle.substring(0, firstPeriod);
          } else if (smartTitle.length > 60) {
            smartTitle = smartTitle.substring(0, 57) + '...';
          }
          return `${prefix}${smartTitle}`;
        }
        // Fallback: include destination in title
        const dest = alert.details.toCameraName || 'area';
        return `${prefix}${objectType} → ${dest}`;
      case 'unusual_path':
        return `${prefix}Unusual Route`;
      case 'dwell_time':
        return `${prefix}${objectType} Lingering`;
      case 'restricted_zone':
        return `${prefix}Restricted Zone!`;
      case 'lost_tracking':
        return `${prefix}${objectType} Lost`;
      case 'reappearance':
        return `${prefix}${objectType} Reappeared`;
      default:
        return `${prefix}Spatial Alert`;
    }
  }

  /**
   * Get default notifier IDs from storage
   */
  private getDefaultNotifiers(): string[] {
    try {
      // Try new multiple notifiers setting first
      const notifiers = this.storage.getItem('defaultNotifiers');
      this.console.log(`[Notifiers] Raw storage value: ${notifiers}`);

      if (notifiers) {
        // Could be JSON array or comma-separated string
        try {
          const parsed = JSON.parse(notifiers);
          if (Array.isArray(parsed)) {
            this.console.log(`[Notifiers] Parsed JSON array: ${parsed.join(', ')}`);
            return parsed;
          }
        } catch {
          // Not JSON, might be comma-separated or single value
          if (notifiers.includes(',')) {
            const result = notifiers.split(',').map(s => s.trim()).filter(Boolean);
            this.console.log(`[Notifiers] Parsed comma-separated: ${result.join(', ')}`);
            return result;
          }
          this.console.log(`[Notifiers] Single value: ${notifiers}`);
          return [notifiers];
        }
      }
      // Fallback to old single notifier setting
      const defaultNotifier = this.storage.getItem('defaultNotifier');
      this.console.log(`[Notifiers] Fallback single notifier: ${defaultNotifier || 'NONE'}`);
      return defaultNotifier ? [defaultNotifier] : [];
    } catch (e) {
      this.console.error(`[Notifiers] Error reading notifiers:`, e);
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
