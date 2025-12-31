# Spatial Awareness - Scrypted Plugin

Cross-camera object tracking for Scrypted NVR with spatial awareness capabilities.

## Why This Plugin?

**Traditional camera notifications** tell you *what* was detected on *which* camera:
> "Person detected on Front Door camera"

**Spatial Awareness** tells you *where they came from* and *where they're going*:
> "Man in blue jacket walking from Garage towards Front Door"

This plugin **tracks objects across your entire camera system**, understanding that the person who got out of a car in your driveway is the same person now walking to your front door. Instead of getting 5 separate "person detected" alerts from 5 cameras, you get one coherent narrative of movement across your property.

### Key Differences from Normal Notifications

| Feature | Normal Notifications | Spatial Awareness |
|---------|---------------------|-------------------|
| **Scope** | Single camera | Entire property |
| **Identity** | New detection each camera | Same object tracked across cameras |
| **Context** | "Person on Camera X" | "Person moving from X towards Y" |
| **Alert Volume** | Alert per camera per detection | One alert per significant movement |
| **Intelligence** | Basic detection | Movement patterns, unusual paths, dwell time |
| **LLM Integration** | None | Rich descriptions like "Woman with dog" |

## Use Cases

### Home Security
- **Delivery Tracking**: "Person arrived via Driveway, walked to Front Door, left package, exited via Driveway" (2 minutes on property)
- **Suspicious Activity**: "Person entered via Back Fence, lingered 5 minutes near Garage, unusual path - did not use normal entry points"
- **Family Awareness**: Know when family members arrive home and their path through the property

### Vehicle Monitoring
- **Guest Arrivals**: "Black SUV entered via Street, parked in Driveway"
- **Unusual Vehicles**: "Unknown vehicle circling property - seen on Street Camera, Side Camera, Street Camera again"

### Pet & Animal Tracking
- **Pet Location**: Track your dog's movement through the yard
- **Wildlife Alerts**: "Deer moving from Back Yard towards Garden"

### Property Management
- **Worker Tracking**: Know when contractors arrive, where they go, when they leave
- **Occupancy Patterns**: Understand traffic flow through your property

## Features

### Core Tracking
- **Cross-Camera Tracking**: Correlate objects (people, vehicles, animals) as they move between cameras
- **Journey History**: Complete path history for each tracked object across your property
- **Entry/Exit Detection**: Know when objects enter or leave your property
- **Movement Alerts**: Get notified when objects move between camera zones
- **Smart Cooldowns**: Prevent alert spam with per-object cooldowns
- **Loitering Threshold**: Only alert after objects are visible for a configurable duration
- **Multiple Notifiers**: Send alerts to multiple notification services simultaneously

### LLM-Enhanced Descriptions
- **Rich Contextual Alerts**: Get alerts like "Man in red shirt walking from garage towards front door" (requires LLM plugin)
- **Configurable Rate Limiting**: Prevent LLM API overload with configurable debounce intervals
- **Automatic Fallback**: Falls back to basic notifications when LLM is slow or unavailable
- **Configurable Timeouts**: Set maximum wait time for LLM responses

### Visual Floor Plan Editor
- **Drag-and-Drop**: Place cameras, landmarks, and connections visually
- **Live Tracking Overlay**: See tracked objects move across your floor plan in real-time
- **Journey Visualization**: Click any tracked object to see their complete path drawn on the floor plan
- **Drawing Tools**: Add walls, rooms, and labels without needing an image

### Spatial Intelligence
- **Landmarks & Static Objects**: Define landmarks like mailbox, shed, driveway, deck to give the system spatial context
- **Camera Context**: Describe where each camera is mounted and what it can see for richer descriptions
- **Field of View Configuration**: Define camera FOV (simple angle or polygon) to understand coverage overlap
- **RAG-Powered Reasoning**: Uses Retrieval-Augmented Generation to understand property layout for intelligent descriptions
- **AI Landmark Suggestions**: System learns to identify landmarks from camera footage over time
- **Spatial Relationships**: Auto-inferred relationships between cameras and landmarks based on position

### Automatic Learning
- **Transit Time Learning**: Automatically adjusts connection transit times based on observed movement patterns
- **Connection Suggestions**: System suggests new camera connections based on observed object movements
- **Confidence Scoring**: Suggestions include confidence scores based on consistency of observations
- **One-Click Approval**: Accept or reject suggestions directly from the topology editor

### Training Mode (NEW in v0.4.0)
- **Guided Walkthrough**: Walk your property and let the system learn your camera layout
- **Mobile-Optimized UI**: Designed for phone use while walking around
- **Auto Camera Detection**: System detects you automatically as you walk
- **Transit Time Recording**: Learns actual transit times between cameras
- **Overlap Detection**: Identifies where camera coverage overlaps
- **Landmark Marking**: Mark landmarks (mailbox, gate, etc.) as you encounter them
- **One-Click Setup**: Apply training results to generate your complete topology

### Integrations
- **MQTT Integration**: Export tracking data to Home Assistant for automations
- **REST API**: Query tracked objects and journeys programmatically

## Installation

### From NPM (Recommended)
```bash
npm install @blueharford/scrypted-spatial-awareness
```

### From Scrypted Plugin Repository
1. Open Scrypted Management Console
2. Go to Plugins
3. Search for "@blueharford/scrypted-spatial-awareness"
4. Click Install

## Getting Started: Training Mode (NEW in v0.4.0)

The fastest way to set up Spatial Awareness is using **Training Mode** - a guided walkthrough where you physically walk around your property while the system learns your camera layout.

### Why Training Mode?

Instead of manually drawing connections and guessing transit times, simply:
1. Start training on your phone
2. Walk between cameras
3. The system automatically learns:
   - Which cameras can see you
   - How long it takes to walk between cameras
   - Where cameras overlap
   - Your property's layout

### Quick Start

1. **Open Training Mode**
   - Navigate to: `/endpoint/@blueharford/scrypted-spatial-awareness/ui/training`
   - Or scan the QR code in the plugin settings (mobile-optimized)

2. **Start Training**
   - Tap "Start Training"
   - The system begins listening for person detections

3. **Walk Your Property**
   - Walk to each camera on your property
   - The system detects you automatically and records:
     - Camera positions
     - Transit times between cameras
     - Camera overlaps (when both cameras see you)

4. **Mark Landmarks** (Optional)
   - Tap the "Mark" tab to add landmarks as you encounter them
   - Select type (mailbox, gate, shed, etc.) and name
   - Landmarks are associated with the current camera

5. **End Training**
   - When finished, tap "End Training"
   - Review the statistics: cameras visited, transits recorded, landmarks marked

6. **Apply Results**
   - Tap "Apply Results" to generate your topology
   - The system creates camera connections with learned transit times
   - Open the Topology Editor to fine-tune if needed

### Training Tips

- **Walk naturally** - Don't rush between cameras, walk at your normal pace
- **Hit every camera** - Try to be detected by each camera at least once
- **Create multiple transits** - Walk back and forth between cameras to improve accuracy
- **Mark key landmarks** - Mailbox, gates, driveway end, etc. help with contextual alerts
- **Re-train anytime** - Run training again to improve accuracy or add new cameras

### Mobile Access

Training Mode is designed to be used on your phone while walking. Access via:
```
https://[your-scrypted-server]/endpoint/@blueharford/scrypted-spatial-awareness/ui/training
```

## Setup (Manual)

1. **Configure Topology**:
   - Open the plugin settings
   - Click "Open Topology Editor"
   - Upload a floor plan image (or use the drawing tools to create one)
   - Place cameras on the floor plan
   - Mark entry/exit points
   - Draw connections between cameras with expected transit times

2. **Configure Alerts**:
   - Select one or more notifiers (Pushover, email, Home Assistant, etc.)
   - Adjust loitering threshold (how long before alerting)
   - Adjust per-object cooldown (prevent duplicate alerts)
   - Enable/disable specific alert types

3. **Optional - Enable LLM Descriptions**:
   - Install an LLM plugin (OpenAI, Ollama, etc.)
   - Enable "Use LLM for Rich Descriptions" in settings
   - Configure rate limiting and fallback options
   - Get alerts like "Woman with stroller" instead of just "Person"

4. **Optional - Enable MQTT**:
   - Enable MQTT integration
   - Configure broker URL and credentials
   - Use in Home Assistant automations

5. **Optional - Enable Learning Features**:
   - Enable "Learn Transit Times" to auto-adjust connection timing
   - Enable "Suggest Camera Connections" to discover new paths
   - Enable "Learn Landmarks from AI" for automatic landmark discovery

## How It Works

The plugin listens to object detection events from all configured cameras. When an object (person, car, animal, package) is detected:

1. **Same Camera**: If the object is already being tracked on this camera, the sighting is added to its history
2. **Cross-Camera Correlation**: If the object disappeared from another camera recently, the plugin attempts to correlate using:
   - **Timing (30%)**: Does the transit time match the expected range?
   - **Visual (35%)**: Do the visual embeddings match (if available)?
   - **Spatial (25%)**: Was the object in the exit zone of the previous camera and entry zone of the new camera?
   - **Class (10%)**: Is it the same type of object?
3. **New Object**: If no correlation is found, a new tracked object is created

### Loitering & Cooldown Logic

To prevent alert spam and reduce noise:

- **Loitering Threshold**: Object must be visible for X seconds before triggering any alerts (default: 3 seconds). This prevents alerts for someone briefly passing through frame.
- **Per-Object Cooldown**: After alerting for a specific tracked object, won't alert again for that same object for Y seconds (default: 30 seconds). This prevents "Person moving from A to B", "Person moving from B to C", "Person moving from C to D" spam.

### LLM Integration

When an LLM plugin is installed and enabled, the plugin will:
1. Check rate limiting (configurable, default: 10 second minimum between calls)
2. Capture a snapshot from the camera
3. Send it to the LLM with context about the movement
4. Apply timeout (configurable, default: 3 seconds) with automatic fallback
5. Get a rich description like "Man in blue jacket" or "Black pickup truck"
6. Include this in the notification

This transforms generic alerts into contextual, actionable information.

## Configuration Options

### Tracking Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Correlation Window | 30s | Maximum time to wait for cross-camera correlation |
| Correlation Threshold | 0.6 | Minimum confidence (0-1) for automatic correlation |
| Lost Timeout | 300s | Time before marking an object as lost |
| Visual Matching | ON | Use visual embeddings for correlation |
| Loitering Threshold | 3s | Object must be visible this long before alerting |
| Per-Object Cooldown | 30s | Minimum time between alerts for same object |

### AI & Spatial Reasoning Settings (NEW in v0.3.0)
| Setting | Default | Description |
|---------|---------|-------------|
| LLM Descriptions | ON | Use LLM plugin for rich descriptions |
| LLM Rate Limit | 10s | Minimum time between LLM API calls |
| Fallback to Basic | ON | Use basic notifications when LLM unavailable |
| LLM Timeout | 3s | Maximum time to wait for LLM response |
| Learn Transit Times | ON | Auto-adjust transit times from observations |
| Suggest Connections | ON | Suggest new camera connections |
| Learn Landmarks | ON | Allow AI to suggest landmarks |
| Landmark Confidence | 0.7 | Minimum confidence for landmark suggestions |

### Alert Types
| Alert | Description | Default |
|-------|-------------|---------|
| Property Entry | Object entered via an entry point | Enabled |
| Property Exit | Object exited via an exit point | Enabled |
| Movement | Object moved between cameras | Enabled |
| Unusual Path | Object took an unexpected route | Enabled |
| Dwell Time | Object lingered >5 minutes | Enabled |
| Restricted Zone | Object entered a restricted zone | Enabled |
| Lost Tracking | Object disappeared without exiting | Disabled |

### Notification Settings
- **Notifiers**: Select multiple notification services to receive alerts
- **Thumbnails**: Automatically includes camera snapshot with notifications

## API Endpoints

The plugin exposes a REST API via Scrypted's HTTP handler:

### Core Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tracked-objects` | GET | List all tracked objects |
| `/api/journey/{id}` | GET | Get journey for specific object |
| `/api/journey-path/{id}` | GET | Get journey path with positions for visualization |
| `/api/topology` | GET | Get camera topology configuration |
| `/api/topology` | PUT | Update camera topology |
| `/api/alerts` | GET | Get recent alerts |
| `/api/alert-rules` | GET/PUT | Get or update alert rules |
| `/api/cameras` | GET | List available cameras |
| `/api/floor-plan` | GET/POST | Get or upload floor plan image |
| `/ui/editor` | GET | Visual topology editor |

### Live Tracking Endpoints (NEW in v0.3.0)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/live-tracking` | GET | Get current state of all tracked objects |

### Landmark & Spatial Reasoning Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/landmarks` | GET | List all configured landmarks |
| `/api/landmarks` | POST | Add a new landmark |
| `/api/landmarks/{id}` | GET/PUT/DELETE | Get, update, or delete a landmark |
| `/api/landmark-suggestions` | GET | Get AI-suggested landmarks |
| `/api/landmark-suggestions/{id}/accept` | POST | Accept an AI suggestion |
| `/api/landmark-suggestions/{id}/reject` | POST | Reject an AI suggestion |
| `/api/landmark-templates` | GET | Get landmark templates for quick setup |
| `/api/infer-relationships` | GET | Get auto-inferred spatial relationships |

### Connection Suggestion Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/connection-suggestions` | GET | Get suggested camera connections |
| `/api/connection-suggestions/{id}/accept` | POST | Accept a connection suggestion |
| `/api/connection-suggestions/{id}/reject` | POST | Reject a connection suggestion |

### Training Mode Endpoints (NEW in v0.4.0)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/training/start` | POST | Start a new training session |
| `/api/training/pause` | POST | Pause the current training session |
| `/api/training/resume` | POST | Resume a paused training session |
| `/api/training/end` | POST | End the training session and get results |
| `/api/training/status` | GET | Get current training status and stats |
| `/api/training/landmark` | POST | Mark a landmark during training |
| `/api/training/apply` | POST | Apply training results to topology |
| `/ui/training` | GET | Mobile-optimized training UI |

## MQTT Topics

When MQTT is enabled, the plugin publishes to:

| Topic | Description |
|-------|-------------|
| `{baseTopic}/occupancy/state` | ON/OFF property occupancy |
| `{baseTopic}/count/state` | Number of active tracked objects |
| `{baseTopic}/person_count/state` | Number of people on property |
| `{baseTopic}/vehicle_count/state` | Number of vehicles on property |
| `{baseTopic}/state` | Full JSON state with all objects |
| `{baseTopic}/alerts` | Alert events |
| `{baseTopic}/events/entry` | Entry events |
| `{baseTopic}/events/exit` | Exit events |
| `{baseTopic}/events/transition` | Camera transition events |

Default base topic: `scrypted/spatial-awareness`

## Virtual Devices

The plugin creates these virtual devices in Scrypted:

### Global Object Tracker
- **Type**: Occupancy Sensor
- **Purpose**: Shows whether any objects are currently tracked on the property
- **Use**: Trigger automations when property becomes occupied/unoccupied

### Tracking Zones (User-Created)
- **Type**: Motion + Occupancy Sensor
- **Purpose**: Monitor specific areas across one or more cameras
- **Types**: Entry, Exit, Dwell, Restricted
- **Use**: Create zone-specific automations and alerts

## Example Alert Messages

With LLM enabled:
- "Man in blue jacket walking from Garage towards Front Door (5s transit)"
- "Black SUV driving from Street towards Driveway"
- "Woman with dog walking from Back Yard towards Side Gate"
- "Delivery person entered property via Driveway"

Without LLM:
- "Person moving from Garage towards Front Door (5s transit)"
- "Car moving from Street towards Driveway"
- "Dog moving from Back Yard towards Side Gate"

## Changelog

### v0.4.0
- **Training Mode**: Guided walkthrough to train the system by walking your property
- **Mobile-Optimized Training UI**: Phone-friendly interface for training while walking
- **Auto Camera Detection**: System automatically detects you as you walk between cameras
- **Transit Time Learning**: Records actual transit times during training
- **Camera Overlap Detection**: Identifies where multiple cameras see the same area
- **Landmark Marking**: Mark landmarks (mailbox, gate, etc.) during training sessions
- **One-Click Topology Generation**: Apply training results to create complete topology

### v0.3.0
- **Live Tracking Overlay**: View tracked objects in real-time on the floor plan
- **Journey Visualization**: Click any tracked object to see their complete path
- **Transit Time Learning**: Automatically adjusts connection times based on observations
- **Connection Suggestions**: System suggests new camera connections
- **LLM Rate Limiting**: Configurable debounce intervals to prevent API overload
- **LLM Fallback**: Automatic fallback to basic notifications when LLM is slow
- **LLM Timeout**: Configurable timeout with automatic fallback

### v0.2.0
- **Landmark System**: Add landmarks for spatial context
- **RAG Reasoning**: Context-aware movement descriptions
- **AI Learning**: Automatic landmark suggestions
- **Camera Context**: Rich camera descriptions for better alerts

### v0.1.0
- Initial release with cross-camera tracking
- Entry/exit detection
- Movement alerts
- MQTT integration
- Visual topology editor

## Requirements

- Scrypted with NVR plugin
- Cameras with object detection enabled (via Scrypted NVR, OpenVINO, CoreML, ONNX, or TensorFlow Lite)
- Optional: LLM plugin for rich descriptions (OpenAI, Ollama, etc.)
- Optional: MQTT broker for Home Assistant integration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Deploy to local Scrypted
npm run scrypted-deploy

# Debug in VS Code
# Edit .vscode/settings.json with your Scrypted server IP
# Press F5 to start debugging
```

## License

Apache-2.0

## Author

Joshua Seidel ([@blueharford](https://github.com/blueharford))
