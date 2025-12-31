/**
 * Training Mode UI - Mobile-optimized walkthrough interface
 * Designed for phone use while walking around property
 */

export const TRAINING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <title>Spatial Awareness - Training Mode</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #121212;
      color: rgba(255,255,255,0.87);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: rgba(255,255,255,0.03);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .header h1 { font-size: 16px; font-weight: 500; }
    .header-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .status-badge {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .status-badge.idle { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
    .status-badge.active { background: #4fc3f7; color: #000; animation: pulse 2s infinite; }
    .status-badge.paused { background: #ffb74d; color: #000; }
    .status-badge.completed { background: #81c784; color: #000; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

    /* Main content area */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      overflow-y: auto;
      gap: 12px;
    }

    /* Camera detection card */
    .detection-card {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      transition: all 0.3s;
    }
    .detection-card.detecting {
      border-color: #4fc3f7;
      background: rgba(79, 195, 247, 0.1);
    }
    .detection-card.in-transit {
      border-color: #ffb74d;
      background: rgba(255, 183, 77, 0.1);
    }

    .detection-icon {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      background: rgba(255,255,255,0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 12px;
      font-size: 28px;
    }
    .detection-card.detecting .detection-icon {
      background: #4fc3f7;
      animation: detectPulse 1.5s infinite;
    }
    @keyframes detectPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }

    .detection-title {
      font-size: 18px;
      font-weight: 500;
      text-align: center;
      margin-bottom: 4px;
    }
    .detection-subtitle {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      text-align: center;
    }
    .detection-confidence {
      margin-top: 8px;
      text-align: center;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
    }

    /* Transit timer */
    .transit-timer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
      padding: 10px;
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
    }
    .transit-timer-icon { font-size: 18px; }
    .transit-timer-text { font-size: 16px; font-weight: 500; }
    .transit-timer-from { font-size: 12px; color: rgba(255,255,255,0.5); }

    /* Stats grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .stat-item {
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      padding: 12px 8px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-value {
      font-size: 24px;
      font-weight: 500;
      color: #4fc3f7;
    }
    .stat-label {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* Progress bar */
    .progress-section {
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #4fc3f7;
      border-radius: 3px;
      transition: width 0.5s;
    }

    /* Suggestions */
    .suggestions-section {
      background: rgba(79, 195, 247, 0.08);
      border: 1px solid rgba(79, 195, 247, 0.2);
      border-radius: 6px;
      padding: 12px;
    }
    .suggestions-title {
      font-size: 11px;
      text-transform: uppercase;
      color: #4fc3f7;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .suggestion-item {
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.7);
    }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item::before {
      content: "→ ";
      color: #4fc3f7;
    }

    /* Action buttons */
    .action-buttons {
      display: flex;
      gap: 8px;
      padding: 8px 0;
    }
    .btn {
      flex: 1;
      padding: 14px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background: #4fc3f7; color: #000; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.87); }
    .btn-danger { background: #ef5350; color: #fff; }
    .btn-warning { background: #ffb74d; color: #000; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Full-width button */
    .btn-full { flex: none; width: 100%; }

    /* Mark landmark/structure panel */
    .mark-panel {
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .mark-panel-title {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .mark-type-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .mark-type-btn {
      padding: 10px 6px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mark-type-btn.selected {
      border-color: #4fc3f7;
      background: rgba(79, 195, 247, 0.15);
      color: #fff;
    }
    .mark-type-btn .icon { font-size: 18px; margin-bottom: 2px; display: block; }

    /* Input field */
    .input-group { margin-bottom: 12px; }
    .input-group label {
      display: block;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 4px;
    }
    .input-group input {
      width: 100%;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      color: #fff;
      font-size: 14px;
    }
    .input-group input:focus {
      outline: none;
      border-color: #4fc3f7;
    }

    /* History list */
    .history-section {
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      padding: 12px;
      max-height: 180px;
      overflow-y: auto;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .history-title {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .history-item {
      padding: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .history-item:last-child { border-bottom: none; }
    .history-item-time {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
    }
    .history-item-camera { color: #4fc3f7; font-weight: 500; }
    .history-item-transit { color: #ffb74d; }

    /* Bottom action bar */
    .bottom-bar {
      background: rgba(255,255,255,0.03);
      padding: 12px 16px;
      padding-bottom: max(12px, env(safe-area-inset-bottom));
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    /* Tabs */
    .tabs {
      display: flex;
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
      padding: 3px;
      margin-bottom: 12px;
    }
    .tab {
      flex: 1;
      padding: 10px;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .tab.active {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.87);
    }

    /* Tab content */
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Apply results modal */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-overlay.active { display: flex; }
    .modal {
      background: #1e1e1e;
      border-radius: 8px;
      padding: 20px;
      max-width: 360px;
      width: 100%;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .modal h2 { font-size: 18px; margin-bottom: 12px; font-weight: 500; }
    .modal-result-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
    }
    .modal-result-value { color: #4fc3f7; font-weight: 500; }
    .modal-buttons { display: flex; gap: 8px; margin-top: 16px; }

    /* Idle state */
    .idle-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 32px 16px;
    }
    .idle-icon {
      font-size: 56px;
      margin-bottom: 16px;
      opacity: 0.7;
    }
    .idle-title {
      font-size: 20px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .idle-desc {
      font-size: 14px;
      color: rgba(255,255,255,0.5);
      max-width: 280px;
      line-height: 1.5;
    }
    .idle-instructions {
      margin-top: 24px;
      text-align: left;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .idle-instructions h3 {
      font-size: 12px;
      margin-bottom: 10px;
      color: #4fc3f7;
      font-weight: 500;
    }
    .idle-instructions ol {
      padding-left: 18px;
      font-size: 13px;
      line-height: 1.8;
      color: rgba(255,255,255,0.6);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Training Mode</h1>
    <div class="header-status">
      <span class="status-badge" id="status-badge">Idle</span>
    </div>
  </div>

  <!-- Idle State -->
  <div class="main-content" id="idle-content">
    <div class="idle-content">
      <div class="idle-icon">🚶</div>
      <div class="idle-title">Train Your System</div>
      <div class="idle-desc">Walk around your property to teach the system about camera positions, transit times, and landmarks.</div>

      <div class="idle-instructions">
        <h3>How it works:</h3>
        <ol>
          <li>Tap <strong>Start Training</strong> below</li>
          <li>Walk to each camera on your property</li>
          <li>The system detects you automatically</li>
          <li>Mark landmarks as you encounter them</li>
          <li>End training when you're done</li>
        </ol>
      </div>
    </div>

    <div class="bottom-bar">
      <button class="btn btn-primary btn-full" onclick="startTraining()">
        ▶ Start Training
      </button>
    </div>
  </div>

  <!-- Active Training State -->
  <div class="main-content" id="active-content" style="display: none;">
    <!-- Detection Card -->
    <div class="detection-card" id="detection-card">
      <div class="detection-icon" id="detection-icon">👤</div>
      <div class="detection-title" id="detection-title">Waiting for detection...</div>
      <div class="detection-subtitle" id="detection-subtitle">Walk to any camera to begin</div>
      <div class="detection-confidence" id="detection-confidence"></div>

      <div class="transit-timer" id="transit-timer" style="display: none;">
        <span class="transit-timer-icon">⏱</span>
        <span class="transit-timer-text" id="transit-time">0s</span>
        <span class="transit-timer-from" id="transit-from"></span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('status')">Status</button>
      <button class="tab" onclick="switchTab('mark')">Mark</button>
      <button class="tab" onclick="switchTab('history')">History</button>
    </div>

    <!-- Status Tab -->
    <div class="tab-content active" id="tab-status">
      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="stat-cameras">0</div>
          <div class="stat-label">Cameras</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-transits">0</div>
          <div class="stat-label">Transits</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-landmarks">0</div>
          <div class="stat-label">Landmarks</div>
        </div>
      </div>

      <!-- Progress -->
      <div class="progress-section" style="margin-top: 15px;">
        <div class="progress-header">
          <span>Coverage</span>
          <span id="progress-percent">0%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
        </div>
      </div>

      <!-- Suggestions -->
      <div class="suggestions-section" style="margin-top: 15px;" id="suggestions-section">
        <div class="suggestions-title">Suggestions</div>
        <div id="suggestions-list">
          <div class="suggestion-item">Start walking to a camera</div>
        </div>
      </div>
    </div>

    <!-- Mark Tab -->
    <div class="tab-content" id="tab-mark">
      <div class="mark-panel">
        <div class="mark-panel-title">Mark a Landmark</div>
        <div class="mark-type-grid" id="landmark-type-grid">
          <button class="mark-type-btn selected" data-type="mailbox" onclick="selectLandmarkType('mailbox')">
            <span class="icon">📬</span>
            Mailbox
          </button>
          <button class="mark-type-btn" data-type="garage" onclick="selectLandmarkType('garage')">
            <span class="icon">🏠</span>
            Garage
          </button>
          <button class="mark-type-btn" data-type="shed" onclick="selectLandmarkType('shed')">
            <span class="icon">🏚</span>
            Shed
          </button>
          <button class="mark-type-btn" data-type="tree" onclick="selectLandmarkType('tree')">
            <span class="icon">🌳</span>
            Tree
          </button>
          <button class="mark-type-btn" data-type="gate" onclick="selectLandmarkType('gate')">
            <span class="icon">🚪</span>
            Gate
          </button>
          <button class="mark-type-btn" data-type="driveway" onclick="selectLandmarkType('driveway')">
            <span class="icon">🛣</span>
            Driveway
          </button>
          <button class="mark-type-btn" data-type="pool" onclick="selectLandmarkType('pool')">
            <span class="icon">🏊</span>
            Pool
          </button>
          <button class="mark-type-btn" data-type="other" onclick="selectLandmarkType('other')">
            <span class="icon">📍</span>
            Other
          </button>
        </div>

        <div class="input-group">
          <label>Landmark Name</label>
          <input type="text" id="landmark-name" placeholder="e.g., Front Mailbox">
        </div>

        <button class="btn btn-primary btn-full" onclick="markLandmark()">
          📍 Mark Landmark Here
        </button>
      </div>
    </div>

    <!-- History Tab -->
    <div class="tab-content" id="tab-history">
      <div class="history-section">
        <div class="history-title">
          <span>Recent Activity</span>
          <span id="history-count">0 events</span>
        </div>
        <div id="history-list">
          <div class="history-item" style="color: rgba(255,255,255,0.4); text-align: center;">
            No activity yet
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="bottom-bar">
      <div class="action-buttons">
        <button class="btn btn-warning" id="pause-btn" onclick="togglePause()">
          ⏸ Pause
        </button>
        <button class="btn btn-danger" onclick="endTraining()">
          ⏹ End
        </button>
      </div>
    </div>
  </div>

  <!-- Completed State -->
  <div class="main-content" id="completed-content" style="display: none;">
    <div class="idle-content">
      <div class="idle-icon">✅</div>
      <div class="idle-title">Training Complete!</div>
      <div class="idle-desc">Review the results and apply them to your topology.</div>
    </div>

    <!-- Final Stats -->
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value" id="final-cameras">0</div>
        <div class="stat-label">Cameras</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="final-transits">0</div>
        <div class="stat-label">Transits</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="final-landmarks">0</div>
        <div class="stat-label">Landmarks</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-top: 10px;">
      <div class="stat-item">
        <div class="stat-value" id="final-overlaps">0</div>
        <div class="stat-label">Overlaps</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="final-avg-transit">0s</div>
        <div class="stat-label">Avg Transit</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="final-coverage">0%</div>
        <div class="stat-label">Coverage</div>
      </div>
    </div>

    <div class="bottom-bar" style="margin-top: auto;">
      <div class="action-buttons">
        <button class="btn btn-secondary" onclick="resetTraining()">
          ↻ Start Over
        </button>
        <button class="btn btn-primary" onclick="applyTraining()">
          ✓ Apply Results
        </button>
      </div>
    </div>
  </div>

  <!-- Apply Results Modal -->
  <div class="modal-overlay" id="results-modal">
    <div class="modal">
      <h2>Training Applied!</h2>
      <div id="results-content">
        <div class="modal-result-item">
          <span>Connections Created</span>
          <span class="modal-result-value" id="result-connections">0</span>
        </div>
        <div class="modal-result-item">
          <span>Connections Updated</span>
          <span class="modal-result-value" id="result-updated">0</span>
        </div>
        <div class="modal-result-item">
          <span>Landmarks Added</span>
          <span class="modal-result-value" id="result-landmarks">0</span>
        </div>
        <div class="modal-result-item">
          <span>Zones Created</span>
          <span class="modal-result-value" id="result-zones">0</span>
        </div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" style="flex: 1;" onclick="closeResultsModal()">Close</button>
        <button class="btn btn-primary" style="flex: 1;" onclick="openEditor()">Open Editor</button>
      </div>
    </div>
  </div>

  <script>
    let trainingState = 'idle'; // idle, active, paused, completed
    let session = null;
    let pollInterval = null;
    let transitInterval = null;
    let selectedLandmarkType = 'mailbox';
    let historyItems = [];

    // Initialize
    async function init() {
      // Check if there's an existing session
      const status = await fetchTrainingStatus();
      if (status && (status.state === 'active' || status.state === 'paused')) {
        session = status;
        trainingState = status.state;
        updateUI();
        startPolling();
      }
    }

    // API calls
    async function fetchTrainingStatus() {
      try {
        const response = await fetch('../api/training/status');
        if (response.ok) {
          return await response.json();
        }
      } catch (e) { console.error('Failed to fetch status:', e); }
      return null;
    }

    async function startTraining() {
      try {
        const response = await fetch('../api/training/start', { method: 'POST' });
        if (response.ok) {
          session = await response.json();
          trainingState = 'active';
          updateUI();
          startPolling();
          addHistoryItem('Training started', 'start');
        }
      } catch (e) {
        console.error('Failed to start training:', e);
        alert('Failed to start training. Please try again.');
      }
    }

    async function togglePause() {
      const endpoint = trainingState === 'active' ? 'pause' : 'resume';
      try {
        const response = await fetch('../api/training/' + endpoint, { method: 'POST' });
        if (response.ok) {
          trainingState = trainingState === 'active' ? 'paused' : 'active';
          updateUI();
          addHistoryItem('Training ' + (trainingState === 'paused' ? 'paused' : 'resumed'), 'control');
        }
      } catch (e) { console.error('Failed to toggle pause:', e); }
    }

    async function endTraining() {
      if (!confirm('End training session?')) return;
      try {
        const response = await fetch('../api/training/end', { method: 'POST' });
        if (response.ok) {
          session = await response.json();
          trainingState = 'completed';
          stopPolling();
          updateUI();
        }
      } catch (e) { console.error('Failed to end training:', e); }
    }

    async function applyTraining() {
      try {
        const response = await fetch('../api/training/apply', { method: 'POST' });
        if (response.ok) {
          const result = await response.json();
          document.getElementById('result-connections').textContent = result.connectionsCreated;
          document.getElementById('result-updated').textContent = result.connectionsUpdated;
          document.getElementById('result-landmarks').textContent = result.landmarksAdded;
          document.getElementById('result-zones').textContent = result.zonesCreated;
          document.getElementById('results-modal').classList.add('active');
        }
      } catch (e) {
        console.error('Failed to apply training:', e);
        alert('Failed to apply training results.');
      }
    }

    function closeResultsModal() {
      document.getElementById('results-modal').classList.remove('active');
    }

    function openEditor() {
      window.location.href = '../ui/editor';
    }

    function resetTraining() {
      trainingState = 'idle';
      session = null;
      historyItems = [];
      updateUI();
    }

    async function markLandmark() {
      const name = document.getElementById('landmark-name').value.trim();
      if (!name) {
        alert('Please enter a landmark name');
        return;
      }

      const currentCameraId = session?.currentCamera?.id;
      const visibleFromCameras = currentCameraId ? [currentCameraId] : [];

      try {
        const response = await fetch('../api/training/landmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            type: selectedLandmarkType,
            visibleFromCameras,
            position: { x: 50, y: 50 }, // Will be refined when applied
          })
        });
        if (response.ok) {
          document.getElementById('landmark-name').value = '';
          addHistoryItem('Marked: ' + name + ' (' + selectedLandmarkType + ')', 'landmark');
          // Refresh status
          const status = await fetchTrainingStatus();
          if (status) {
            session = status;
            updateStatsUI();
          }
        }
      } catch (e) { console.error('Failed to mark landmark:', e); }
    }

    function selectLandmarkType(type) {
      selectedLandmarkType = type;
      document.querySelectorAll('.mark-type-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
      });
    }

    // Polling
    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async () => {
        const status = await fetchTrainingStatus();
        if (status) {
          session = status;
          updateDetectionUI();
          updateStatsUI();
          updateSuggestionsUI();
        }
      }, 1000);
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (transitInterval) {
        clearInterval(transitInterval);
        transitInterval = null;
      }
    }

    // UI Updates
    function updateUI() {
      // Show/hide content sections
      document.getElementById('idle-content').style.display = trainingState === 'idle' ? 'flex' : 'none';
      document.getElementById('active-content').style.display = (trainingState === 'active' || trainingState === 'paused') ? 'flex' : 'none';
      document.getElementById('completed-content').style.display = trainingState === 'completed' ? 'flex' : 'none';

      // Update status badge
      const badge = document.getElementById('status-badge');
      badge.textContent = trainingState.charAt(0).toUpperCase() + trainingState.slice(1);
      badge.className = 'status-badge ' + trainingState;

      // Update pause button
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.innerHTML = trainingState === 'paused' ? '▶ Resume' : '⏸ Pause';
      }

      // Update completed stats
      if (trainingState === 'completed' && session) {
        document.getElementById('final-cameras').textContent = session.stats?.camerasVisited || 0;
        document.getElementById('final-transits').textContent = session.stats?.transitsRecorded || 0;
        document.getElementById('final-landmarks').textContent = session.stats?.landmarksMarked || 0;
        document.getElementById('final-overlaps').textContent = session.stats?.overlapsDetected || 0;
        document.getElementById('final-avg-transit').textContent = (session.stats?.averageTransitTime || 0) + 's';
        document.getElementById('final-coverage').textContent = (session.stats?.coveragePercentage || 0) + '%';
      }
    }

    function updateDetectionUI() {
      if (!session) return;

      const card = document.getElementById('detection-card');
      const icon = document.getElementById('detection-icon');
      const title = document.getElementById('detection-title');
      const subtitle = document.getElementById('detection-subtitle');
      const confidence = document.getElementById('detection-confidence');
      const transitTimer = document.getElementById('transit-timer');

      if (session.currentCamera) {
        // Detected on a camera
        card.className = 'detection-card detecting';
        icon.textContent = '📷';
        title.textContent = session.currentCamera.name;
        subtitle.textContent = 'You are visible on this camera';
        confidence.textContent = 'Confidence: ' + Math.round(session.currentCamera.confidence * 100) + '%';
        transitTimer.style.display = 'none';

        // Check for new camera detection to add to history
        const lastHistoryCamera = historyItems.find(h => h.type === 'camera');
        if (!lastHistoryCamera || lastHistoryCamera.cameraId !== session.currentCamera.id) {
          addHistoryItem('Detected on: ' + session.currentCamera.name, 'camera', session.currentCamera.id);
        }
      } else if (session.activeTransit) {
        // In transit
        card.className = 'detection-card in-transit';
        icon.textContent = '🚶';
        title.textContent = 'In Transit';
        subtitle.textContent = 'Walking to next camera...';
        confidence.textContent = '';
        transitTimer.style.display = 'flex';
        document.getElementById('transit-from').textContent = 'from ' + session.activeTransit.fromCameraName;

        // Start transit timer if not already running
        if (!transitInterval) {
          transitInterval = setInterval(() => {
            if (session?.activeTransit) {
              document.getElementById('transit-time').textContent = session.activeTransit.elapsedSeconds + 's';
            }
          }, 1000);
        }
      } else {
        // Waiting
        card.className = 'detection-card';
        icon.textContent = '👤';
        title.textContent = 'Waiting for detection...';
        subtitle.textContent = 'Walk to any camera to begin';
        confidence.textContent = '';
        transitTimer.style.display = 'none';

        if (transitInterval) {
          clearInterval(transitInterval);
          transitInterval = null;
        }
      }
    }

    function updateStatsUI() {
      if (!session?.stats) return;

      document.getElementById('stat-cameras').textContent = session.stats.camerasVisited;
      document.getElementById('stat-transits').textContent = session.stats.transitsRecorded;
      document.getElementById('stat-landmarks').textContent = session.stats.landmarksMarked;
      document.getElementById('progress-percent').textContent = session.stats.coveragePercentage + '%';
      document.getElementById('progress-fill').style.width = session.stats.coveragePercentage + '%';
    }

    function updateSuggestionsUI() {
      if (!session?.suggestions || session.suggestions.length === 0) return;

      const list = document.getElementById('suggestions-list');
      list.innerHTML = session.suggestions.map(s =>
        '<div class="suggestion-item">' + s + '</div>'
      ).join('');
    }

    function addHistoryItem(text, type, cameraId) {
      const time = new Date().toLocaleTimeString();
      historyItems.unshift({ text, type, time, cameraId });
      if (historyItems.length > 50) historyItems.pop();

      const list = document.getElementById('history-list');
      document.getElementById('history-count').textContent = historyItems.length + ' events';

      list.innerHTML = historyItems.map(item => {
        let className = '';
        if (item.type === 'camera') className = 'history-item-camera';
        if (item.type === 'transit') className = 'history-item-transit';
        return '<div class="history-item"><span class="' + className + '">' + item.text + '</span>' +
               '<div class="history-item-time">' + item.time + '</div></div>';
      }).join('');
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.toLowerCase() === tabName);
      });
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-' + tabName);
      });
    }

    // Initialize on load
    init();
  </script>
</body>
</html>`;
