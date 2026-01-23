# Spatial Awareness - Scrypted Plugin

Cross-camera object tracking for Scrypted NVR. Track people, vehicles, and animals as they move across your property.

## What It Does

Instead of getting separate "person detected" alerts from each camera, get one coherent narrative:

> "Man in blue jacket entered via Driveway, walked to Front Door, left package, exited via Driveway" (2 min on property)

| Traditional Alerts | Spatial Awareness |
|-------------------|-------------------|
| Alert per camera | One alert per movement |
| "Person on Camera X" | "Person moving from X to Y" |
| No identity tracking | Same object tracked across cameras |
| Basic detection | Movement patterns, dwell time, unusual paths |

## Quick Start

### 1. Install
```bash
npx scrypted install @blueharford/scrypted-spatial-awareness
```

### 2. Train Your Property

The fastest setup is **Training Mode** - walk your property while the system learns:

1. Open plugin settings → Click **Training Mode**
2. Tap **Start Training** on your phone
3. Walk between cameras naturally
4. System auto-detects you and records transit times
5. Tap **End Training** → **Apply Results**

Done! Your camera topology is configured.

### 3. Configure Alerts

- Select notifiers (Pushover, email, etc.)
- Set loitering threshold (default: 3s)
- Set per-object cooldown (default: 30s)

## Features

### Core
- **Cross-Camera Tracking** - Correlate objects across cameras using timing, visual similarity, and spatial position
- **Journey History** - Complete path for each tracked object
- **Entry/Exit Detection** - Know when objects enter or leave your property
- **Smart Alerts** - Loitering thresholds and per-object cooldowns prevent spam

### Visual Editor
- **Floor Plan** - Upload image or draw with built-in tools
- **Drag & Drop** - Place cameras, draw connections
- **Polygon Zone Drawing** - Draw custom zones (yards, driveways, patios, etc.)
- **Live Tracking** - Watch objects move in real-time

### AI Features (optional)
- **LLM Descriptions** - "Woman with stroller" instead of just "Person"
- **Auto-Learning** - Transit times adjust based on observations
- **Connection Suggestions** - System suggests new camera paths
- **Landmark Discovery** - AI identifies landmarks from footage
- **Auto-Topology Discovery** - Vision LLM analyzes camera views to build topology

### Integrations
- **MQTT** - Home Assistant integration
- **REST API** - Query tracked objects programmatically

## Topology Configuration

The plugin uses topology data (landmarks, zones, connections) to generate meaningful alerts. Camera names are **not** used for location descriptions - only topology landmarks matter.

### Setting Up Landmarks

For best alert quality, configure landmarks in the topology editor:

1. **Entry/Exit Points** - Mark where people enter/exit your property
   - Examples: `Driveway`, `Front Gate`, `Side Gate`, `Street`
   - Set `isEntryPoint: true` or `isExitPoint: true`

2. **Access Points** - Paths and walkways
   - Examples: `Front Walkway`, `Back Path`, `Garage Door`
   - Type: `access`

3. **Zones** - Areas of your property
   - Examples: `Front Yard`, `Back Yard`, `Side Yard`, `Patio`
   - Type: `zone`

4. **Structures** - Buildings and fixed features
   - Examples: `Garage`, `Shed`, `Front Porch`, `Deck`
   - Type: `structure`

5. **Features** - Other notable landmarks
   - Examples: `Mailbox`, `Pool`, `Garden`, `Trash Cans`
   - Type: `feature`

### Linking Landmarks to Cameras

Each camera should have `visibleLandmarks` configured - the landmarks visible in that camera's view:

```json
{
  "cameras": [{
    "deviceId": "abc123",
    "name": "Front Camera",
    "context": {
      "visibleLandmarks": ["front-door", "driveway", "mailbox"]
    }
  }]
}
```

### Example Topology

```json
{
  "landmarks": [
    { "id": "driveway", "name": "Driveway", "type": "access", "isEntryPoint": true },
    { "id": "front-door", "name": "Front Door", "type": "access" },
    { "id": "backyard", "name": "Back Yard", "type": "zone" },
    { "id": "garage", "name": "Garage", "type": "structure" }
  ]
}
```

With proper landmarks, alerts become rich and contextual:
- "Person arrived at the Driveway from Main Street"
- "Person moved from the Front Porch heading towards the Back Yard"
- "Person left the Garage towards Driveway after 2m on property - visited Driveway > Front Door > Garage"

## Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Correlation Window | 30s | Max time for cross-camera matching |
| Correlation Threshold | 0.35 | Min confidence for auto-correlation |
| Loitering Threshold | 3s | Time before triggering alerts |
| Minimum Detection Confidence | 0.5 | Ignore detections below this score |
| Per-Object Cooldown | 30s | Min time between alerts for same object |
| Notify on Alert Updates | Off | Send notifications when an existing alert updates |
| Alert Update Cooldown | 60s | Min time between update notifications |
| LLM Rate Limit | 5s | Min time between LLM API calls |

### Alert Types

| Alert | Description |
|-------|-------------|
| Property Entry | Object entered via entry point |
| Property Exit | Object exited via exit point |
| Movement | Object moved between cameras |
| Unusual Path | Object took unexpected route |
| Dwell Time | Object lingered >5 minutes |

## API

Base URL: `/endpoint/@blueharford/scrypted-spatial-awareness`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tracked-objects` | GET | List tracked objects |
| `/api/journey/{id}` | GET | Get object journey |
| `/api/topology` | GET/PUT | Camera topology |
| `/api/alerts` | GET | Recent alerts |
| `/api/live-tracking` | GET | Real-time object positions |
| `/ui/editor` | GET | Visual topology editor |
| `/ui/training` | GET | Training mode UI |

### Training API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/training/start` | POST | Start training session |
| `/api/training/end` | POST | End session, get results |
| `/api/training/apply` | POST | Apply results to topology |
| `/api/training/status` | GET | Current training status |

### Discovery API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/discovery/scan` | POST | Run full discovery scan |
| `/api/discovery/status` | GET | Current discovery status |
| `/api/discovery/suggestions` | GET | Pending suggestions |
| `/api/discovery/camera/{id}` | GET | Analyze single camera |

## Auto-Topology Discovery

The plugin can automatically analyze camera views using a vision-capable LLM to discover landmarks, zones, and camera connections.

### How It Works

1. **Capture Snapshots** - System takes a picture from each camera
2. **Scene Analysis** - Vision LLM identifies landmarks, zones, and edges in each view
3. **Cross-Camera Correlation** - LLM correlates findings across cameras to identify shared landmarks and connections
4. **Suggestions** - Discoveries are presented as suggestions you can accept or reject

### Using Discovery

**Manual Scan:**
1. Open the topology editor (`/ui/editor`)
2. Find the "Auto-Discovery" section in the sidebar
3. Click "Scan Now"
4. Review and accept/reject suggestions

**Automatic Scan:**
- Set `Auto-Discovery Interval (hours)` in plugin settings
- System will periodically scan and generate suggestions
- Set to 0 to disable automatic scanning

### Discovery Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-Discovery Interval | 0 (disabled) | Hours between automatic scans (0 = disabled) |
| Min Landmark Confidence | 0.6 | Minimum confidence for landmark suggestions |
| Min Connection Confidence | 0.5 | Minimum confidence for connection suggestions |
| Auto-Accept Threshold | 0.85 | Auto-accept suggestions above this confidence |

> **Rate Limiting Note:** If you set the interval to less than 1 hour, a warning will appear in the discovery status. Frequent scans can consume significant LLM API quota and may be rate-limited by your provider.

### Requirements

- **Vision-capable LLM** - Install @scrypted/llm with a vision model (OpenAI GPT-4V, Claude, etc.)
- **Camera access** - Plugin needs camera.takePicture() capability

### What Gets Discovered

- **Landmarks**: Doors, gates, mailbox, garage, structures, fences
- **Zones**: Front yard, driveway, patio, street, walkways
- **Connections**: Suggested camera paths with transit time estimates
- **Edges**: What's visible at frame boundaries (for correlation)

## Zone Drawing

The visual editor includes a polygon zone drawing tool for marking areas on your floor plan.

### How to Draw Zones

1. Click the **Draw Zone** button in the toolbar (green)
2. Enter a zone name and select the type (yard, driveway, patio, etc.)
3. Click **Start Drawing**
4. Click on the canvas to add polygon points
5. **Double-click** or press **Enter** to finish the zone
6. Press **Escape** to cancel, **Backspace** to undo last point

### Zone Types

| Type | Color | Description |
|------|-------|-------------|
| Yard | Green | Front yard, backyard, side yard |
| Driveway | Gray | Driveway, parking area |
| Street | Dark Gray | Street, sidewalk |
| Patio | Orange | Patio, deck |
| Walkway | Brown | Walkways, paths |
| Parking | Light Gray | Parking lot, parking space |
| Garden | Light Green | Garden, landscaped area |
| Pool | Blue | Pool area |
| Garage | Medium Gray | Garage area |
| Entrance | Pink | Entry areas |
| Custom | Purple | Custom zone type |

### Using Zones

- Click on a zone to select it and edit its properties
- Zones are color-coded by type for easy identification
- Zones help provide context for object movement descriptions
- Auto-Discovery can suggest zones based on camera analysis

## MQTT Topics

Base: `scrypted/spatial-awareness`

| Topic | Description |
|-------|-------------|
| `/occupancy/state` | ON/OFF property occupancy |
| `/count/state` | Active object count |
| `/person_count/state` | People on property |
| `/alerts` | Alert events |
| `/events/entry` | Entry events |
| `/events/exit` | Exit events |

## How Correlation Works

When an object is detected on a new camera, the system scores potential matches:

| Factor | Weight | Description |
|--------|--------|-------------|
| Timing | 30% | Transit time within expected range |
| Visual | 35% | Embedding similarity (if available) |
| Spatial | 25% | Exit zone → Entry zone coherence |
| Class | 10% | Object type match |

Objects are correlated if total score exceeds threshold (default: 0.6).

## Requirements

- Scrypted with NVR plugin
- Cameras with object detection (NVR, OpenVINO, CoreML, etc.)
- Optional: LLM plugin for rich descriptions
- Optional: MQTT broker for Home Assistant

## Development

```bash
npm install
npm run build
npm run scrypted-deploy
```

## License

Apache-2.0

## Author

Joshua Seidel ([@blueharford](https://github.com/blueharford))
