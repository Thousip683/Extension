/**
 * Field Mapper Module
 * Identifies semantic categories for form controls (Full Name, DOB, etc.)
 * based on attributes, labels, and surrounding semantics.
 * Phase 3 of Build Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  const PATTERNS = {
    // FATHER_NAME and MOTHER_NAME must be listed BEFORE FULL_NAME so their
    // higher-specificity regex wins when the label says "Father's Full Name"
    // or "Mother's Full Name" (which both also contain "Full Name").
    FATHER_NAME: {
      regex: /(father[_\-\s]?(name|full|guardian)?|guardian[_\-\s]?name|parent[_\-\s]?name|husband[_\-\s]?name)/i,
      autocomplete: [],
      types: ['text']
    },
    MOTHER_NAME: {
      regex: /(mother[_\-\s]?(name|full)?|maternal[_\-\s]?name)/i,
      autocomplete: [],
      types: ['text']
    },
    FULL_NAME: {
      regex: /(full[_\-\s]?name|applicant[_\-\s]?name|candidate[_\-\s]?name|student[_\-\s]?name|^name$)/i,
      autocomplete: ['name'],
      types: ['text']
    },
    DOB: {
      regex: /(date[_\-\s]?of[_\-\s]?birth|birth[_\-\s]?date|^dob$)/i,
      autocomplete: ['bday'],
      types: ['date', 'text']
    },
    CERTIFICATE_NUMBER: {
      regex: /(certificate[_\-\s]?(no|num|number)|income[_\-\s]?cert|caste[_\-\s]?cert|roll[_\-\s]?no|reg[_\-\s]?(no|num|number)|id[_\-\s]?number)/i,
      autocomplete: [],
      types: ['text']
    },
    AADHAAR_NUMBER: {
      regex: /(aadhaar|aadhar|uidai|uid[_\-\s]?(no|num|number)|uid)/i,
      autocomplete: [],
      types: ['text', 'tel', 'number']
    },
    PAN_NUMBER: {
      regex: /(pan[_\-\s]?(no|num|number|card)|tax[_\-\s]?id)/i,
      autocomplete: [],
      types: ['text']
    },
    CATEGORY: {
      regex: /(category|community|caste|social[_\-\s]?status)/i,
      autocomplete: [],
      types: ['select-one', 'text']
    },
    GENDER: {
      regex: /(gender|sex)/i,
      autocomplete: ['sex'],
      types: ['select-one', 'text']
    },
    EMAIL: {
      regex: /(email|mail|e[_\-\s]?mail)/i,
      autocomplete: ['email'],
      types: ['email', 'text']
    },
    PHONE: {
      regex: /(phone|mobile|contact|telephone|cell)/i,
      autocomplete: ['tel'],
      types: ['tel', 'text', 'number']
    },
    FILE_UPLOAD: {
      regex: /(upload|certificate|document|file|attachment|photo|scan)/i,
      autocomplete: [],
      types: ['file']
    },
    DECLARATION: {
      regex: /(declaration|declare|confirm|agree|terms|consent)/i,
      autocomplete: [],
      types: ['checkbox']
    },
    BANK_ACCOUNT: {
      regex: /(bank[_\-\s]?account|acc[_\-\s]?(no|num|number)|account[_\-\s]?(no|num|number)|dbt[_\-\s]?bank)/i,
      autocomplete: [],
      types: ['text', 'number', 'tel']
    },
    IFSC_CODE: {
      regex: /(ifsc[_\-\s]?(code)?|branch[_\-\s]?code)/i,
      autocomplete: [],
      types: ['text']
    },
    PINCODE: {
      regex: /(pin[_\-\s]?code|postal[_\-\s]?code|^pincode$|^zip$)/i,
      autocomplete: ['postal-code'],
      types: ['text', 'number']
    }
  };

  window.ErrorGuard.FieldMapper = {
    /**
     * Inspects an HTML element and maps it to a canonical semantic type
     * @param {HTMLElement} element
     * @returns {{ type: string, confidence: number, label: string }}
     */
    classify(element) {
      if (!element) return null;

      const type = (element.getAttribute('type') || element.tagName.toLowerCase()).toLowerCase();
      const id = element.id || '';
      const name = element.name || '';
      const placeholder = element.getAttribute('placeholder') || '';
      const autocomplete = element.getAttribute('autocomplete') || '';
      const ariaLabel = element.getAttribute('aria-label') || '';

      // Find associated label text
      let labelText = '';
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) labelText = labelEl.textContent.trim();
      }
      if (!labelText) {
        const parentLabel = element.closest('label');
        if (parentLabel) labelText = parentLabel.textContent.trim();
      }

      // Check special element types first
      if (type === 'file') {
        return {
          type: 'FILE_UPLOAD',
          confidence: 1.0,
          label: labelText || name || id || 'Upload File'
        };
      }

      if (type === 'checkbox') {
        if (PATTERNS.DECLARATION.regex.test(`${name} ${id} ${labelText}`)) {
          return {
            type: 'DECLARATION',
            confidence: 0.95,
            label: labelText || 'Declaration'
          };
        }
      }

      // String buffer containing all semantic clues
      const semanticContext = `${name} ${id} ${placeholder} ${labelText} ${ariaLabel}`;

      let bestMatch = null;
      let highestScore = 0;

      for (const [canonicalType, config] of Object.entries(PATTERNS)) {
        let score = 0;

        // Autocomplete match is very high confidence
        if (autocomplete && config.autocomplete.includes(autocomplete.toLowerCase())) {
          score += 0.8;
        }

        // Regex match on attributes/label
        if (config.regex.test(semanticContext)) {
          score += 0.6;
        }

        // Matching expected input type adds confidence
        if (config.types.includes(type)) {
          score += 0.2;
        }

        if (score > highestScore && score >= 0.5) {
          highestScore = score;
          bestMatch = {
            type: canonicalType,
            confidence: Math.min(0.99, score),
            label: labelText || name || id || canonicalType
          };
        }
      }

      return bestMatch;
    }
  };
})();
