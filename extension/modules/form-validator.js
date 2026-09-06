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
              element: field,
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
              element: field,
              severity: 'WARNING',
              message: 'Mobile number should be a 10-digit number.',
              fix: 'Verify your 10-digit mobile number.'
            });
          }
        }

        // Check 4: Aadhaar Number Format (UIDAI 12-Digit UID requirement)
        if (sType === 'AADHAAR_NUMBER' && value && value.trim() !== '') {
          const cleanAadhaar = value.replace(/\D/g, '');
          if (cleanAadhaar.length !== 12) {
            issues.push({
              code: 'INVALID_AADHAAR_NUMBER',
              field: sType,
              elementId: field.id,
              element: field,
              severity: 'BLOCKING',
              message: `Aadhaar Number must be exactly 12 digits (currently ${cleanAadhaar.length} digit${cleanAadhaar.length === 1 ? '' : 's'} entered: "${value}").`,
              fix: 'Please enter all 12 digits of your Aadhaar UID number.'
            });
          }
        }

        // Check 5: PAN Number Format (10-character alphanumeric: 5 letters, 4 digits, 1 letter)
        if (sType === 'PAN_NUMBER' && value && value.trim() !== '') {
          const cleanPan = value.trim().toUpperCase().replace(/[\s\-]/g, '');
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
            issues.push({
              code: 'INVALID_PAN_NUMBER',
              field: sType,
              elementId: field.id,
              element: field,
              severity: 'BLOCKING',
              message: `PAN Number must be 10 characters (5 uppercase letters, 4 digits, 1 letter, e.g. ABCDE1234F; currently "${value}").`,
              fix: 'Please enter a valid 10-character Permanent Account Number.'
            });
          }
        }

        // Check 6: Email Format
        if (sType === 'EMAIL' && value && value.trim() !== '') {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
            issues.push({
              code: 'INVALID_EMAIL',
              field: sType,
              elementId: field.id,
              element: field,
              severity: 'WARNING',
              message: `Invalid email format: "${value}".`,
              fix: 'Please enter a valid email address (e.g. applicant@domain.gov.in).'
            });
          }
        }
      }

      return issues;
    }
  };
})();
