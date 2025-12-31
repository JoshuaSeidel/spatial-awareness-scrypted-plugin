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
- **Live Tracking** - Watch objects move in real-time

### AI Features (optional)
- **LLM Descriptions** - "Woman with stroller" instead of just "Person"
- **Auto-Learning** - Transit times adjust based on observations
- **Connection Suggestions** - System suggests new camera paths
- **Landmark Discovery** - AI identifies landmarks from footage

### Integrations
- **MQTT** - Home Assistant integration
- **REST API** - Query tracked objects programmatically

## Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Correlation Window | 30s | Max time for cross-camera matching |
| Correlation Threshold | 0.6 | Min confidence for auto-correlation |
| Loitering Threshold | 3s | Time before triggering alerts |
| Per-Object Cooldown | 30s | Min time between alerts for same object |
| LLM Rate Limit | 10s | Min time between LLM API calls |

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
