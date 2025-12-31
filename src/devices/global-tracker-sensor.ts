/**
 * Global Tracker Sensor
 * Main hub device that provides property-wide occupancy tracking
 */

import {
  OccupancySensor,
  ScryptedDeviceBase,
  Settings,
  Setting,
  Readme,
  ScryptedNativeId,
} from '@scrypted/sdk';
import { TrackingState } from '../state/tracking-state';
import { TrackedObject, getJourneySummary, calculateDwellTime } from '../models/tracked-object';

export class GlobalTrackerSensor extends ScryptedDeviceBase
  implements OccupancySensor, Settings, Readme {

  private trackingState: TrackingState;
  private plugin: any;

  constructor(plugin: any, nativeId: ScryptedNativeId, trackingState: TrackingState) {
    super(nativeId);
    this.plugin = plugin;
    this.trackingState = trackingState;

    // Update occupancy when tracking state changes
    trackingState.onStateChange(() => this.updateOccupancy());

    // Initial update
    this.updateOccupancy();
  }

  /**
   * Update the occupied state based on active tracked objects
   */
  private updateOccupancy(): void {
    const activeCount = this.trackingState.getActiveCount();
    this.occupied = activeCount > 0;
  }

  // ==================== Settings Implementation ====================

  async getSettings(): Promise<Setting[]> {
    const active = this.trackingState.getActiveObjects();
    const all = this.trackingState.getAllObjects();
    const settings: Setting[] = [];

    // Summary stats
    settings.push({
      key: 'activeCount',
      title: 'Currently Active',
      type: 'string',
      readonly: true,
      value: `${active.length} object${active.length !== 1 ? 's' : ''}`,
      group: 'Status',
    });

    settings.push({
      key: 'totalTracked',
      title: 'Total Tracked (24h)',
      type: 'string',
      readonly: true,
      value: `${all.length} object${all.length !== 1 ? 's' : ''}`,
      group: 'Status',
    });

    // Active objects list
    if (active.length > 0) {
      settings.push({
        key: 'activeObjectsHeader',
        title: 'Active Objects',
        type: 'html',
        value: '<h4 style="margin: 0;">Currently Tracked</h4>',
        group: 'Active Objects',
      });

      for (const obj of active.slice(0, 10)) {
        const dwellTime = calculateDwellTime(obj);
        const dwellMinutes = Math.round(dwellTime / 60000);

        settings.push({
          key: `active-${obj.globalId}`,
          title: `${obj.className}${obj.label ? ` (${obj.label})` : ''}`,
          type: 'string',
          readonly: true,
          value: `Cameras: ${obj.activeOnCameras.join(', ')} | Time: ${dwellMinutes}m`,
          group: 'Active Objects',
        });
      }

      if (active.length > 10) {
        settings.push({
          key: 'moreActive',
          title: 'More',
          type: 'string',
          readonly: true,
          value: `...and ${active.length - 10} more`,
          group: 'Active Objects',
        });
      }
    }

    // Recent exits
    const recentExits = all
      .filter(o => o.state === 'exited')
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 5);

    if (recentExits.length > 0) {
      settings.push({
        key: 'recentExitsHeader',
        title: 'Recent Exits',
        type: 'html',
        value: '<h4 style="margin: 0;">Recently Exited</h4>',
        group: 'Recent Activity',
      });

      for (const obj of recentExits) {
        const exitTime = new Date(obj.lastSeen).toLocaleTimeString();
        const journey = getJourneySummary(obj);

        settings.push({
          key: `exit-${obj.globalId}`,
          title: `${obj.className} at ${exitTime}`,
          type: 'string',
          readonly: true,
          value: journey || 'No journey recorded',
          group: 'Recent Activity',
        });
      }
    }

    return settings;
  }

  async putSetting(key: string, value: any): Promise<void> {
    // No editable settings
  }

  // ==================== Readme Implementation ====================

  async getReadmeMarkdown(): Promise<string> {
    const active = this.trackingState.getActiveObjects();
    const all = this.trackingState.getAllObjects();

    // Generate stats
    const personCount = active.filter(o => o.className === 'person').length;
    const vehicleCount = active.filter(o => ['car', 'vehicle', 'truck'].includes(o.className)).length;
    const animalCount = active.filter(o => o.className === 'animal').length;

    let activeBreakdown = '';
    if (personCount > 0) activeBreakdown += `- People: ${personCount}\n`;
    if (vehicleCount > 0) activeBreakdown += `- Vehicles: ${vehicleCount}\n`;
    if (animalCount > 0) activeBreakdown += `- Animals: ${animalCount}\n`;

    return `
# Global Object Tracker

This sensor tracks the presence of objects across all connected cameras in your property.

## Current Status

**Occupied**: ${this.occupied ? 'Yes' : 'No'}

**Active Objects**: ${active.length}
${activeBreakdown || '- None currently'}

**Total Tracked (24h)**: ${all.length}

## How It Works

The Global Tracker combines detection events from all configured cameras to maintain a unified view of objects on your property. When an object moves from one camera's view to another, the system correlates these sightings to track the object's journey.

## States

- **Active**: Object is currently visible on camera
- **Pending**: Object left camera view, waiting for correlation
- **Exited**: Object left the property
- **Lost**: Object disappeared without exiting (timeout)

## Integration

This sensor can be used in automations:
- Trigger actions when property becomes occupied/unoccupied
- Create presence-based automations
- Monitor overall property activity
`;
  }
}
