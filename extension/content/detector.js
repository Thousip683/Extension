/**
 * Content Script DOM Detector
 * Discovers and tracks forms, input fields, and file upload controls.
 * Phase 3 of Build Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  window.ErrorGuard.Detector = {
    /**
     * Scans document for forms and relevant fields
     * @returns {{ forms: HTMLElement[], fields: Array<{ field: HTMLElement, semantic: object, value: string }>, submitButtons: HTMLElement[] }}
     */
    scan() {
      const forms = Array.from(document.querySelectorAll('form'));
      const formControls = Array.from(document.querySelectorAll('input, select, textarea'));
      const submitButtons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')).filter(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        return text.includes('submit') || text.includes('apply') || text.includes('proceed') || text.includes('send');
      });

      const detectedFields = [];

      for (const el of formControls) {
        // Skip hidden and non-interactive
        const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
        if (type === 'hidden' || el.style.display === 'none' || el.style.visibility === 'hidden') {
          continue;
        }

        const semantic = window.ErrorGuard.FieldMapper.classify(el);
        const value = type === 'checkbox' ? (el.checked ? 'true' : '') : el.value;

        detectedFields.push({
          field: el,
          semantic,
          value,
          files: el.files || null
        });
      }

      return {
        forms,
        fields: detectedFields,
        submitButtons
      };
    }
  };
})();
