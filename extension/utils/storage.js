/**
 * Storage Wrapper for Chrome Extension
 * Provides unified interface to chrome.storage.local
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  window.ErrorGuard.Storage = {
    async set(key, value) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [key]: value }, resolve);
        } else {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {}
          resolve();
        }
      });
    },

    async get(key) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([key], (result) => {
            resolve(result ? result[key] : null);
          });
        } else {
          try {
            const val = localStorage.getItem(key);
            resolve(val ? JSON.parse(val) : null);
          } catch (e) {
            resolve(null);
          }
        }
      });
    },

    async remove(key) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove([key], resolve);
        } else {
          try {
            localStorage.removeItem(key);
          } catch (e) {}
          resolve();
        }
      });
    },

    // ─── Dedicated Google API Key Management ───
    async getGoogleApiKey() {
      return (await this.get('google_gemini_api_key')) || '';
    },

    async setGoogleApiKey(key) {
      return await this.set('google_gemini_api_key', (key || '').trim());
    },

    async removeGoogleApiKey() {
      return await this.remove('google_gemini_api_key');
    }
  };
})();
