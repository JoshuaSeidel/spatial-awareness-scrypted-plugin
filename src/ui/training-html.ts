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
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: rgba(0,0,0,0.3);
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-badge.idle { background: #6b7280; }
    .status-badge.active { background: #10b981; animation: pulse 2s infinite; }
    .status-badge.paused { background: #f59e0b; }
    .status-badge.completed { background: #3b82f6; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

    /* Main content area */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 15px;
      overflow-y: auto;
      gap: 15px;
    }

    /* Camera detection card */
    .detection-card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 20px;
      border: 2px solid rgba(255,255,255,0.1);
      transition: all 0.3s;
    }
    .detection-card.detecting {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.15);
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.3);
    }
    .detection-card.in-transit {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.15);
    }

    .detection-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 15px;
      font-size: 36px;
    }
    .detection-card.detecting .detection-icon {
      background: #10b981;
      animation: detectPulse 1.5s infinite;
    }
    @keyframes detectPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
      50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(16, 185, 129, 0); }
    }

    .detection-title {
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
    }
    .detection-subtitle {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      text-align: center;
    }
    .detection-confidence {
      margin-top: 10px;
      text-align: center;
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }

    /* Transit timer */
    .transit-timer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 15px;
      padding: 12px;
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
    }
    .transit-timer-icon { font-size: 20px; }
    .transit-timer-text { font-size: 18px; font-weight: 600; }
    .transit-timer-from { font-size: 13px; color: rgba(255,255,255,0.6); }

    /* Stats grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .stat-item {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 15px 10px;
      text-align: center;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #10b981;
    }
    .stat-label {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      margin-top: 4px;
    }

    /* Progress bar */
    .progress-section {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 15px;
    }
    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #3b82f6);
      border-radius: 4px;
      transition: width 0.5s;
    }

    /* Suggestions */
    .suggestions-section {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
      padding: 15px;
    }
    .suggestions-title {
      font-size: 12px;
      text-transform: uppercase;
      color: #3b82f6;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .suggestion-item {
      font-size: 15px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item::before {
      content: "→ ";
      color: #3b82f6;
    }

    /* Action buttons */
    .action-buttons {
      display: flex;
      gap: 10px;
      padding: 10px 0;
    }
    .btn {
      flex: 1;
      padding: 18px 20px;
      border: none;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: #10b981; color: #fff; }
    .btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-warning { background: #f59e0b; color: #000; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Full-width button */
    .btn-full { flex: none; width: 100%; }

    /* Mark landmark/structure panel */
    .mark-panel {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 20px;
    }
    .mark-panel-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 15px;
    }
    .mark-type-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 15px;
    }
    .mark-type-btn {
      padding: 12px 8px;
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      background: transparent;
      color: #fff;
      font-size: 11px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mark-type-btn.selected {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.2);
    }
    .mark-type-btn .icon { font-size: 20px; margin-bottom: 4px; display: block; }

    /* Input field */
    .input-group { margin-bottom: 15px; }
    .input-group label {
      display: block;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 6px;
    }
    .input-group input {
      width: 100%;
      padding: 14px;
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      background: rgba(0,0,0,0.2);
      color: #fff;
      font-size: 16px;
    }
    .input-group input:focus {
      outline: none;
      border-color: #10b981;
    }

    /* History list */
    .history-section {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 15px;
      max-height: 200px;
      overflow-y: auto;
    }
    .history-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }
    .history-item {
      padding: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 14px;
    }
    .history-item:last-child { border-bottom: none; }
    .history-item-time {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
    }
    .history-item-camera { color: #10b981; font-weight: 600; }
    .history-item-transit { color: #f59e0b; }

    /* Bottom action bar */
    .bottom-bar {
      background: rgba(0,0,0,0.3);
      padding: 15px 20px;
      padding-bottom: max(15px, env(safe-area-inset-bottom));
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    /* Tabs */
    .tabs {
      display: flex;
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
      padding: 4px;
      margin-bottom: 15px;
    }
    .tab {
      flex: 1;
      padding: 12px;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .tab.active {
      background: rgba(255,255,255,0.1);
      color: #fff;
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
      background: rgba(0,0,0,0.8);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-overlay.active { display: flex; }
    .modal {
      background: #16213e;
      border-radius: 16px;
      padding: 25px;
      max-width: 400px;
      width: 100%;
    }
    .modal h2 { font-size: 20px; margin-bottom: 15px; }
    .modal-result-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .modal-result-value { color: #10b981; font-weight: 600; }
    .modal-buttons { display: flex; gap: 10px; margin-top: 20px; }

    /* Idle state */
    .idle-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 20px;
    }
    .idle-icon {
      font-size: 80px;
      margin-bottom: 20px;
      opacity: 0.8;
    }
    .idle-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .idle-desc {
      font-size: 16px;
      color: rgba(255,255,255,0.6);
      max-width: 300px;
      line-height: 1.5;
    }
    .idle-instructions {
      margin-top: 30px;
      text-align: left;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
    }
    .idle-instructions h3 {
      font-size: 14px;
      margin-bottom: 12px;
      color: #3b82f6;
    }
    .idle-instructions ol {
      padding-left: 20px;
      font-size: 14px;
      line-height: 2;
      color: rgba(255,255,255,0.8);
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
