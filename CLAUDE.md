# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Scrypted plugin for cross-camera object tracking ("Spatial Awareness"). It correlates detected objects as they move between cameras, maintains global tracking state, and provides alerts for property entry/exit and movement patterns.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Deploy to local Scrypted server (127.0.0.1)
npm run scrypted-deploy

# Deploy to remote Scrypted server
npm run scrypted-deploy <ip-address>

# Debug in VS Code
# 1. Edit .vscode/settings.json with Scrypted server IP
# 2. Press F5 or use Run > Start Debugging

# Login to Scrypted (required once)
npx scrypted login
```

## Architecture

### Plugin Entry Point
- `src/main.ts` - Exports `SpatialAwarenessPlugin` class implementing `DeviceProvider`, `Settings`, `HttpRequestHandler`

### Core Tracking Engine
- `src/core/tracking-engine.ts` - Orchestrates detection events, correlation, and state updates
- `src/core/object-correlator.ts` - Multi-factor correlation algorithm (timing, visual, spatial, class)
- `src/core/transit-predictor.ts` - Predicts expected cameras and transit times

### Data Models
- `src/models/topology.ts` - Camera nodes, connections, zones
- `src/models/tracked-object.ts` - Global tracked object with journey history
- `src/models/alert.ts` - Alert types and rules

### State Management
- `src/state/tracking-state.ts` - In-memory store with persistence and change notifications

### Virtual Devices
- `src/devices/global-tracker-sensor.ts` - OccupancySensor for property-wide tracking
- `src/devices/tracking-zone.ts` - Zone-specific motion/occupancy sensors

## Key Scrypted Patterns

### Listening to Object Detection Events
```typescript
import sdk, { ScryptedInterface, ObjectsDetected } from '@scrypted/sdk';

const camera = sdk.systemManager.getDeviceById(cameraId);
camera.listen(ScryptedInterface.ObjectDetector, async (source, details, data) => {
  const results = data as ObjectsDetected;
  // results.detections[] contains ObjectDetectionResult items
});
```

### ObjectDetectionResult Structure
```typescript
{
  boundingBox: [x, y, width, height],  // normalized coordinates
  className: 'person' | 'car' | 'animal' | 'package',
  score: 0.95,  // confidence
  id: 'abc123',  // tracking ID (single camera)
  history: { firstSeen: number, lastSeen: number },
  movement: { moving: boolean },
  zones: string[],
  embedding?: string  // visual feature embedding (base64)
}
```

### StorageSettings Pattern
```typescript
import { StorageSettings } from '@scrypted/sdk/storage-settings';

storageSettings = new StorageSettings(this, {
  settingKey: {
    title: 'Setting Title',
    type: 'number',
    defaultValue: 30,
    group: 'GroupName',
  },
});
```

### DeviceProvider Pattern
```typescript
async getDevice(nativeId: string): Promise<any> {
  // Return or create device instance by nativeId
}

async releaseDevice(id: string, nativeId: string): Promise<void> {
  // Cleanup device
}
```

## Correlation Algorithm

Objects are correlated across cameras using weighted factors:
- **Timing (30%)**: Transit time within expected min/max range
- **Visual (35%)**: Embedding similarity (cosine distance)
- **Spatial (25%)**: Exit zone → Entry zone coherence
- **Class (10%)**: Object class must match

Threshold for automatic correlation: 0.6 (configurable)

## Camera Topology Configuration

Topology is stored as JSON with:
- `cameras[]` - Camera nodes with entry/exit point flags
- `connections[]` - Links between cameras with exit/entry zones and transit times
- `globalZones[]` - Named zones spanning multiple cameras

## API Endpoints

- `GET /api/tracked-objects` - All tracked objects
- `GET /api/journey/{globalId}` - Journey for specific object
- `GET|PUT /api/topology` - Camera topology config
- `GET /api/alerts` - Recent alerts
- `GET|POST /api/floor-plan` - Floor plan image (base64)
- `GET /ui/editor` - Visual topology editor

## MQTT Integration

When enabled, publishes to Home Assistant via MQTT:
- `{baseTopic}/occupancy/state` - ON/OFF occupancy
- `{baseTopic}/count/state` - Active object count
- `{baseTopic}/person_count/state` - People on property
- `{baseTopic}/vehicle_count/state` - Vehicles on property
- `{baseTopic}/state` - Full JSON state
- `{baseTopic}/alerts` - Alert events
- `{baseTopic}/events/entry|exit|transition` - Movement events

## Project Structure

```
src/
├── main.ts                    # Plugin entry point
├── core/
│   ├── tracking-engine.ts     # Central orchestrator
│   └── object-correlator.ts   # Cross-camera matching
├── models/
│   ├── topology.ts            # Camera topology types
│   ├── tracked-object.ts      # Tracked object types
│   └── alert.ts               # Alert types
├── devices/
│   ├── global-tracker-sensor.ts
│   └── tracking-zone.ts
├── state/
│   └── tracking-state.ts      # State management
├── alerts/
│   └── alert-manager.ts       # Alert generation
├── integrations/
│   └── mqtt-publisher.ts      # MQTT for Home Assistant
├── ui/
│   └── editor.html            # Visual topology editor
└── utils/
    └── id-generator.ts
```
