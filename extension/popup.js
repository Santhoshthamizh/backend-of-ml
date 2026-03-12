/* ═══════════════════════════════════════════════════════
   popup.js — Fake Job Detector Chrome Extension
═══════════════════════════════════════════════════════ */

// Backend URL — change to your deployed API URL if not running locally
const API_BASE = 'http://127.0.0.1:8000';

// Named constants
const HISTORY_LIMIT      = 50;
const HEALTH_TIMEOUT_MS  = 5000;
const PREDICT_TIMEOUT_MS = 20000;
const PDF_PRINT_DELAY_MS = 800; // wait for tab to fully load before triggering print
const REPORT_EMAIL       = 'support@fakejobdetector.example.com';

/* ── DOM refs ─────────────────────────────────────────── */
const scanBtn          = document.getElementById('scanBtn');
const scanBtnText      = document.getElementById('scanBtnText');
const scanStatus       = document.getElementById('scanStatus');
const statusDot        = document.getElementById('statusDot');
const statusLabel      = document.getElementById('statusLabel');
const lastScanEl       = document.getElementById('lastScan');
const resultsEl        = document.getElementById('results');

// Fraud + gauge
const fraudValue       = document.getElementById('fraudValue');
const riskBadge        = document.getElementById('riskBadge');
const gaugeArc         = document.getElementById('gaugeArc');
const gaugeNeedle      = document.getElementById('gaugeNeedle');
const gaugeScore       = document.getElementById('gaugeScore');

// Stat cards
const statConfidence   = document.getElementById('statConfidence');
const statSuspicious   = document.getElementById('statSuspicious');
const statMissing      = document.getElementById('statMissing');
const statSalary       = document.getElementById('statSalary');
const statDomain       = document.getElementById('statDomain');
const statCompany      = document.getElementById('statCompany');
const statSimilar      = document.getElementById('statSimilar');

// Timeline
const timelineBars     = document.getElementById('timelineBars');

// Explanation
const explanationToggle = document.getElementById('explanationToggle');
const explanationBody   = document.getElementById('explanationBody');
const explanationText   = document.getElementById('explanationText');
const chevron           = document.getElementById('chevron');

// Action buttons
const actionReport  = document.getElementById('actionReport');
const actionSave    = document.getElementById('actionSave');
const actionHistory = document.getElementById('actionHistory');
const actionShare   = document.getElementById('actionShare');
const actionPdf     = document.getElementById('actionPdf');

// History panel
const historyPanel  = document.getElementById('historyPanel');
const historyClose  = document.getElementById('historyClose');
const historyList   = document.getElementById('historyList');

/* ── State ────────────────────────────────────────────── */
let lastResult = null;
let lastJobData = null;

/* ═══════════════════════════════════════════════════════
   Initialisation
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  checkAPIConnection();
  loadLastScanTime();
  bindEvents();
});

/* ── Check backend connectivity ───────────────────────── */
async function checkAPIConnection() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.ok) {
      setStatus('connected', 'Connected');
    } else {
      setStatus('error', 'API Error');
    }
  } catch (_) {
    setStatus('error', 'Offline');
  }
}

function setStatus(state, label) {
  statusDot.className = 'status-dot ' + state;
  statusLabel.textContent = label;
}

function loadLastScanTime() {
  chrome.storage.local.get(['lastScanTime'], (data) => {
    if (data.lastScanTime) {
      lastScanEl.textContent = 'Last: ' + data.lastScanTime;
    }
  });
}

/* ── Bind events ─────────────────────────────────────── */
function bindEvents() {
  scanBtn.addEventListener('click', handleScan);

  explanationToggle.addEventListener('click', () => {
    const open = explanationBody.style.display !== 'none';
    explanationBody.style.display = open ? 'none' : 'block';
    chevron.classList.toggle('open', !open);
  });

  actionSave.addEventListener('click', saveCurrentResult);
  actionHistory.addEventListener('click', showHistory);
  actionShare.addEventListener('click', shareResult);
  actionReport.addEventListener('click', reportJob);
  actionPdf.addEventListener('click', generatePDF);
  historyClose.addEventListener('click', () => {
    historyPanel.style.display = 'none';
  });
}

/* ═══════════════════════════════════════════════════════
   Scan Flow
═══════════════════════════════════════════════════════ */
async function handleScan() {
  setScanningState(true);
  removeErrorBanner();

  try {
    // 1. Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');

    // 2. Inject content script if needed (for pages not in manifest matches)
    let jobData = null;
    try {
      jobData = await sendMessageToTab(tab.id, { action: 'extractJobData' });
    } catch (_) {
      // Content script may not be injected; try scripting API
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        jobData = await sendMessageToTab(tab.id, { action: 'extractJobData' });
      } catch (injErr) {
        throw new Error('Cannot extract data from this page. Please open a job listing first.');
      }
    }

    if (!jobData || !jobData.success) {
      throw new Error(
        (jobData && jobData.error) ||
        'Could not find job details on this page. Please open a job listing.'
      );
    }

    lastJobData = jobData;
    setScanStatus('Analyzing job posting…');

    // 3. Call backend
    const prediction = await callPredictAPI(jobData);

    // 4. Update UI
    updateUI(prediction);
    lastResult = { ...prediction, jobData };

    // 5. Persist scan time
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chrome.storage.local.set({ lastScanTime: timeStr });
    lastScanEl.textContent = 'Last: ' + timeStr;

  } catch (err) {
    showErrorBanner(err.message || 'An unexpected error occurred.');
    console.error('[FJD] Scan error:', err);
  } finally {
    setScanningState(false);
    setScanStatus('');
  }
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function callPredictAPI(jobData) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:       jobData.title       || 'Unknown Title',
      description: jobData.description || '',
      company:     jobData.company     || '',
    }),
    signal: AbortSignal.timeout(PREDICT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  return res.json();
}

/* ── Scanning state helpers ──────────────────────────── */
function setScanningState(scanning) {
  scanBtn.disabled = scanning;
  if (scanning) {
    scanBtnText.textContent = 'Scanning…';
    scanBtn.innerHTML = `
      <span class="spinner"></span>
      <span>Scanning…</span>
    `;
  } else {
    scanBtn.innerHTML = `
      <svg class="scan-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span id="scanBtnText">Scan This Job</span>
    `;
  }
}

function setScanStatus(msg) {
  scanStatus.textContent = msg;
}

function showErrorBanner(msg) {
  removeErrorBanner();
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.id = 'errorBanner';
  div.textContent = msg;
  scanStatus.after(div);
}

function removeErrorBanner() {
  const existing = document.getElementById('errorBanner');
  if (existing) existing.remove();
}

/* ═══════════════════════════════════════════════════════
   UI Update
═══════════════════════════════════════════════════════ */
function updateUI(data) {
  const {
    fraud_probability = 0,
    risk_level = 'Unknown',
    trust_score = 0,
    confidence = 0,
    suspicious_words = 0,
    missing_details = 0,
    salary_pattern = 'Unknown',
    domain_trust = 0,
    company_verified = false,
    similar_cases = 0,
    timeline = [],
    explanation = '',
  } = data;

  /* ── Fraud probability ───────── */
  const pct = Math.round(fraud_probability * 100);
  fraudValue.textContent = pct + '%';

  const riskClass = getRiskClass(risk_level);
  fraudValue.className = 'fraud-value ' + riskClass;
  riskBadge.textContent = risk_level;
  riskBadge.className = 'risk-badge ' + riskClass;

  /* ── Trust Score gauge ────────── */
  updateGauge(trust_score);

  /* ── Stat cards ──────────────── */
  statConfidence.textContent = Math.round(confidence * 100) + '%';
  statSuspicious.textContent = suspicious_words;
  statMissing.textContent    = missing_details;

  const salaryNormal = (salary_pattern || '').toLowerCase().includes('normal');
  statSalary.textContent  = salary_pattern || 'Unknown';
  statSalary.className    = 'stat-value ' + (salaryNormal ? 'green' : 'red');

  statDomain.textContent  = domain_trust + '/100';

  const verified = !!company_verified;
  statCompany.textContent = verified ? 'Yes ✓' : 'No ✗';
  statCompany.className   = 'stat-value ' + (verified ? 'green' : 'red');

  statSimilar.textContent = similar_cases + ' found';

  /* ── Risk timeline ───────────── */
  updateTimeline(timeline);

  /* ── Explanation ─────────────── */
  explanationText.textContent = explanation || 'No explanation provided.';

  /* ── Show results ────────────── */
  resultsEl.style.display = 'flex';
}

/* ── Gauge ────────────────────────────────────────────── */
function updateGauge(score) {
  // Arc total length for "M10 65 A50 50 0 0 1 110 65" is ~157px
  const arcLength = 157;
  const clampedScore = Math.min(100, Math.max(0, score));
  const dashLen = (clampedScore / 100) * arcLength;

  gaugeArc.setAttribute('stroke-dasharray', `${dashLen} ${arcLength}`);
  gaugeScore.textContent = clampedScore;

  // Needle: 0 = left (−90°), 100 = right (90°) relative to bottom center
  // angle in degrees from vertical: maps 0→-90, 100→+90
  const angleDeg = -90 + (clampedScore / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  // pivot at (60,65), length 40
  const nx = 60 + 40 * Math.sin(angleRad);
  const ny = 65 - 40 * Math.cos(angleRad);
  gaugeNeedle.setAttribute('x2', nx.toFixed(1));
  gaugeNeedle.setAttribute('y2', ny.toFixed(1));
}

/* ── Risk Timeline ────────────────────────────────────── */
function updateTimeline(values) {
  timelineBars.innerHTML = '';
  const arr = Array.isArray(values) ? values.slice(0, 7) : [];

  // Pad to 7
  while (arr.length < 7) arr.push(0);

  const maxVal = Math.max(...arr, 1);

  arr.forEach((v) => {
    const pct = Math.round((v / maxVal) * 100);
    const bar = document.createElement('div');
    bar.className = 't-bar ' + timelineColor(v, maxVal);
    bar.style.height = Math.max(6, pct) + '%';
    timelineBars.appendChild(bar);
  });
}

function timelineColor(value, max) {
  const ratio = value / max;
  if (ratio >= 0.66) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

/* ── Risk class helper ─────────────────────────────────── */
function getRiskClass(riskLevel) {
  const r = (riskLevel || '').toLowerCase();
  if (r.includes('high'))   return 'high';
  if (r.includes('medium') || r.includes('moderate')) return 'medium';
  if (r.includes('safe') || r.includes('low'))  return 'safe';
  return ''; // neutral/unknown — no special color
}

/* ═══════════════════════════════════════════════════════
   Action Buttons
═══════════════════════════════════════════════════════ */

/* Save ─────────────────────────────────────────────────── */
function saveCurrentResult() {
  if (!lastResult) { alert('No scan result to save.'); return; }

  chrome.storage.local.get(['scanHistory'], (data) => {
    const history = data.scanHistory || [];
    const entry = {
      id:          Date.now(),
      title:       lastJobData ? lastJobData.title : 'Unknown',
      company:     lastJobData ? lastJobData.company : 'Unknown',
      url:         lastJobData ? lastJobData.url : '',
      riskLevel:   lastResult.risk_level || 'Unknown',
      fraudPct:    Math.round((lastResult.fraud_probability || 0) * 100),
      savedAt:     new Date().toLocaleString(),
    };
    history.unshift(entry);
    // Keep only last 50
    chrome.storage.local.set({ scanHistory: history.slice(0, HISTORY_LIMIT) }, () => {
      setScanStatus('✓ Saved to history');
      setTimeout(() => setScanStatus(''), 2000);
    });
  });
}

/* History ──────────────────────────────────────────────── */
function showHistory() {
  chrome.storage.local.get(['scanHistory'], (data) => {
    const history = data.scanHistory || [];
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<p class="history-empty">No scans saved yet.</p>';
    } else {
      history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div class="history-item-title">${escHtml(item.title || 'Unknown Job')}</div>
          <div class="history-item-meta">
            <span>${escHtml(item.company || '')}</span>
            <span class="${getRiskClass(item.riskLevel)}">${item.fraudPct}% – ${item.riskLevel}</span>
          </div>
          <div class="history-item-meta"><span>${item.savedAt}</span></div>
        `;
        if (item.url) {
          div.style.cursor = 'pointer';
          div.title = 'Click to open job page';
          div.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
        }
        historyList.appendChild(div);
      });
    }

    historyPanel.style.display = 'flex';
  });
}

/* Share ─────────────────────────────────────────────────── */
function shareResult() {
  if (!lastResult) { alert('No scan result to share.'); return; }
  const pct  = Math.round((lastResult.fraud_probability || 0) * 100);
  const risk = lastResult.risk_level || 'Unknown';
  const title = lastJobData ? lastJobData.title : 'this job';
  const text  = `🔍 Fake Job Detector Result\n"${title}"\nFraud Probability: ${pct}%\nRisk Level: ${risk}\n\nScanned with Fake Job Detector Chrome Extension.`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      setScanStatus('✓ Copied to clipboard');
      setTimeout(() => setScanStatus(''), 2000);
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  setScanStatus('✓ Copied to clipboard');
  setTimeout(() => setScanStatus(''), 2000);
}

/* Report ────────────────────────────────────────────────── */
function reportJob() {
  if (!lastJobData) { alert('No job scanned yet.'); return; }
  const url = lastJobData.url || '';
  const mailBody = encodeURIComponent(
    `I'd like to report a potentially fraudulent job posting.\n\nURL: ${url}\nJob Title: ${lastJobData.title}\nCompany: ${lastJobData.company}\n\nAI Risk Analysis:\nFraud Probability: ${Math.round((lastResult.fraud_probability || 0) * 100)}%\nRisk Level: ${lastResult.risk_level}`
  );
  chrome.tabs.create({ url: `mailto:${REPORT_EMAIL}?subject=Fake%20Job%20Report&body=${mailBody}` });
}

/* PDF ───────────────────────────────────────────────────── */
function generatePDF() {
  if (!lastResult || !lastJobData) { alert('No scan result to export.'); return; }

  const pct   = Math.round((lastResult.fraud_probability || 0) * 100);
  const trust = lastResult.trust_score || 0;
  const risk  = lastResult.risk_level  || 'Unknown';
  const now   = new Date().toLocaleString();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Fake Job Detector Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #222; padding: 32px; }
    h1   { color: #7c3aed; font-size: 22px; margin-bottom: 4px; }
    h2   { font-size: 15px; color: #555; margin-top: 20px; }
    .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px;
             background:${pct >= 60 ? '#fee2e2' : pct >= 30 ? '#fef9c3' : '#dcfce7'};
             color:${pct >= 60 ? '#b91c1c' : pct >= 30 ? '#92400e' : '#166534'}; }
    table { border-collapse:collapse; width:100%; margin-top:12px; font-size:13px; }
    th,td { border:1px solid #ddd; padding:7px 10px; text-align:left; }
    th    { background:#f3f4f6; }
    .footer { margin-top:24px; font-size:11px; color:#999; }
  </style>
</head>
<body>
  <h1>🔍 Fake Job Detector – AI Risk Report</h1>
  <p>Generated: ${now}</p>

  <h2>Job Details</h2>
  <table>
    <tr><th>Title</th><td>${escHtml(lastJobData.title || 'N/A')}</td></tr>
    <tr><th>Company</th><td>${escHtml(lastJobData.company || 'N/A')}</td></tr>
    <tr><th>URL</th><td>${escHtml(lastJobData.url || 'N/A')}</td></tr>
  </table>

  <h2>Risk Summary</h2>
  <table>
    <tr><th>Fraud Probability</th><td>${pct}% <span class="badge">${risk}</span></td></tr>
    <tr><th>Trust Score</th><td>${trust} / 100</td></tr>
    <tr><th>Confidence</th><td>${Math.round((lastResult.confidence || 0) * 100)}%</td></tr>
    <tr><th>Suspicious Words</th><td>${lastResult.suspicious_words || 0}</td></tr>
    <tr><th>Missing Details</th><td>${lastResult.missing_details || 0}</td></tr>
    <tr><th>Salary Pattern</th><td>${lastResult.salary_pattern || 'N/A'}</td></tr>
    <tr><th>Domain Trust</th><td>${lastResult.domain_trust || 0} / 100</td></tr>
    <tr><th>Company Verified</th><td>${lastResult.company_verified ? 'Yes' : 'No'}</td></tr>
    <tr><th>Similar Fraud Cases</th><td>${lastResult.similar_cases || 0}</td></tr>
  </table>

  <h2>AI Explanation</h2>
  <p>${escHtml(lastResult.explanation || 'No explanation available.')}</p>

  <p class="footer">Generated by Fake Job Detector Chrome Extension. For informational purposes only.</p>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  chrome.tabs.create({ url }, (tab) => {
    // Give the tab time to load then trigger print dialog
    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.print(),
      });
    }, PDF_PRINT_DELAY_MS);
  });
}

/* ═══════════════════════════════════════════════════════
   Utility
═══════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
