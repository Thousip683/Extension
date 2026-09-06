/**
 * Normalization Utilities
 * Prepares text, dates, and identifiers for robust cross-verification
 * as specified in Phase 9 of the Implementation Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  const MONTH_NAMES = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  window.ErrorGuard.Normalize = {
    /**
     * Normalizes names/general strings:
     * - collapses multiple spaces
     * - lowercases
     * - removes special punctuation
     */
    text(str) {
      if (!str || typeof str !== 'string') return '';
      return str
        .toLowerCase()
        .normalize('NFD') // decompose accents
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    /**
     * Formats string to Title Case for UI display
     */
    titleCase(str) {
      if (!str || typeof str !== 'string') return '';
      return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    },

    /**
     * Normalizes alphanumeric IDs (Certificate numbers, Aadhaar, Application IDs)
     */
    identifier(id) {
      if (!id || typeof id !== 'string') return '';
      return id.toUpperCase().replace(/[\s\-_/.]/g, '').trim();
    },

    /**
     * Normalizes dates from various formats (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY)
     * to canonical format: YYYY-MM-DD
     */
    date(dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const clean = dateStr.trim();

      // Format: YYYY-MM-DD (Standard HTML5 date input)
      const isoMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
      if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = parseInt(isoMatch[2], 10);
        const d = parseInt(isoMatch[3], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }

      // Format: DD/MM/YYYY or DD-MM-YYYY (Common in Indian official forms and certificates)
      const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmyMatch) {
        const d = parseInt(dmyMatch[1], 10);
        const m = parseInt(dmyMatch[2], 10);
        const y = parseInt(dmyMatch[3], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }

      // Format: DD Month YYYY (e.g. 12 May 2005)
      const textDateMatch = clean.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
      if (textDateMatch) {
        const d = parseInt(textDateMatch[1], 10);
        const monthKey = textDateMatch[2].toLowerCase();
        const y = parseInt(textDateMatch[3], 10);
        const m = MONTH_NAMES[monthKey];
        if (m && d >= 1 && d <= 31) {
          return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }

      return null;
    },

    /**
     * Formats canonical YYYY-MM-DD back to user-friendly DD/MM/YYYY
     */
    formatDateDisplay(isoDate) {
      if (!isoDate || typeof isoDate !== 'string') return '';
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return isoDate;
    }
  };
})();
