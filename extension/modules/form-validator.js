/**
 * Form Validator Module
 * Checks for missing required fields, invalid date formats,
 * and input completeness prior to submission.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  window.ErrorGuard.FormValidator = {
    /**
     * Validates detected fields against portal rules
     * @param {Array<{ field: HTMLElement, semantic: object, value: string }>} detectedFields
     * @param {object} ruleProfile
     * @returns {Array<object>} list of validation issues
     */
    validate(detectedFields, ruleProfile) {
      const issues = [];
      const requiredTypes = ruleProfile.requiredFields || [];
      const foundTypes = new Set();

      for (const item of detectedFields) {
        const { field, semantic, value } = item;
        const sType = semantic ? semantic.type : null;
        if (sType) foundTypes.add(sType);

        // A field is required ONLY if it explicitly carries the HTML `required` attribute.
        // The rule-profile `requiredTypes` is used below only to detect fields missing
        // entirely from the DOM — not to override optional fields that happen to share
        // the same semantic type (e.g. alternatePhone vs primary phone).
        const isRequired = field.hasAttribute('required');

        // Check 1: Missing Required Field
        if (isRequired) {
          if (sType === 'DECLARATION') {
            if (!field.checked) {
              issues.push({
                code: 'REQUIRED_FIELD_MISSING',
                field: sType,
                elementId: field.id,
                severity: 'BLOCKING',
                message: 'Self-declaration checkbox must be confirmed before submitting.',
                fix: 'Read and check the declaration box.'
              });
            }
          } else if (sType === 'FILE_UPLOAD') {
            if (!field.files || field.files.length === 0) {
              issues.push({
                code: 'REQUIRED_FIELD_MISSING',
                field: sType,
                elementId: field.id,
                severity: 'BLOCKING',
                message: 'Supporting certificate document is required.',
                fix: 'Upload your original certificate file (PNG, JPG, or PDF).'
              });
            }
          } else if (!value || value.trim() === '') {
            issues.push({
              code: 'REQUIRED_FIELD_MISSING',
              field: sType || field.name || field.id,
              elementId: field.id,
              severity: 'BLOCKING',
              message: `${semantic ? semantic.label : 'Field'} is required.`,
              fix: `Please enter a value for ${semantic ? semantic.label : 'this field'}.`
            });
          }
        }

        // Check 2: Date Validity
        if (sType === 'DOB' && value && value.trim() !== '') {
          const normDate = window.ErrorGuard.Normalize.date(value);
          if (!normDate) {
            issues.push({
              code: 'INVALID_DATE',
              field: sType,
              elementId: field.id,
              severity: 'BLOCKING',
              message: 'Invalid Date of Birth format. Please enter a valid date (DD/MM/YYYY).',
              fix: 'Correct the date to DD/MM/YYYY or select from the calendar.'
            });
          }
        }

        // Check 3: Mobile Number Format
        if (sType === 'PHONE' && value && value.trim() !== '') {
          const cleanPhone = value.replace(/[\s\-+]/g, '');
          if (!/^\d{10}$/.test(cleanPhone)) {
            issues.push({
              code: 'INVALID_PHONE',
              field: sType,
              elementId: field.id,
              severity: 'WARNING',
              message: 'Mobile number should be a 10-digit number.',
              fix: 'Verify your 10-digit mobile number.'
            });
          }
        }
      }

      // Check missing required semantic fields that weren't even detected in the DOM
      for (const reqType of requiredTypes) {
        if (!foundTypes.has(reqType) && reqType !== 'DECLARATION') {
          issues.push({
            code: 'REQUIRED_FIELD_MISSING',
            field: reqType,
            severity: 'BLOCKING',
            message: `Mandatory field (${reqType}) is missing from the application.`,
            fix: `Provide the missing ${reqType} information.`
          });
        }
      }

      return issues;
    }
  };
})();
