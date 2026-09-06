/**
 * Storage Wrapper for Chrome Extension
 * Provides unified interface to chrome.storage.local
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  window.ErrorGuard.Storage = {
    _isContextValid() {
      try {
        // Accessing chrome.runtime.id throws if the context is invalidated
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && !!chrome.runtime.id;
      } catch (e) {
        return false;
      }
    },

    async set(key, value) {
      return new Promise((resolve) => {
        if (this._isContextValid()) {
          try {
            chrome.storage.local.set({ [key]: value }, resolve);
          } catch (e) {
            resolve(); // context invalidated mid-call
          }
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
        if (this._isContextValid()) {
          try {
            chrome.storage.local.get([key], (result) => {
              resolve(result ? result[key] : null);
            });
          } catch (e) {
            resolve(null);
          }
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
        if (this._isContextValid()) {
          try {
            chrome.storage.local.remove([key], resolve);
          } catch (e) {
            resolve();
          }
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
    },

    // ─── Extension Mode Management ───
    // false = Manual Guard (default), true = AI Auto-Fill
    async getAiAutoFillMode() {
      const val = await this.get('EG_AI_AUTOFILL_MODE');
      return val === true;
    },

    async setAiAutoFillMode(enabled) {
      return await this.set('EG_AI_AUTOFILL_MODE', !!enabled);
    }
  };
})();
