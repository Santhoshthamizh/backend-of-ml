/* ═══════════════════════════════════════════════════════
   background.js — Service Worker for Fake Job Detector
═══════════════════════════════════════════════════════ */

// Backend URL — keep in sync with popup.js (shared constants not available in MV3 service workers)
// Change to your deployed API URL if not running locally.
const API_BASE = 'http://127.0.0.1:8000';

/* Keep service worker alive by responding to messages */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FJD] Extension installed.');
});

/* Relay messages between popup and content script if needed */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }

  if (message.action === 'checkHealth') {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
});
