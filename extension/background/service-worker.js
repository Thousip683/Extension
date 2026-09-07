/**
 * Background Service Worker
 * Manages extension lifecycle and coordinates communication between popup and active tab.
 */

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ErrorGuard::Background] Pre-Submission Error Guard Extension installed successfully.', details.reason);
});

// Relay message from popup to active tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'TAB' && message.action) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse(null);
      }
    });
    return true; // Keep message channel open for asynchronous response
  }

  // Relay backend API requests so they bypass webpage CORS/Private Network restrictions
  if (message.action === 'FETCH_BACKEND') {
    const { url, method, headers, body } = message;
    fetch(url, {
      method: method || 'GET',
      headers: headers || { 'Content-Type': 'application/json' },
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) { data = text; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }
});
