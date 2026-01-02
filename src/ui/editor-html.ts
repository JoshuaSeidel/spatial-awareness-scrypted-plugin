/**
 * Editor HTML embedded as a string for bundling
 */

export const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spatial Awareness - Topology Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
    .container { display: flex; height: 100vh; }
    .sidebar { width: 300px; background: #16213e; border-right: 1px solid #0f3460; display: flex; flex-direction: column; overflow: hidden; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid #0f3460; }
    .sidebar-header h1 { font-size: 18px; font-weight: 600; margin-bottom: 5px; }
    .sidebar-header p { font-size: 12px; color: #888; }
    .sidebar-content { flex: 1; overflow-y: auto; padding: 15px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #888; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .btn { background: #0f3460; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; transition: background 0.2s; }
    .btn:hover { background: #1a4a7a; }
    .btn-primary { background: #e94560; }
    .btn-primary:hover { background: #ff6b6b; }
    .btn-small { padding: 4px 8px; font-size: 11px; }
    .camera-item, .connection-item { background: #0f3460; border-radius: 6px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: background 0.2s; }
    .camera-item:hover, .connection-item:hover { background: #1a4a7a; }
    .camera-item.selected, .connection-item.selected { outline: 2px solid #e94560; }
    .camera-name { font-weight: 500; margin-bottom: 4px; }
    .camera-info { font-size: 11px; color: #888; }
    .editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .toolbar { background: #16213e; border-bottom: 1px solid #0f3460; padding: 10px 20px; display: flex; gap: 10px; align-items: center; }
    .toolbar-group { display: flex; gap: 5px; padding-right: 15px; border-right: 1px solid #0f3460; margin-right: 5px; }
    .toolbar-group:last-child { border-right: none; }
    .canvas-container { flex: 1; position: relative; overflow: hidden; background: #0f0f1a; }
    #floor-plan-canvas { position: absolute; top: 0; left: 0; }
    .canvas-placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #666; }
    .canvas-placeholder h2 { margin-bottom: 15px; }
    .properties-panel { width: 280px; background: #16213e; border-left: 1px solid #0f3460; overflow-y: auto; padding: 15px; }
    .properties-panel h3 { font-size: 14px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #0f3460; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 5px; }
    .form-group input, .form-group select { width: 100%; padding: 8px 10px; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; color: #fff; font-size: 13px; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #e94560; }
    .checkbox-group { display: flex; align-items: center; gap: 8px; }
    .checkbox-group input[type="checkbox"] { width: auto; }
    .transit-time-inputs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .transit-time-inputs input { text-align: center; }
    .transit-time-labels { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 10px; color: #666; text-align: center; }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); z-index: 1000; align-items: center; justify-content: center; }
    .modal-overlay.active { display: flex; }
    .modal { background: #16213e; border-radius: 8px; padding: 25px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
    .modal h2 { margin-bottom: 20px; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
    .upload-zone { border: 2px dashed #0f3460; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
    .upload-zone:hover { border-color: #e94560; background: rgba(233, 69, 96, 0.1); }
    .upload-zone input { display: none; }
    .status-bar { background: #0f3460; padding: 8px 20px; font-size: 12px; color: #888; display: flex; justify-content: space-between; }
    .status-indicator { display: flex; align-items: center; gap: 6px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf50; }
    .status-dot.warning { background: #ff9800; }
    .status-dot.error { background: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Spatial Awareness</h1>
        <p>Topology Editor</p>
      </div>
      <div class="sidebar-content">
        <div class="section" style="background: #1a3a5c; margin: -10px -15px 10px -15px; padding: 15px;">
          <div class="section-title" style="margin-bottom: 10px;">
            <span>Floor Plan Scale</span>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="number" id="scale-input" value="5" min="1" max="50" style="width: 60px; padding: 6px; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; color: #fff;" onchange="updateScale(this.value)">
            <span style="font-size: 12px; color: #888;">pixels per foot</span>
            <button class="btn btn-small" onclick="openScaleHelper()" style="margin-left: auto;">Help</button>
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 8px;">
            Tip: If your floor plan is 800px wide and represents 80ft, scale = 10 px/ft
          </div>
        </div>
        <div class="section">
          <div class="section-title">
            <span>Cameras</span>
            <button class="btn btn-small" onclick="openAddCameraModal()">+ Add</button>
          </div>
          <div id="camera-list">
            <div class="camera-item" style="color: #666; text-align: center; cursor: default;">No cameras configured</div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">
            <span>Connections</span>
            <button class="btn btn-small" onclick="openAddConnectionModal()">+ Add</button>
          </div>
          <div id="connection-list">
            <div class="connection-item" style="color: #666; text-align: center; cursor: default;">No connections configured</div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">
            <span>Landmarks</span>
            <button class="btn btn-small" onclick="openAddLandmarkModal()">+ Add</button>
          </div>
          <div id="landmark-list">
            <div class="landmark-item" style="color: #666; text-align: center; cursor: default; padding: 8px;">No landmarks configured</div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">
            <span>Zones</span>
            <button class="btn btn-small" onclick="setTool('zone')" style="background: #2e7d32;">+ Draw</button>
          </div>
          <div id="zone-list">
            <div class="zone-item" style="color: #666; text-align: center; cursor: default; padding: 8px;">No zones drawn</div>
          </div>
        </div>
        <div class="section" id="suggestions-section" style="display: none;">
          <div class="section-title">
            <span>AI Suggestions</span>
            <button class="btn btn-small" onclick="loadSuggestions()">Refresh</button>
          </div>
          <div id="suggestions-list"></div>
        </div>
        <div class="section" id="connection-suggestions-section" style="display: none;">
          <div class="section-title">
            <span>Connection Suggestions</span>
            <button class="btn btn-small" onclick="loadConnectionSuggestions()">Refresh</button>
          </div>
          <div id="connection-suggestions-list"></div>
        </div>
        <div class="section" id="discovery-section">
          <div class="section-title">
            <span>Auto-Discovery</span>
            <button class="btn btn-small btn-primary" id="scan-now-btn" onclick="runDiscoveryScan()">Scan Now</button>
          </div>
          <div id="discovery-status" style="font-size: 11px; color: #888; margin-bottom: 8px;">
            <span id="discovery-status-text">Position cameras first, then scan</span>
          </div>
          <div id="discovery-suggestions-list"></div>
        </div>
        <div class="section" id="live-tracking-section">
          <div class="section-title">
            <span>Live Tracking</span>
            <label class="checkbox-group" style="font-size: 11px; font-weight: normal; text-transform: none;">
              <input type="checkbox" id="live-tracking-toggle" onchange="toggleLiveTracking(this.checked)">
              Enable
            </label>
          </div>
          <div id="live-tracking-list" style="max-height: 150px; overflow-y: auto;"></div>
        </div>
      </div>
    </div>
    <div class="editor">
      <div class="toolbar">
        <div class="toolbar-group">
          <button class="btn" onclick="uploadFloorPlan()">Upload Image</button>
          <button class="btn" onclick="useBlankCanvas()">Blank Canvas</button>
        </div>
        <div class="toolbar-group">
          <button class="btn" id="tool-select" onclick="setTool('select')">Select</button>
          <button class="btn" id="tool-wall" onclick="setTool('wall')">Draw Wall</button>
          <button class="btn" id="tool-room" onclick="setTool('room')">Draw Room</button>
          <button class="btn" id="tool-zone" onclick="setTool('zone')" style="background: #2e7d32;">Draw Zone</button>
          <button class="btn" id="tool-camera" onclick="setTool('camera')">Place Camera</button>
          <button class="btn" id="tool-landmark" onclick="setTool('landmark')">Place Landmark</button>
          <button class="btn" id="tool-connect" onclick="setTool('connect')">Connect</button>
        </div>
        <div class="toolbar-group">
          <button class="btn" onclick="clearDrawings()">Clear Drawings</button>
          <button class="btn" onclick="clearAllTopology()" style="background: #dc2626;">Delete All</button>
        </div>
        <div class="toolbar-group">
          <button class="btn btn-primary" onclick="saveTopology()">Save</button>
        </div>
      </div>
      <div class="canvas-container">
        <canvas id="floor-plan-canvas"></canvas>
        <div class="canvas-placeholder" id="canvas-placeholder">
          <h2>Floor Plan Editor</h2>
          <p>Upload an image or use a blank canvas to draw your floor plan</p>
          <br>
          <div style="display: flex; gap: 15px; justify-content: center;">
            <button class="btn btn-primary" onclick="uploadFloorPlan()">Upload Image</button>
            <button class="btn" onclick="useBlankCanvas()">Use Blank Canvas</button>
          </div>
        </div>
      </div>
      <div class="status-bar">
        <div class="status-indicator">
          <div class="status-dot" id="status-dot"></div>
          <span id="status-text">Ready</span>
        </div>
        <div>
          <span id="camera-count">0</span> cameras | <span id="connection-count">0</span> connections | <span id="landmark-count">0</span> landmarks
        </div>
      </div>
    </div>
    <div class="properties-panel" id="properties-panel">
      <h3>Properties</h3>
      <p style="color: #666; font-size: 13px;">Select a camera or connection to edit its properties.</p>
    </div>
  </div>

  <div class="modal-overlay" id="add-camera-modal">
    <div class="modal">
      <h2>Add Camera</h2>
      <div class="form-group">
        <label>Camera Device</label>
        <select id="camera-device-select"><option value="">Loading cameras...</option></select>
      </div>
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="camera-name-input" placeholder="e.g., Front Door Camera">
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="camera-entry-checkbox">
          Entry Point (objects can enter property here)
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="camera-exit-checkbox">
          Exit Point (objects can exit property here)
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal('add-camera-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="addCamera()">Add Camera</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="add-connection-modal">
    <div class="modal">
      <h2>Add Connection</h2>
      <div class="form-group">
        <label>Connection Name</label>
        <input type="text" id="connection-name-input" placeholder="e.g., Driveway to Front Door">
      </div>
      <div class="form-group">
        <label>From Camera</label>
        <select id="connection-from-select"></select>
      </div>
      <div class="form-group">
        <label>To Camera</label>
        <select id="connection-to-select"></select>
      </div>
      <div class="form-group">
        <label>Transit Time (seconds)</label>
        <div class="transit-time-inputs">
          <input type="number" id="transit-min" placeholder="Min" value="3">
          <input type="number" id="transit-typical" placeholder="Typical" value="10">
          <input type="number" id="transit-max" placeholder="Max" value="30">
        </div>
        <div class="transit-time-labels">
          <span>Minimum</span>
          <span>Typical</span>
          <span>Maximum</span>
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="connection-bidirectional" checked>
          Bidirectional (works both ways)
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal('add-connection-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="addConnection()">Add Connection</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="upload-modal">
    <div class="modal">
      <h2>Upload Floor Plan</h2>
      <div class="upload-zone" onclick="document.getElementById('floor-plan-input').click()">
        <p>Click to select an image<br><small>PNG, JPG, or SVG</small></p>
        <input type="file" id="floor-plan-input" accept="image/*" onchange="handleFloorPlanUpload(event)">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal('upload-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="add-landmark-modal">
    <div class="modal">
      <h2>Add Landmark</h2>
      <div class="form-group">
        <label>Landmark Type</label>
        <select id="landmark-type-select" onchange="updateLandmarkSuggestions()">
          <option value="structure">Structure (House, Garage, Shed)</option>
          <option value="feature">Feature (Mailbox, Tree, Pool)</option>
          <option value="boundary">Boundary (Fence, Wall, Hedge)</option>
          <option value="access">Access (Driveway, Walkway, Gate)</option>
          <option value="vehicle">Vehicle (Parking, Boat, RV)</option>
          <option value="neighbor">Neighbor (House, Driveway)</option>
          <option value="zone">Zone (Front Yard, Back Yard)</option>
          <option value="street">Street (Street, Sidewalk, Alley)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Quick Templates</label>
        <div id="landmark-templates" style="display: flex; flex-wrap: wrap; gap: 5px;"></div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="landmark-name-input" placeholder="e.g., Front Porch, Red Shed">
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <input type="text" id="landmark-desc-input" placeholder="Brief description for AI context">
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="landmark-entry-checkbox">
          Entry Point (people can enter property here)
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-group">
          <input type="checkbox" id="landmark-exit-checkbox">
          Exit Point (people can exit property here)
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal('add-landmark-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="addLandmark()">Add Landmark</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="add-zone-modal">
    <div class="modal">
      <h2>Create Zone</h2>
      <p style="color: #888; margin-bottom: 15px; font-size: 13px;">Click points on the canvas to draw a polygon. Double-click or press Enter to finish.</p>
      <div class="form-group">
        <label>Zone Name</label>
        <input type="text" id="zone-name-input" placeholder="e.g., Front Yard">
      </div>
      <div class="form-group">
        <label>Zone Type</label>
        <select id="zone-type-select">
          <option value="yard">Yard</option>
          <option value="driveway">Driveway</option>
          <option value="street">Street</option>
          <option value="patio">Patio/Deck</option>
          <option value="walkway">Walkway</option>
          <option value="parking">Parking</option>
          <option value="garden">Garden</option>
          <option value="pool">Pool Area</option>
          <option value="garage">Garage</option>
          <option value="entrance">Entrance</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <input type="text" id="zone-desc-input" placeholder="e.g., Main front lawn area">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="cancelZoneDrawing()">Cancel</button>
        <button class="btn btn-primary" onclick="startZoneDrawing()">Start Drawing</button>
      </div>
    </div>
  </div>

  <script>
    let topology = { version: '2.0', cameras: [], connections: [], globalZones: [], landmarks: [], relationships: [], floorPlan: null, drawings: [] };
    let selectedItem = null;
    let currentTool = 'select';
    let floorPlanImage = null;
    let availableCameras = [];
    let landmarkTemplates = [];
    let pendingSuggestions = [];
    let connectionSuggestions = [];
    let liveTrackingData = { objects: [], timestamp: 0 };
    let liveTrackingEnabled = false;
    let liveTrackingInterval = null;
    let selectedJourneyId = null;
    let journeyPath = null;
    let isDrawing = false;
    let drawStart = null;
    let currentDrawing = null;
    let blankCanvasMode = false;

    // Floor plan scale: pixels per foot (default assumes ~5 pixels per foot for a typical floor plan)
    // User can adjust this by setting the scale
    let floorPlanScale = 5; // pixels per foot

    // Helper functions for scale conversion
    function feetToPixels(feet) { return feet * floorPlanScale; }
    function pixelsToFeet(pixels) { return pixels / floorPlanScale; }

    // Zone drawing state
    let zoneDrawingMode = false;
    let currentZonePoints = [];
    let pendingZoneConfig = null;

    // Zone colors by type
    const ZONE_COLORS = {
      yard: 'rgba(76, 175, 80, 0.3)',
      driveway: 'rgba(158, 158, 158, 0.3)',
      street: 'rgba(96, 96, 96, 0.3)',
      patio: 'rgba(255, 152, 0, 0.3)',
      walkway: 'rgba(121, 85, 72, 0.3)',
      parking: 'rgba(189, 189, 189, 0.3)',
      garden: 'rgba(139, 195, 74, 0.3)',
      pool: 'rgba(33, 150, 243, 0.3)',
      garage: 'rgba(117, 117, 117, 0.3)',
      entrance: 'rgba(233, 30, 99, 0.3)',
      custom: 'rgba(156, 39, 176, 0.3)',
    };
    const ZONE_STROKE_COLORS = {
      yard: '#4caf50',
      driveway: '#9e9e9e',
      street: '#606060',
      patio: '#ff9800',
      walkway: '#795548',
      parking: '#bdbdbd',
      garden: '#8bc34a',
      pool: '#2196f3',
      garage: '#757575',
      entrance: '#e91e63',
      custom: '#9c27b0',
    };

    const canvas = document.getElementById('floor-plan-canvas');
    const ctx = canvas.getContext('2d');

    async function init() {
      await loadTopology();
      await loadAvailableCameras();
      await loadLandmarkTemplates();
      await loadSuggestions();
      await loadConnectionSuggestions();
      await loadDiscoveryStatus();
      await loadDiscoverySuggestions();
      resizeCanvas();
      render();
      updateUI();
    }

    async function loadTopology() {
      try {
        const response = await fetch('../api/topology');
        if (response.ok) {
          topology = await response.json();
          if (!topology.drawings) topology.drawings = [];
          // Load floor plan scale if saved
          if (topology.floorPlanScale) {
            floorPlanScale = topology.floorPlanScale;
            const scaleInput = document.getElementById('scale-input');
            if (scaleInput) scaleInput.value = floorPlanScale;
          }
          // Load floor plan from separate storage (handles legacy imageData in topology too)
          if (topology.floorPlan?.imageData) {
            // Legacy: imageData was stored in topology
            await loadFloorPlanImage(topology.floorPlan.imageData);
          } else if (topology.floorPlan?.type === 'blank') {
            blankCanvasMode = true;
          } else {
            // Always try to load from floor-plan endpoint (handles uploaded and missing cases)
            try {
              const fpResponse = await fetch('../api/floor-plan');
              if (fpResponse.ok) {
                const fpData = await fpResponse.json();
                if (fpData.imageData) {
                  await loadFloorPlanImage(fpData.imageData);
                  // Update topology reference if not set
                  if (!topology.floorPlan || topology.floorPlan.type !== 'uploaded') {
                    topology.floorPlan = { type: 'uploaded', width: floorPlanImage.width, height: floorPlanImage.height };
                  }
                }
              }
            } catch (err) { console.error('Failed to load floor plan:', err); }
          }
        }
      } catch (e) { console.error('Failed to load topology:', e); }
    }

    async function loadAvailableCameras() {
      try {
        const response = await fetch('../api/cameras');
        if (response.ok) {
          availableCameras = await response.json();
        } else {
          availableCameras = [];
        }
      } catch (e) {
        console.error('Failed to load cameras:', e);
        availableCameras = [];
      }
      updateCameraSelects();
    }

    async function loadLandmarkTemplates() {
      try {
        const response = await fetch('../api/landmark-templates');
        if (response.ok) {
          const data = await response.json();
          landmarkTemplates = data.templates || [];
        }
      } catch (e) { console.error('Failed to load landmark templates:', e); }
    }

    async function loadSuggestions() {
      try {
        const response = await fetch('../api/landmark-suggestions');
        if (response.ok) {
          const data = await response.json();
          pendingSuggestions = data.suggestions || [];
          updateSuggestionsUI();
        }
      } catch (e) { console.error('Failed to load suggestions:', e); }
    }

    function updateSuggestionsUI() {
      const section = document.getElementById('suggestions-section');
      const list = document.getElementById('suggestions-list');
      if (pendingSuggestions.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      list.innerHTML = pendingSuggestions.map(s =>
        '<div class="camera-item" style="display: flex; justify-content: space-between; align-items: center;">' +
        '<div><div class="camera-name">' + s.landmark.name + '</div>' +
        '<div class="camera-info">' + s.landmark.type + ' - ' + Math.round((s.landmark.aiConfidence || 0) * 100) + '% confidence</div></div>' +
        '<div style="display: flex; gap: 5px;">' +
        '<button class="btn btn-small btn-primary" onclick="acceptSuggestion(\\'' + s.id + '\\')">Accept</button>' +
        '<button class="btn btn-small" onclick="rejectSuggestion(\\'' + s.id + '\\')">Reject</button>' +
        '</div></div>'
      ).join('');
    }

    async function acceptSuggestion(id) {
      try {
        const response = await fetch('../api/landmark-suggestions/' + id + '/accept', { method: 'POST' });
        if (response.ok) {
          const data = await response.json();
          if (data.landmark) {
            topology.landmarks.push(data.landmark);
            updateUI();
            render();
          }
          await loadSuggestions();
          setStatus('Landmark accepted', 'success');
        }
      } catch (e) { console.error('Failed to accept suggestion:', e); }
    }

    async function rejectSuggestion(id) {
      try {
        await fetch('../api/landmark-suggestions/' + id + '/reject', { method: 'POST' });
        await loadSuggestions();
        setStatus('Suggestion rejected', 'success');
      } catch (e) { console.error('Failed to reject suggestion:', e); }
    }

    // ==================== Connection Suggestions ====================
    async function loadConnectionSuggestions() {
      try {
        const response = await fetch('../api/connection-suggestions');
        if (response.ok) {
          const data = await response.json();
          connectionSuggestions = data.suggestions || [];
          updateConnectionSuggestionsUI();
        }
      } catch (e) { console.error('Failed to load connection suggestions:', e); }
    }

    function updateConnectionSuggestionsUI() {
      const section = document.getElementById('connection-suggestions-section');
      const list = document.getElementById('connection-suggestions-list');
      if (connectionSuggestions.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      list.innerHTML = connectionSuggestions.map(s =>
        '<div class="camera-item" style="display: flex; justify-content: space-between; align-items: center;">' +
        '<div><div class="camera-name">' + s.fromCameraName + ' → ' + s.toCameraName + '</div>' +
        '<div class="camera-info">' + Math.round(s.suggestedTransitTime.typical / 1000) + 's typical, ' +
        Math.round(s.confidence * 100) + '% confidence</div></div>' +
        '<div style="display: flex; gap: 5px;">' +
        '<button class="btn btn-small btn-primary" onclick="acceptConnectionSuggestion(\\'' + s.id + '\\')">Accept</button>' +
        '<button class="btn btn-small" onclick="rejectConnectionSuggestion(\\'' + s.id + '\\')">Reject</button>' +
        '</div></div>'
      ).join('');
    }

    async function acceptConnectionSuggestion(id) {
      try {
        const response = await fetch('../api/connection-suggestions/' + encodeURIComponent(id) + '/accept', { method: 'POST' });
        if (response.ok) {
          const data = await response.json();
          if (data.connection) {
            topology.connections.push(data.connection);
            updateUI();
            render();
          }
          await loadConnectionSuggestions();
          setStatus('Connection accepted', 'success');
        }
      } catch (e) { console.error('Failed to accept connection suggestion:', e); }
    }

    async function rejectConnectionSuggestion(id) {
      try {
        await fetch('../api/connection-suggestions/' + encodeURIComponent(id) + '/reject', { method: 'POST' });
        await loadConnectionSuggestions();
        setStatus('Connection suggestion rejected', 'success');
      } catch (e) { console.error('Failed to reject connection suggestion:', e); }
    }

    // ==================== Auto-Discovery ====================
    let discoverySuggestions = [];
    let discoveryStatus = { isScanning: false, lastScanTime: null, pendingSuggestions: 0 };

    async function loadDiscoveryStatus() {
      try {
        const response = await fetch('../api/discovery/status');
        if (response.ok) {
          discoveryStatus = await response.json();
          updateDiscoveryStatusUI();
        }
      } catch (e) { console.error('Failed to load discovery status:', e); }
    }

    async function loadDiscoverySuggestions() {
      try {
        const response = await fetch('../api/discovery/suggestions');
        if (response.ok) {
          const data = await response.json();
          discoverySuggestions = data.suggestions || [];
          updateDiscoverySuggestionsUI();
        }
      } catch (e) { console.error('Failed to load discovery suggestions:', e); }
    }

    function updateDiscoveryStatusUI() {
      const statusText = document.getElementById('discovery-status-text');
      const scanBtn = document.getElementById('scan-now-btn');

      if (discoveryStatus.isScanning) {
        statusText.textContent = 'Scanning cameras...';
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning...';
      } else if (discoveryStatus.lastScanTime) {
        const ago = Math.round((Date.now() - discoveryStatus.lastScanTime) / 1000 / 60);
        const agoStr = ago < 1 ? 'just now' : ago + 'm ago';
        statusText.textContent = 'Last scan: ' + agoStr + ' | ' + discoveryStatus.pendingSuggestions + ' suggestions';
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan Now';
      } else {
        statusText.textContent = 'Not scanned yet';
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan Now';
      }
    }

    function updateDiscoverySuggestionsUI() {
      const list = document.getElementById('discovery-suggestions-list');
      if (discoverySuggestions.length === 0) {
        list.innerHTML = '<div style="color: #666; font-size: 11px; text-align: center; padding: 8px;">No pending suggestions</div>';
        return;
      }
      list.innerHTML = discoverySuggestions.map(s => {
        const name = s.type === 'landmark' ? s.landmark?.name : (s.type === 'connection' ? s.connection?.via : s.zone?.name);
        const typeLabel = s.type === 'landmark' ? s.landmark?.type : s.type;
        return '<div class="camera-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px;">' +
          '<div><div class="camera-name" style="font-size: 12px;">' + (name || 'Unknown') + '</div>' +
          '<div class="camera-info">' + typeLabel + ' - ' + Math.round(s.confidence * 100) + '% confidence</div></div>' +
          '<div style="display: flex; gap: 4px;">' +
          '<button class="btn btn-small btn-primary" onclick="acceptDiscoverySuggestion(\\'' + s.id + '\\')">✓</button>' +
          '<button class="btn btn-small" onclick="rejectDiscoverySuggestion(\\'' + s.id + '\\')">✗</button>' +
          '</div></div>';
      }).join('');
    }

    let scanPollingInterval = null;

    async function runDiscoveryScan() {
      // Check if cameras are positioned on the floor plan
      const positionedCameras = topology.cameras.filter(c => c.floorPlanPosition);
      if (positionedCameras.length === 0) {
        alert('Please position at least one camera on the floor plan before running discovery.\\n\\nSteps:\\n1. Click "Place Camera" in the toolbar\\n2. Click on the floor plan where the camera is located\\n3. Select the camera from the dropdown\\n4. Drag the rotation handle to set its direction\\n5. Then run discovery to detect zones and connections');
        return;
      }

      const scanBtn = document.getElementById('scan-now-btn');
      const statusText = document.getElementById('discovery-status-text');
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning...';
      setStatus('Starting discovery scan...', 'warning');

      // Start polling for live status updates
      let camerasDone = 0;
      scanPollingInterval = setInterval(async () => {
        try {
          const statusResp = await fetch('../api/discovery/status');
          if (statusResp.ok) {
            const status = await statusResp.json();
            if (status.isScanning) {
              statusText.textContent = 'Scanning: ' + status.camerasAnalyzed + ' cameras analyzed...';
              // Check for new suggestions during scan
              if (status.pendingSuggestions > camerasDone) {
                camerasDone = status.pendingSuggestions;
                await loadDiscoverySuggestions();
              }
            }
          }
        } catch (e) { /* ignore polling errors */ }
      }, 1000);

      try {
        const response = await fetch('../api/discovery/scan', { method: 'POST' });
        if (response.ok) {
          const result = await response.json();
          discoveryStatus = result.status || discoveryStatus;
          discoverySuggestions = result.suggestions || [];
          updateDiscoveryStatusUI();
          updateDiscoverySuggestionsUI();
          setStatus('Discovery scan complete: ' + discoverySuggestions.length + ' suggestions found', 'success');

          // Also reload topology to get any auto-accepted items
          await loadTopology();
          updateUI();
          render();
        } else {
          const error = await response.json();
          setStatus('Scan failed: ' + (error.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        console.error('Discovery scan failed:', e);
        setStatus('Discovery scan failed', 'error');
      } finally {
        // Stop polling
        if (scanPollingInterval) {
          clearInterval(scanPollingInterval);
          scanPollingInterval = null;
        }
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan Now';
      }
    }

    async function acceptDiscoverySuggestion(id) {
      try {
        const response = await fetch('../api/discovery/suggestions/' + id + '/accept', { method: 'POST' });
        if (response.ok) {
          // Reload topology and suggestions
          await loadTopology();
          await loadDiscoverySuggestions();
          updateUI();
          render();
          setStatus('Suggestion accepted', 'success');
        }
      } catch (e) { console.error('Failed to accept discovery suggestion:', e); }
    }

    async function rejectDiscoverySuggestion(id) {
      try {
        await fetch('../api/discovery/suggestions/' + id + '/reject', { method: 'POST' });
        await loadDiscoverySuggestions();
        setStatus('Suggestion rejected', 'success');
      } catch (e) { console.error('Failed to reject discovery suggestion:', e); }
    }

    // ==================== Live Tracking ====================
    function toggleLiveTracking(enabled) {
      liveTrackingEnabled = enabled;
      if (enabled) {
        loadLiveTracking();
        liveTrackingInterval = setInterval(loadLiveTracking, 2000); // Poll every 2 seconds
      } else {
        if (liveTrackingInterval) {
          clearInterval(liveTrackingInterval);
          liveTrackingInterval = null;
        }
        liveTrackingData = { objects: [], timestamp: 0 };
        selectedJourneyId = null;
        journeyPath = null;
        updateLiveTrackingUI();
        render();
      }
    }

    async function loadLiveTracking() {
      try {
        const response = await fetch('../api/live-tracking');
        if (response.ok) {
          liveTrackingData = await response.json();
          updateLiveTrackingUI();
          render();
        }
      } catch (e) { console.error('Failed to load live tracking:', e); }
    }

    function updateLiveTrackingUI() {
      const list = document.getElementById('live-tracking-list');
      if (liveTrackingData.objects.length === 0) {
        list.innerHTML = '<div style="color: #666; font-size: 12px; text-align: center; padding: 10px;">No active objects</div>';
        return;
      }
      list.innerHTML = liveTrackingData.objects.map(obj => {
        const isSelected = selectedJourneyId === obj.globalId;
        const ageSeconds = Math.round((Date.now() - obj.lastSeen) / 1000);
        const ageStr = ageSeconds < 60 ? ageSeconds + 's ago' : Math.round(ageSeconds / 60) + 'm ago';
        return '<div class="camera-item' + (isSelected ? ' selected' : '') + '" ' +
          'onclick="selectTrackedObject(\\'' + obj.globalId + '\\')" ' +
          'style="padding: 8px; cursor: pointer;">' +
          '<div class="camera-name" style="font-size: 12px;">' +
          (obj.className.charAt(0).toUpperCase() + obj.className.slice(1)) +
          (obj.label ? ' (' + obj.label + ')' : '') + '</div>' +
          '<div class="camera-info">' + obj.lastCameraName + ' • ' + ageStr + '</div>' +
          '</div>';
      }).join('');
    }

    async function selectTrackedObject(globalId) {
      if (selectedJourneyId === globalId) {
        // Deselect
        selectedJourneyId = null;
        journeyPath = null;
      } else {
        selectedJourneyId = globalId;
        // Load journey path
        try {
          const response = await fetch('../api/journey-path/' + globalId);
          if (response.ok) {
            journeyPath = await response.json();
          }
        } catch (e) { console.error('Failed to load journey path:', e); }
      }
      updateLiveTrackingUI();
      render();
    }

    function openAddLandmarkModal() {
      updateLandmarkSuggestions();
      document.getElementById('add-landmark-modal').classList.add('active');
    }

    function updateLandmarkSuggestions() {
      const type = document.getElementById('landmark-type-select').value;
      const template = landmarkTemplates.find(t => t.type === type);
      const container = document.getElementById('landmark-templates');
      if (template) {
        container.innerHTML = template.suggestions.map(s =>
          '<button class="btn btn-small" onclick="setLandmarkName(\\'' + s + '\\')" style="margin: 2px;">' + s + '</button>'
        ).join('');
      } else {
        container.innerHTML = '<span style="color: #666; font-size: 12px;">No templates for this type</span>';
      }
    }

    function setLandmarkName(name) {
      document.getElementById('landmark-name-input').value = name;
    }

    function addLandmark() {
      const name = document.getElementById('landmark-name-input').value;
      if (!name) { alert('Please enter a landmark name'); return; }
      const type = document.getElementById('landmark-type-select').value;
      const description = document.getElementById('landmark-desc-input').value;
      const isEntry = document.getElementById('landmark-entry-checkbox').checked;
      const isExit = document.getElementById('landmark-exit-checkbox').checked;
      const pos = topology._pendingLandmarkPos || { x: canvas.width / 2 + Math.random() * 100 - 50, y: canvas.height / 2 + Math.random() * 100 - 50 };
      delete topology._pendingLandmarkPos;
      const landmark = {
        id: 'landmark_' + Date.now(),
        name,
        type,
        position: pos,
        description: description || undefined,
        isEntryPoint: isEntry,
        isExitPoint: isExit,
        visibleFromCameras: [],
      };
      if (!topology.landmarks) topology.landmarks = [];
      topology.landmarks.push(landmark);
      closeModal('add-landmark-modal');
      document.getElementById('landmark-name-input').value = '';
      document.getElementById('landmark-desc-input').value = '';
      document.getElementById('landmark-entry-checkbox').checked = false;
      document.getElementById('landmark-exit-checkbox').checked = false;
      updateUI();
      render();
    }

    function selectLandmark(id) {
      selectedItem = { type: 'landmark', id };
      const landmark = topology.landmarks.find(l => l.id === id);
      showLandmarkProperties(landmark);
      updateUI();
      render();
    }

    function showLandmarkProperties(landmark) {
      const panel = document.getElementById('properties-panel');
      const cameraOptions = topology.cameras.map(c =>
        '<label class="checkbox-group" style="margin-bottom: 5px;"><input type="checkbox" ' +
        ((landmark.visibleFromCameras || []).includes(c.deviceId) ? 'checked' : '') +
        ' onchange="toggleLandmarkCamera(\\'' + landmark.id + '\\', \\'' + c.deviceId + '\\', this.checked)">' +
        c.name + '</label>'
      ).join('');
      panel.innerHTML = '<h3>Landmark Properties</h3>' +
        '<div class="form-group"><label>Name</label><input type="text" value="' + landmark.name + '" onchange="updateLandmarkName(\\'' + landmark.id + '\\', this.value)"></div>' +
        '<div class="form-group"><label>Type</label><select onchange="updateLandmarkType(\\'' + landmark.id + '\\', this.value)">' +
        '<option value="structure"' + (landmark.type === 'structure' ? ' selected' : '') + '>Structure</option>' +
        '<option value="feature"' + (landmark.type === 'feature' ? ' selected' : '') + '>Feature</option>' +
        '<option value="boundary"' + (landmark.type === 'boundary' ? ' selected' : '') + '>Boundary</option>' +
        '<option value="access"' + (landmark.type === 'access' ? ' selected' : '') + '>Access</option>' +
        '<option value="vehicle"' + (landmark.type === 'vehicle' ? ' selected' : '') + '>Vehicle</option>' +
        '<option value="neighbor"' + (landmark.type === 'neighbor' ? ' selected' : '') + '>Neighbor</option>' +
        '<option value="zone"' + (landmark.type === 'zone' ? ' selected' : '') + '>Zone</option>' +
        '<option value="street"' + (landmark.type === 'street' ? ' selected' : '') + '>Street</option>' +
        '</select></div>' +
        '<div class="form-group"><label>Description</label><input type="text" value="' + (landmark.description || '') + '" onchange="updateLandmarkDesc(\\'' + landmark.id + '\\', this.value)"></div>' +
        '<div class="form-group"><label class="checkbox-group"><input type="checkbox" ' + (landmark.isEntryPoint ? 'checked' : '') + ' onchange="updateLandmarkEntry(\\'' + landmark.id + '\\', this.checked)">Entry Point</label></div>' +
        '<div class="form-group"><label class="checkbox-group"><input type="checkbox" ' + (landmark.isExitPoint ? 'checked' : '') + ' onchange="updateLandmarkExit(\\'' + landmark.id + '\\', this.checked)">Exit Point</label></div>' +
        '<div class="form-group"><label>Visible from Cameras</label>' + (cameraOptions || '<span style="color:#666;font-size:12px;">Add cameras first</span>') + '</div>' +
        '<div class="form-group"><button class="btn" style="width: 100%; background: #f44336;" onclick="deleteLandmark(\\'' + landmark.id + '\\')">Delete Landmark</button></div>';
    }

    function updateLandmarkName(id, value) { const l = topology.landmarks.find(x => x.id === id); if (l) l.name = value; updateUI(); }
    function updateLandmarkType(id, value) { const l = topology.landmarks.find(x => x.id === id); if (l) l.type = value; render(); }
    function updateLandmarkDesc(id, value) { const l = topology.landmarks.find(x => x.id === id); if (l) l.description = value || undefined; }
    function updateLandmarkEntry(id, value) { const l = topology.landmarks.find(x => x.id === id); if (l) l.isEntryPoint = value; }
    function updateLandmarkExit(id, value) { const l = topology.landmarks.find(x => x.id === id); if (l) l.isExitPoint = value; }
    function toggleLandmarkCamera(landmarkId, cameraId, visible) {
      const l = topology.landmarks.find(x => x.id === landmarkId);
      if (!l) return;
      if (!l.visibleFromCameras) l.visibleFromCameras = [];
      if (visible && !l.visibleFromCameras.includes(cameraId)) {
        l.visibleFromCameras.push(cameraId);
      } else if (!visible) {
        l.visibleFromCameras = l.visibleFromCameras.filter(id => id !== cameraId);
      }
      // Also update camera's visibleLandmarks
      const camera = topology.cameras.find(c => c.deviceId === cameraId);
      if (camera) {
        if (!camera.context) camera.context = {};
        if (!camera.context.visibleLandmarks) camera.context.visibleLandmarks = [];
        if (visible && !camera.context.visibleLandmarks.includes(landmarkId)) {
          camera.context.visibleLandmarks.push(landmarkId);
        } else if (!visible) {
          camera.context.visibleLandmarks = camera.context.visibleLandmarks.filter(id => id !== landmarkId);
        }
      }
    }
    function deleteLandmark(id) {
      if (!confirm('Delete this landmark?')) return;
      topology.landmarks = topology.landmarks.filter(l => l.id !== id);
      selectedItem = null;
      document.getElementById('properties-panel').innerHTML = '<h3>Properties</h3><p style="color: #666;">Select an item to edit.</p>';
      updateUI();
      render();
    }

    async function saveTopology() {
      try {
        setStatus('Saving...', 'warning');
        const response = await fetch('../api/topology', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(topology)
        });
        if (response.ok) { setStatus('Saved successfully', 'success'); }
        else { setStatus('Failed to save', 'error'); }
      } catch (e) { console.error('Failed to save topology:', e); setStatus('Failed to save', 'error'); }
    }

    function resizeCanvas() {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw grid for blank canvas
      if (blankCanvasMode && !floorPlanImage) {
        document.getElementById('canvas-placeholder').style.display = 'none';
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#2a2a4e';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < canvas.width; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
      } else if (floorPlanImage) {
        document.getElementById('canvas-placeholder').style.display = 'none';
        const scale = Math.min(canvas.width / floorPlanImage.width, canvas.height / floorPlanImage.height) * 0.9;
        const x = (canvas.width - floorPlanImage.width * scale) / 2;
        const y = (canvas.height - floorPlanImage.height * scale) / 2;
        ctx.drawImage(floorPlanImage, x, y, floorPlanImage.width * scale, floorPlanImage.height * scale);
      } else {
        document.getElementById('canvas-placeholder').style.display = 'block';
      }

      // Draw saved drawings (walls and rooms)
      if (topology.drawings) {
        for (const drawing of topology.drawings) {
          if (drawing.type === 'wall') {
            ctx.beginPath();
            ctx.moveTo(drawing.x1, drawing.y1);
            ctx.lineTo(drawing.x2, drawing.y2);
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 4;
            ctx.stroke();
          } else if (drawing.type === 'room') {
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawing.x, drawing.y, drawing.width, drawing.height);
            ctx.fillStyle = 'rgba(100, 100, 150, 0.1)';
            ctx.fillRect(drawing.x, drawing.y, drawing.width, drawing.height);
            if (drawing.label) {
              ctx.fillStyle = '#888';
              ctx.font = '12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(drawing.label, drawing.x + drawing.width/2, drawing.y + drawing.height/2);
            }
          }
        }
      }

      // Draw current drawing in progress
      if (currentDrawing) {
        if (currentDrawing.type === 'wall') {
          ctx.beginPath();
          ctx.moveTo(currentDrawing.x1, currentDrawing.y1);
          ctx.lineTo(currentDrawing.x2, currentDrawing.y2);
          ctx.strokeStyle = '#e94560';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else if (currentDrawing.type === 'room') {
          ctx.strokeStyle = '#e94560';
          ctx.lineWidth = 2;
          ctx.strokeRect(currentDrawing.x, currentDrawing.y, currentDrawing.width, currentDrawing.height);
        }
      }

      // Draw saved zones
      if (topology.drawnZones) {
        for (const zone of topology.drawnZones) {
          drawZone(zone);
        }
      }

      // Draw zone currently being drawn
      if (zoneDrawingMode && currentZonePoints.length > 0) {
        const color = pendingZoneConfig ? (ZONE_COLORS[pendingZoneConfig.type] || ZONE_COLORS.custom) : 'rgba(233, 69, 96, 0.3)';
        const strokeColor = pendingZoneConfig ? (ZONE_STROKE_COLORS[pendingZoneConfig.type] || ZONE_STROKE_COLORS.custom) : '#e94560';

        ctx.beginPath();
        ctx.moveTo(currentZonePoints[0].x, currentZonePoints[0].y);
        for (let i = 1; i < currentZonePoints.length; i++) {
          ctx.lineTo(currentZonePoints[i].x, currentZonePoints[i].y);
        }
        // Close the polygon if we have 3+ points
        if (currentZonePoints.length >= 3) {
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw points
        for (const pt of currentZonePoints) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = strokeColor;
          ctx.fill();
        }

        // Draw instruction text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Click to add points. Double-click or press Enter to finish. Esc to cancel.', 10, canvas.height - 10);
      }

      // Draw landmarks first (below cameras and connections)
      for (const landmark of (topology.landmarks || [])) {
        if (landmark.position) { drawLandmark(landmark); }
      }
      for (const conn of topology.connections) {
        const fromCam = topology.cameras.find(c => c.deviceId === conn.fromCameraId);
        const toCam = topology.cameras.find(c => c.deviceId === conn.toCameraId);
        if (fromCam?.floorPlanPosition && toCam?.floorPlanPosition) {
          drawConnection(fromCam.floorPlanPosition, toCam.floorPlanPosition, conn);
        }
      }
      for (const camera of topology.cameras) {
        if (camera.floorPlanPosition) { drawCamera(camera); }
      }

      // Draw journey path if selected
      if (journeyPath && journeyPath.segments.length > 0) {
        drawJourneyPath();
      }

      // Draw live tracking objects
      if (liveTrackingEnabled && liveTrackingData.objects.length > 0) {
        drawLiveTrackingObjects();
      }
    }

    function drawJourneyPath() {
      if (!journeyPath) return;

      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);

      // Draw path segments
      for (const segment of journeyPath.segments) {
        if (segment.fromCamera.position && segment.toCamera.position) {
          ctx.beginPath();
          ctx.moveTo(segment.fromCamera.position.x, segment.fromCamera.position.y);
          ctx.lineTo(segment.toCamera.position.x, segment.toCamera.position.y);
          ctx.stroke();

          // Draw timestamp indicator
          const midX = (segment.fromCamera.position.x + segment.toCamera.position.x) / 2;
          const midY = (segment.fromCamera.position.y + segment.toCamera.position.y) / 2;
          ctx.fillStyle = 'rgba(255, 107, 107, 0.9)';
          ctx.beginPath();
          ctx.arc(midX, midY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.setLineDash([]);

      // Draw current location indicator
      if (journeyPath.currentLocation?.position) {
        const pos = journeyPath.currentLocation.position;
        // Pulsing dot effect
        const pulse = (Date.now() % 1000) / 1000;
        const radius = 10 + pulse * 5;
        const alpha = 1 - pulse * 0.5;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 107, 107, ' + alpha + ')';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    function drawLiveTrackingObjects() {
      const objectColors = {
        person: '#4caf50',
        car: '#2196f3',
        animal: '#ff9800',
        default: '#9c27b0'
      };

      for (const obj of liveTrackingData.objects) {
        if (!obj.cameraPosition) continue;

        // Skip if this is the selected journey object (drawn separately with path)
        if (obj.globalId === selectedJourneyId) continue;

        const pos = obj.cameraPosition;
        const color = objectColors[obj.className] || objectColors.default;
        const ageSeconds = (Date.now() - obj.lastSeen) / 1000;

        // Fade old objects
        const alpha = Math.max(0.3, 1 - ageSeconds / 60);

        // Draw object indicator
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ', ' + alpha + ')').replace('rgb', 'rgba');
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw class icon
        ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = obj.className === 'person' ? 'P' : obj.className === 'car' ? 'C' : obj.className === 'animal' ? 'A' : '?';
        ctx.fillText(icon, pos.x, pos.y);

        // Draw label below
        if (obj.label) {
          ctx.font = '9px sans-serif';
          ctx.fillText(obj.label.slice(0, 10), pos.x, pos.y + 20);
        }
      }
    }

    function drawZone(zone) {
      if (!zone.polygon || zone.polygon.length < 3) return;

      const isSelected = selectedItem?.type === 'zone' && selectedItem?.id === zone.id;
      const fillColor = zone.color || ZONE_COLORS[zone.type] || ZONE_COLORS.custom;
      const strokeColor = ZONE_STROKE_COLORS[zone.type] || ZONE_STROKE_COLORS.custom;

      // Draw filled polygon
      ctx.beginPath();
      ctx.moveTo(zone.polygon[0].x, zone.polygon[0].y);
      for (let i = 1; i < zone.polygon.length; i++) {
        ctx.lineTo(zone.polygon[i].x, zone.polygon[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#e94560' : strokeColor;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Draw zone label at centroid
      const centroid = getPolygonCentroid(zone.polygon);
      ctx.fillStyle = isSelected ? '#e94560' : '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.name, centroid.x, centroid.y);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#ccc';
      ctx.fillText(zone.type, centroid.x, centroid.y + 14);
    }

    function getPolygonCentroid(polygon) {
      let x = 0, y = 0;
      for (const pt of polygon) {
        x += pt.x;
        y += pt.y;
      }
      return { x: x / polygon.length, y: y / polygon.length };
    }

    function drawLandmark(landmark) {
      const pos = landmark.position;
      const isSelected = selectedItem?.type === 'landmark' && selectedItem?.id === landmark.id;
      // Color by type
      const colors = {
        structure: '#8b5cf6', // purple
        feature: '#10b981', // green
        boundary: '#f59e0b', // amber
        access: '#3b82f6', // blue
        vehicle: '#6366f1', // indigo
        neighbor: '#ec4899', // pink
        zone: '#14b8a6', // teal
        street: '#6b7280', // gray
      };
      const color = colors[landmark.type] || '#888';
      // Draw landmark marker
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 15);
      ctx.lineTo(pos.x + 12, pos.y + 8);
      ctx.lineTo(pos.x - 12, pos.y + 8);
      ctx.closePath();
      ctx.fillStyle = isSelected ? '#e94560' : color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Entry/exit indicators
      if (landmark.isEntryPoint || landmark.isExitPoint) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 20, 5, 0, Math.PI * 2);
        ctx.fillStyle = landmark.isEntryPoint ? '#4caf50' : '#ff9800';
        ctx.fill();
      }
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(landmark.name, pos.x, pos.y + 25);
    }

    function drawCamera(camera) {
      const pos = camera.floorPlanPosition;
      const isSelected = selectedItem?.type === 'camera' && selectedItem?.id === camera.deviceId;

      // Get FOV settings or defaults
      const fov = camera.fov || { mode: 'simple', angle: 90, direction: 0, range: 80 };
      const direction = (fov.mode === 'simple' || !fov.mode) ? (fov.direction || 0) : 0;
      const fovAngle = (fov.mode === 'simple' || !fov.mode) ? (fov.angle || 90) : 90;
      const range = (fov.mode === 'simple' || !fov.mode) ? (fov.range || 80) : 80;

      // Convert direction to radians (0 = up/north, 90 = right/east)
      const dirRad = (direction - 90) * Math.PI / 180;
      const halfFov = (fovAngle / 2) * Math.PI / 180;

      // Draw FOV cone
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.arc(pos.x, pos.y, range, dirRad - halfFov, dirRad + halfFov);
      ctx.closePath();
      ctx.fillStyle = isSelected ? 'rgba(233, 69, 96, 0.15)' : 'rgba(76, 175, 80, 0.15)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? 'rgba(233, 69, 96, 0.5)' : 'rgba(76, 175, 80, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw camera circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#e94560' : '#0f3460';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw camera icon/text
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAM', pos.x, pos.y);
      ctx.fillText(camera.name, pos.x, pos.y + 35);

      // Draw direction handle (when selected) for rotation
      if (isSelected) {
        const handleLength = 45;
        const handleX = pos.x + Math.cos(dirRad) * handleLength;
        const handleY = pos.y + Math.sin(dirRad) * handleLength;

        // Handle line
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(dirRad) * 20, pos.y + Math.sin(dirRad) * 20);
        ctx.lineTo(handleX, handleY);
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Handle grip (circle at end)
        ctx.beginPath();
        ctx.arc(handleX, handleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Store handle position for hit detection
        camera._handlePos = { x: handleX, y: handleY };
      }
    }

    function drawConnection(from, to, conn) {
      const isSelected = selectedItem?.type === 'connection' && selectedItem?.id === conn.id;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = isSelected ? '#e94560' : '#4caf50';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.stroke();
      if (!conn.bidirectional) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX - 10 * Math.cos(angle - 0.5), midY - 10 * Math.sin(angle - 0.5));
        ctx.lineTo(midX - 10 * Math.cos(angle + 0.5), midY - 10 * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fillStyle = isSelected ? '#e94560' : '#4caf50';
        ctx.fill();
      }
    }

    function uploadFloorPlan() { document.getElementById('upload-modal').classList.add('active'); }

    // Compress and resize image to avoid 413 errors (Scrypted has ~50KB limit)
    function compressImage(img, maxSize = 800, quality = 0.5) {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Always resize to fit within maxSize
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with aggressive compression
        let compressed = canvas.toDataURL('image/jpeg', quality);
        console.log('Compressed image from', img.width, 'x', img.height, 'to', width, 'x', height, 'size:', Math.round(compressed.length / 1024), 'KB');

        // If still too large, compress more
        let q = quality;
        while (compressed.length > 50000 && q > 0.1) {
          q -= 0.1;
          compressed = canvas.toDataURL('image/jpeg', q);
          console.log('Re-compressed at quality', q.toFixed(1), 'size:', Math.round(compressed.length / 1024), 'KB');
        }

        resolve(compressed);
      });
    }

    async function handleFloorPlanUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const originalData = e.target.result;

        // Load image to get dimensions
        const img = new Image();
        img.onload = async () => {
          // Compress image to reduce size
          const imageData = await compressImage(img);
          await loadFloorPlanImage(imageData);

          // Store floor plan separately via API
          try {
            setStatus('Uploading floor plan...', 'warning');
            const response = await fetch('../api/floor-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageData })
            });
            if (response.ok) {
              setStatus('Floor plan saved', 'success');
            } else {
              setStatus('Failed to save floor plan: ' + response.status, 'error');
              console.error('Floor plan upload failed:', response.status, response.statusText);
            }
          } catch (err) {
            console.error('Failed to save floor plan:', err);
            setStatus('Failed to save floor plan', 'error');
          }

          // Store reference in topology (without the large imageData)
          topology.floorPlan = { type: 'uploaded', width: floorPlanImage.width, height: floorPlanImage.height };
          closeModal('upload-modal');
          render();
        };
        img.src = originalData;
      };
      reader.readAsDataURL(file);
    }

    function loadFloorPlanImage(imageData) {
      return new Promise((resolve) => {
        floorPlanImage = new Image();
        floorPlanImage.onload = resolve;
        floorPlanImage.src = imageData;
      });
    }

    function openAddCameraModal() { document.getElementById('add-camera-modal').classList.add('active'); }

    function addCamera() {
      const deviceId = document.getElementById('camera-device-select').value;
      if (!deviceId) {
        alert('Please select a camera');
        return;
      }
      const selectedCam = availableCameras.find(c => c.id === deviceId);
      const customName = document.getElementById('camera-name-input').value;
      const name = customName || (selectedCam ? selectedCam.name : 'New Camera');
      const isEntry = document.getElementById('camera-entry-checkbox').checked;
      const isExit = document.getElementById('camera-exit-checkbox').checked;
      // Use pending position from click, or default to center
      const pos = topology._pendingCameraPos || { x: canvas.width / 2 + Math.random() * 100 - 50, y: canvas.height / 2 + Math.random() * 100 - 50 };
      delete topology._pendingCameraPos;
      const camera = {
        deviceId: deviceId,
        nativeId: 'cam-' + Date.now(),
        name,
        isEntryPoint: isEntry,
        isExitPoint: isExit,
        trackClasses: ['person', 'car', 'animal'],
        floorPlanPosition: pos
      };
      topology.cameras.push(camera);
      closeModal('add-camera-modal');
      // Clear form
      document.getElementById('camera-name-input').value = '';
      document.getElementById('camera-entry-checkbox').checked = false;
      document.getElementById('camera-exit-checkbox').checked = false;
      updateCameraSelects();
      updateUI();
      render();
    }

    function openAddConnectionModal() {
      if (topology.cameras.length < 2) { alert('Add at least 2 cameras before creating connections'); return; }
      updateCameraSelects();
      document.getElementById('add-connection-modal').classList.add('active');
    }

    function updateCameraSelects() {
      // Update camera device select (for adding new cameras)
      const cameraDeviceSelect = document.getElementById('camera-device-select');
      if (availableCameras.length > 0) {
        const existingIds = topology.cameras.map(c => c.deviceId);
        const available = availableCameras.filter(c => !existingIds.includes(c.id));
        if (available.length > 0) {
          cameraDeviceSelect.innerHTML = '<option value="">Select a camera...</option>' +
            available.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
        } else {
          cameraDeviceSelect.innerHTML = '<option value="">All cameras already added</option>';
        }
      } else {
        cameraDeviceSelect.innerHTML = '<option value="">No cameras with object detection found</option>';
      }

      // Update connection selects (for existing topology cameras)
      const options = topology.cameras.map(c => '<option value="' + c.deviceId + '">' + c.name + '</option>').join('');
      document.getElementById('connection-from-select').innerHTML = options;
      document.getElementById('connection-to-select').innerHTML = options;
    }

    function addConnection() {
      const name = document.getElementById('connection-name-input').value;
      const fromId = document.getElementById('connection-from-select').value;
      const toId = document.getElementById('connection-to-select').value;
      const minTransit = parseInt(document.getElementById('transit-min').value) * 1000;
      const typicalTransit = parseInt(document.getElementById('transit-typical').value) * 1000;
      const maxTransit = parseInt(document.getElementById('transit-max').value) * 1000;
      const bidirectional = document.getElementById('connection-bidirectional').checked;
      if (fromId === toId) { alert('Please select different cameras'); return; }
      const connection = {
        id: 'conn-' + Date.now(),
        fromCameraId: fromId,
        toCameraId: toId,
        name: name || fromId + ' to ' + toId,
        exitZone: [],
        entryZone: [],
        transitTime: { min: minTransit, typical: typicalTransit, max: maxTransit },
        bidirectional
      };
      topology.connections.push(connection);
      closeModal('add-connection-modal');
      updateUI();
      render();
    }

    function updateUI() {
      const cameraList = document.getElementById('camera-list');
      if (topology.cameras.length === 0) {
        cameraList.innerHTML = '<div class="camera-item" style="color: #666; text-align: center; cursor: default;">No cameras configured</div>';
      } else {
        cameraList.innerHTML = topology.cameras.map(c => '<div class="camera-item ' + (selectedItem?.type === 'camera' && selectedItem?.id === c.deviceId ? 'selected' : '') + '" onclick="selectCamera(\\'' + c.deviceId + '\\')"><div class="camera-name">CAM ' + c.name + '</div><div class="camera-info">' + (c.isEntryPoint ? 'Entry ' : '') + (c.isExitPoint ? 'Exit' : '') + '</div></div>').join('');
      }
      const connectionList = document.getElementById('connection-list');
      if (topology.connections.length === 0) {
        connectionList.innerHTML = '<div class="connection-item" style="color: #666; text-align: center; cursor: default;">No connections configured</div>';
      } else {
        connectionList.innerHTML = topology.connections.map(c => '<div class="connection-item ' + (selectedItem?.type === 'connection' && selectedItem?.id === c.id ? 'selected' : '') + '" onclick="selectConnection(\\'' + c.id + '\\')"><div class="camera-name">' + c.name + '</div><div class="camera-info">' + (c.transitTime.typical / 1000) + 's typical ' + (c.bidirectional ? '<->' : '->') + '</div></div>').join('');
      }
      // Landmark list
      const landmarkList = document.getElementById('landmark-list');
      const landmarks = topology.landmarks || [];
      if (landmarks.length === 0) {
        landmarkList.innerHTML = '<div class="landmark-item" style="color: #666; text-align: center; cursor: default; padding: 8px;">No landmarks configured</div>';
      } else {
        landmarkList.innerHTML = landmarks.map(l => '<div class="camera-item ' + (selectedItem?.type === 'landmark' && selectedItem?.id === l.id ? 'selected' : '') + '" onclick="selectLandmark(\\'' + l.id + '\\')"><div class="camera-name">' + l.name + '</div><div class="camera-info">' + l.type + (l.isEntryPoint ? ' | Entry' : '') + (l.isExitPoint ? ' | Exit' : '') + '</div></div>').join('');
      }
      // Zone list
      const zoneList = document.getElementById('zone-list');
      const zones = topology.drawnZones || [];
      if (zones.length === 0) {
        zoneList.innerHTML = '<div class="zone-item" style="color: #666; text-align: center; cursor: default; padding: 8px;">No zones drawn</div>';
      } else {
        zoneList.innerHTML = zones.map(z => {
          const color = ZONE_STROKE_COLORS[z.type] || ZONE_STROKE_COLORS.custom;
          return '<div class="camera-item ' + (selectedItem?.type === 'zone' && selectedItem?.id === z.id ? 'selected' : '') + '" onclick="selectZone(\\'' + z.id + '\\')" style="border-left: 3px solid ' + color + ';"><div class="camera-name">' + z.name + '</div><div class="camera-info">' + z.type + ' | ' + z.polygon.length + ' points</div></div>';
        }).join('');
      }
      document.getElementById('camera-count').textContent = topology.cameras.length;
      document.getElementById('connection-count').textContent = topology.connections.length;
      document.getElementById('landmark-count').textContent = landmarks.length;
    }

    function selectCamera(deviceId) {
      selectedItem = { type: 'camera', id: deviceId };
      const camera = topology.cameras.find(c => c.deviceId === deviceId);
      showCameraProperties(camera);
      updateUI();
      render();
    }

    function selectConnection(connId) {
      selectedItem = { type: 'connection', id: connId };
      const connection = topology.connections.find(c => c.id === connId);
      showConnectionProperties(connection);
      updateUI();
      render();
    }

    function showCameraProperties(camera) {
      const panel = document.getElementById('properties-panel');
      const fov = camera.fov || { mode: 'simple', angle: 90, direction: 0, range: 80 };
      // Convert stored pixel range to feet for display
      const rangeInFeet = Math.round(pixelsToFeet(fov.range || 80));
      panel.innerHTML = '<h3>Camera Properties</h3>' +
        '<div class="form-group"><label>Name</label><input type="text" value="' + camera.name + '" onchange="updateCameraName(\\'' + camera.deviceId + '\\', this.value)"></div>' +
        '<div class="form-group"><label class="checkbox-group"><input type="checkbox" ' + (camera.isEntryPoint ? 'checked' : '') + ' onchange="updateCameraEntry(\\'' + camera.deviceId + '\\', this.checked)">Entry Point</label></div>' +
        '<div class="form-group"><label class="checkbox-group"><input type="checkbox" ' + (camera.isExitPoint ? 'checked' : '') + ' onchange="updateCameraExit(\\'' + camera.deviceId + '\\', this.checked)">Exit Point</label></div>' +
        '<h4 style="margin-top: 15px; margin-bottom: 10px; color: #888;">Field of View</h4>' +
        '<div class="form-group"><label>Direction (0=up, 90=right)</label><input type="number" value="' + Math.round(fov.direction || 0) + '" min="0" max="359" onchange="updateCameraFov(\\'' + camera.deviceId + '\\', \\'direction\\', this.value)"></div>' +
        '<div class="form-group"><label>FOV Angle (degrees)</label><input type="number" value="' + (fov.angle || 90) + '" min="30" max="180" onchange="updateCameraFov(\\'' + camera.deviceId + '\\', \\'angle\\', this.value)"></div>' +
        '<div class="form-group"><label>Range (feet)</label><input type="number" value="' + rangeInFeet + '" min="5" max="200" onchange="updateCameraFovRange(\\'' + camera.deviceId + '\\', this.value)"></div>' +
        '<div style="font-size: 11px; color: #666; margin-top: -10px; margin-bottom: 15px;">~' + (fov.range || 80) + ' pixels at current scale</div>' +
        '<div class="form-group"><button class="btn" style="width: 100%; background: #f44336;" onclick="deleteCamera(\\'' + camera.deviceId + '\\')">Delete Camera</button></div>';
    }

    function showConnectionProperties(connection) {
      const panel = document.getElementById('properties-panel');
      panel.innerHTML = '<h3>Connection Properties</h3><div class="form-group"><label>Name</label><input type="text" value="' + connection.name + '" onchange="updateConnectionName(\\'' + connection.id + '\\', this.value)"></div><div class="form-group"><label>Transit Time (seconds)</label><div class="transit-time-inputs"><input type="number" value="' + (connection.transitTime.min / 1000) + '" onchange="updateTransitTime(\\'' + connection.id + '\\', \\'min\\', this.value)"><input type="number" value="' + (connection.transitTime.typical / 1000) + '" onchange="updateTransitTime(\\'' + connection.id + '\\', \\'typical\\', this.value)"><input type="number" value="' + (connection.transitTime.max / 1000) + '" onchange="updateTransitTime(\\'' + connection.id + '\\', \\'max\\', this.value)"></div><div class="transit-time-labels"><span>Min</span><span>Typical</span><span>Max</span></div></div><div class="form-group"><label class="checkbox-group"><input type="checkbox" ' + (connection.bidirectional ? 'checked' : '') + ' onchange="updateConnectionBidi(\\'' + connection.id + '\\', this.checked)">Bidirectional</label></div><div class="form-group"><button class="btn" style="width: 100%; background: #f44336;" onclick="deleteConnection(\\'' + connection.id + '\\')">Delete Connection</button></div>';
    }

    function updateCameraName(id, value) { const camera = topology.cameras.find(c => c.deviceId === id); if (camera) camera.name = value; updateUI(); }
    function updateCameraEntry(id, value) { const camera = topology.cameras.find(c => c.deviceId === id); if (camera) camera.isEntryPoint = value; }
    function updateCameraExit(id, value) { const camera = topology.cameras.find(c => c.deviceId === id); if (camera) camera.isExitPoint = value; }
    function updateCameraFov(id, field, value) {
      const camera = topology.cameras.find(c => c.deviceId === id);
      if (!camera) return;
      if (!camera.fov) camera.fov = { mode: 'simple', angle: 90, direction: 0, range: 80 };
      camera.fov[field] = parseFloat(value);
      render();
    }
    function updateCameraFovRange(id, feetValue) {
      // Convert feet to pixels and store
      const camera = topology.cameras.find(c => c.deviceId === id);
      if (!camera) return;
      if (!camera.fov) camera.fov = { mode: 'simple', angle: 90, direction: 0, range: 80 };
      camera.fov.range = feetToPixels(parseFloat(feetValue));
      render();
      // Update the pixel display
      showCameraProperties(camera);
    }
    function updateScale(value) {
      floorPlanScale = parseFloat(value) || 5;
      // Store in topology for persistence
      topology.floorPlanScale = floorPlanScale;
      render();
      setStatus('Scale updated: ' + floorPlanScale + ' pixels per foot', 'success');
    }
    function openScaleHelper() {
      alert('How to determine your floor plan scale:\\n\\n' +
        '1. Measure a known distance on your floor plan in pixels\\n' +
        '   (e.g., measure a room that you know is 20 feet wide)\\n\\n' +
        '2. Divide the pixel width by the real width in feet\\n' +
        '   Example: 200 pixels / 20 feet = 10 pixels per foot\\n\\n' +
        '3. Enter that value in the scale field\\n\\n' +
        'Common scales:\\n' +
        '- Small floor plan (fits on screen): 3-5 px/ft\\n' +
        '- Medium floor plan: 5-10 px/ft\\n' +
        '- Large/detailed floor plan: 10-20 px/ft\\n\\n' +
        'Tip: Most outdoor cameras see 30-50 feet, indoor 15-30 feet');
    }
    function updateConnectionName(id, value) { const conn = topology.connections.find(c => c.id === id); if (conn) conn.name = value; updateUI(); }
    function updateTransitTime(id, field, value) { const conn = topology.connections.find(c => c.id === id); if (conn) conn.transitTime[field] = parseInt(value) * 1000; }
    function updateConnectionBidi(id, value) { const conn = topology.connections.find(c => c.id === id); if (conn) conn.bidirectional = value; render(); }
    function deleteCamera(id) { if (!confirm('Delete this camera?')) return; topology.cameras = topology.cameras.filter(c => c.deviceId !== id); topology.connections = topology.connections.filter(c => c.fromCameraId !== id && c.toCameraId !== id); selectedItem = null; document.getElementById('properties-panel').innerHTML = '<h3>Properties</h3><p style="color: #666;">Select a camera or connection.</p>'; updateCameraSelects(); updateUI(); render(); }
    function deleteConnection(id) { if (!confirm('Delete this connection?')) return; topology.connections = topology.connections.filter(c => c.id !== id); selectedItem = null; document.getElementById('properties-panel').innerHTML = '<h3>Properties</h3><p style="color: #666;">Select a camera or connection.</p>'; updateUI(); render(); }
    function setTool(tool) {
      // If switching away from zone tool while drawing, cancel
      if (currentTool === 'zone' && tool !== 'zone' && zoneDrawingMode) {
        cancelZoneDrawing();
      }
      currentTool = tool;
      setStatus('Tool: ' + tool, 'success');
      document.querySelectorAll('.toolbar .btn').forEach(b => b.style.background = '');
      const btn = document.getElementById('tool-' + tool);
      if (btn) btn.style.background = tool === 'zone' ? '#2e7d32' : '#e94560';

      // If zone tool selected, open the zone config modal
      if (tool === 'zone') {
        openZoneModal();
      }
    }

    // ==================== Zone Drawing Functions ====================

    function openZoneModal() {
      document.getElementById('zone-name-input').value = '';
      document.getElementById('zone-type-select').value = 'yard';
      document.getElementById('zone-desc-input').value = '';
      document.getElementById('add-zone-modal').classList.add('active');
    }

    function startZoneDrawing() {
      const name = document.getElementById('zone-name-input').value.trim();
      const type = document.getElementById('zone-type-select').value;
      const description = document.getElementById('zone-desc-input').value.trim();

      if (!name) {
        alert('Please enter a zone name');
        return;
      }

      pendingZoneConfig = { name, type, description };
      zoneDrawingMode = true;
      currentZonePoints = [];
      closeModal('add-zone-modal');
      setStatus('Zone drawing mode - click to add points, double-click to finish', 'warning');
      render();
    }

    function cancelZoneDrawing() {
      zoneDrawingMode = false;
      currentZonePoints = [];
      pendingZoneConfig = null;
      closeModal('add-zone-modal');
      setTool('select');
      setStatus('Zone drawing cancelled', 'success');
      render();
    }

    function finishZoneDrawing() {
      if (currentZonePoints.length < 3) {
        alert('A zone needs at least 3 points');
        return;
      }

      if (!pendingZoneConfig) {
        cancelZoneDrawing();
        return;
      }

      // Create the zone
      const zone = {
        id: 'zone_' + Date.now(),
        name: pendingZoneConfig.name,
        type: pendingZoneConfig.type,
        description: pendingZoneConfig.description || undefined,
        polygon: currentZonePoints.map(pt => ({ x: pt.x, y: pt.y })),
      };

      if (!topology.drawnZones) topology.drawnZones = [];
      topology.drawnZones.push(zone);

      // Reset state
      zoneDrawingMode = false;
      currentZonePoints = [];
      pendingZoneConfig = null;

      setTool('select');
      updateUI();
      render();
      setStatus('Zone "' + zone.name + '" created with ' + zone.polygon.length + ' points', 'success');
    }

    function selectZone(id) {
      selectedItem = { type: 'zone', id };
      showZoneProperties(id);
      render();
    }

    function showZoneProperties(id) {
      const zone = (topology.drawnZones || []).find(z => z.id === id);
      if (!zone) return;

      const panel = document.getElementById('properties-panel');
      panel.innerHTML = '<h3>Zone Properties</h3>' +
        '<div class="form-group"><label>Name</label><input type="text" value="' + zone.name + '" onchange="updateZoneName(\\'' + id + '\\', this.value)"></div>' +
        '<div class="form-group"><label>Type</label><select onchange="updateZoneType(\\'' + id + '\\', this.value)">' +
        ['yard','driveway','street','patio','walkway','parking','garden','pool','garage','entrance','custom'].map(t =>
          '<option value="' + t + '"' + (zone.type === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'
        ).join('') + '</select></div>' +
        '<div class="form-group"><label>Description</label><input type="text" value="' + (zone.description || '') + '" onchange="updateZoneDesc(\\'' + id + '\\', this.value)"></div>' +
        '<div class="form-group"><label>Points: ' + zone.polygon.length + '</label></div>' +
        '<button class="btn btn-primary" onclick="deleteZone(\\'' + id + '\\')" style="background: #dc2626; width: 100%;">Delete Zone</button>';
    }

    function updateZoneName(id, value) { const z = (topology.drawnZones || []).find(z => z.id === id); if (z) { z.name = value; updateUI(); render(); } }
    function updateZoneType(id, value) { const z = (topology.drawnZones || []).find(z => z.id === id); if (z) { z.type = value; updateUI(); render(); } }
    function updateZoneDesc(id, value) { const z = (topology.drawnZones || []).find(z => z.id === id); if (z) { z.description = value || undefined; } }
    function deleteZone(id) {
      if (!confirm('Delete this zone?')) return;
      topology.drawnZones = (topology.drawnZones || []).filter(z => z.id !== id);
      selectedItem = null;
      document.getElementById('properties-panel').innerHTML = '<h3>Properties</h3><p style="color: #666;">Select an item to edit.</p>';
      updateUI();
      render();
      setStatus('Zone deleted', 'success');
    }

    function useBlankCanvas() {
      blankCanvasMode = true;
      floorPlanImage = null;
      topology.floorPlan = { type: 'blank', width: canvas.width, height: canvas.height };
      render();
      setStatus('Blank canvas ready - use Draw Wall or Draw Room tools', 'success');
    }

    function clearDrawings() {
      if (!confirm('Clear all drawings (walls and rooms)?')) return;
      topology.drawings = [];
      render();
      setStatus('Drawings cleared', 'success');
    }

    function clearAllTopology() {
      if (!confirm('DELETE ALL TOPOLOGY DATA?\\n\\nThis will remove:\\n- All cameras\\n- All connections\\n- All landmarks\\n- All zones\\n- All drawings\\n\\nThis cannot be undone.')) return;

      topology.cameras = [];
      topology.connections = [];
      topology.landmarks = [];
      topology.globalZones = [];
      topology.drawnZones = [];
      topology.drawings = [];
      topology.relationships = [];

      selectedItem = null;
      document.getElementById('properties-panel').innerHTML = '<h3>Properties</h3><p style="color: #666;">Select an item to edit.</p>';
      updateCameraSelects();
      updateUI();
      render();
      setStatus('All topology data cleared', 'warning');
    }

    function closeModal(id) { document.getElementById(id).classList.remove('active'); }
    function setStatus(text, type) { document.getElementById('status-text').textContent = text; const dot = document.getElementById('status-dot'); dot.className = 'status-dot'; if (type === 'warning') dot.classList.add('warning'); if (type === 'error') dot.classList.add('error'); }

    let dragging = null;
    let rotatingCamera = null;

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Handle zone drawing mode separately
      if (zoneDrawingMode) {
        currentZonePoints.push({ x, y });
        render();
        setStatus('Point ' + currentZonePoints.length + ' added. ' + (currentZonePoints.length < 3 ? 'Need at least 3 points.' : 'Double-click or Enter to finish.'), 'warning');
        return;
      }

      if (currentTool === 'select') {
        // Check for rotation handle on selected camera first
        if (selectedItem?.type === 'camera') {
          const camera = topology.cameras.find(c => c.deviceId === selectedItem.id);
          if (camera?._handlePos) {
            const dist = Math.hypot(x - camera._handlePos.x, y - camera._handlePos.y);
            if (dist < 15) {
              rotatingCamera = camera;
              setStatus('Drag to rotate camera direction', 'warning');
              return;
            }
          }
        }

        // Check cameras
        for (const camera of topology.cameras) {
          if (camera.floorPlanPosition) {
            const dist = Math.hypot(x - camera.floorPlanPosition.x, y - camera.floorPlanPosition.y);
            if (dist < 25) { selectCamera(camera.deviceId); dragging = { type: 'camera', item: camera }; return; }
          }
        }
        // Check landmarks
        for (const landmark of (topology.landmarks || [])) {
          if (landmark.position) {
            const dist = Math.hypot(x - landmark.position.x, y - landmark.position.y);
            if (dist < 20) { selectLandmark(landmark.id); dragging = { type: 'landmark', item: landmark }; return; }
          }
        }
        // Check zones (click inside polygon)
        for (const zone of (topology.drawnZones || [])) {
          if (zone.polygon && isPointInPolygon({ x, y }, zone.polygon)) {
            selectZone(zone.id);
            return;
          }
        }
      } else if (currentTool === 'wall') {
        isDrawing = true;
        drawStart = { x, y };
        currentDrawing = { type: 'wall', x1: x, y1: y, x2: x, y2: y };
      } else if (currentTool === 'room') {
        isDrawing = true;
        drawStart = { x, y };
        currentDrawing = { type: 'room', x: x, y: y, width: 0, height: 0 };
      } else if (currentTool === 'camera') {
        openAddCameraModal();
        topology._pendingCameraPos = { x, y };
      } else if (currentTool === 'landmark') {
        openAddLandmarkModal();
        topology._pendingLandmarkPos = { x, y };
      }
    });

    // Double-click to finish zone drawing
    canvas.addEventListener('dblclick', (e) => {
      if (zoneDrawingMode && currentZonePoints.length >= 3) {
        finishZoneDrawing();
      }
    });

    // Point-in-polygon test (ray casting algorithm)
    function isPointInPolygon(point, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Handle camera rotation
      if (rotatingCamera) {
        const pos = rotatingCamera.floorPlanPosition;
        const angle = Math.atan2(y - pos.y, x - pos.x);
        // Convert to our direction system (0 = up/north, 90 = right/east)
        const direction = (angle * 180 / Math.PI) + 90;
        if (!rotatingCamera.fov) {
          rotatingCamera.fov = { mode: 'simple', angle: 90, direction: 0, range: 80 };
        }
        rotatingCamera.fov.direction = ((direction % 360) + 360) % 360; // Normalize 0-360
        render();
        return;
      }

      if (dragging) {
        if (dragging.type === 'camera') {
          dragging.item.floorPlanPosition.x = x;
          dragging.item.floorPlanPosition.y = y;
        } else if (dragging.type === 'landmark') {
          dragging.item.position.x = x;
          dragging.item.position.y = y;
        }
        render();
      } else if (isDrawing && currentDrawing) {
        if (currentDrawing.type === 'wall') {
          currentDrawing.x2 = x;
          currentDrawing.y2 = y;
        } else if (currentDrawing.type === 'room') {
          currentDrawing.width = x - drawStart.x;
          currentDrawing.height = y - drawStart.y;
        }
        render();
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      // Clear camera rotation
      if (rotatingCamera) {
        setStatus('Camera direction updated', 'success');
        rotatingCamera = null;
        return;
      }

      if (isDrawing && currentDrawing) {
        if (!topology.drawings) topology.drawings = [];
        // Normalize room coordinates if drawn backwards
        if (currentDrawing.type === 'room') {
          if (currentDrawing.width < 0) {
            currentDrawing.x += currentDrawing.width;
            currentDrawing.width = Math.abs(currentDrawing.width);
          }
          if (currentDrawing.height < 0) {
            currentDrawing.y += currentDrawing.height;
            currentDrawing.height = Math.abs(currentDrawing.height);
          }
          // Only add if room is big enough
          if (currentDrawing.width > 20 && currentDrawing.height > 20) {
            const label = prompt('Room name (optional):');
            if (label) currentDrawing.label = label;
            topology.drawings.push(currentDrawing);
          }
        } else if (currentDrawing.type === 'wall') {
          // Only add if wall is long enough
          const len = Math.hypot(currentDrawing.x2 - currentDrawing.x1, currentDrawing.y2 - currentDrawing.y1);
          if (len > 20) {
            topology.drawings.push(currentDrawing);
          }
        }
        isDrawing = false;
        currentDrawing = null;
        render();
      }
      dragging = null;
    });

    window.addEventListener('resize', () => { resizeCanvas(); render(); });

    // Keyboard handler for zone drawing
    document.addEventListener('keydown', (e) => {
      if (zoneDrawingMode) {
        if (e.key === 'Enter' && currentZonePoints.length >= 3) {
          finishZoneDrawing();
        } else if (e.key === 'Escape') {
          cancelZoneDrawing();
        } else if (e.key === 'Backspace' && currentZonePoints.length > 0) {
          currentZonePoints.pop();
          render();
          setStatus('Last point removed. ' + currentZonePoints.length + ' points remaining.', 'warning');
        }
      }
    });
    init();
  </script>
</body>
</html>`;
