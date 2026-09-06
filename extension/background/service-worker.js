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
});
