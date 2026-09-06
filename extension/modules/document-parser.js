/**
 * Document Parser Module
 * Parses raw OCR text into structured application fields (Name, DOB, Cert No).
 * Phase 8 of Build Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  window.ErrorGuard.DocumentParser = {
    /**
     * Parses OCR text into structured fields
     * @param {string} ocrText
     * @returns {{ name: string|null, dob: string|null, certificateNo: string|null, raw: string }}
     */
    parse(ocrText) {
      if (!ocrText || typeof ocrText !== 'string') {
        return { name: null, dob: null, certificateNo: null, raw: '' };
      }

      const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
      let name = null;
      let dob = null;
      let certificateNo = null;

      for (const line of lines) {
        // Match Name
        if (!name) {
          const nameMatch = line.match(/(?:full\s*name|applicant\s*name|candidate\s*name|^name)\s*[:=\-]\s*([A-Za-z\s.]+)/i);
          if (nameMatch && nameMatch[1]) {
            const candidate = nameMatch[1].trim();
            if (candidate.length > 2 && !/department|government|certificate/i.test(candidate)) {
              name = candidate;
            }
          }
        }

        // Match DOB
        if (!dob) {
          const dobMatch = line.match(/(?:date\s*of\s*birth|birth\s*date|^dob)\s*[:=\-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}|[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2})/i);
          if (dobMatch && dobMatch[1]) {
            dob = dobMatch[1].trim();
          }
        }

        // Match Certificate Number
        if (!certificateNo) {
          const certMatch = line.match(/(?:certificate\s*(?:no|number)|cert\s*no|reg\s*no)\s*[:=\-]\s*([A-Za-z0-9\-_]+)/i);
          if (certMatch && certMatch[1]) {
            certificateNo = certMatch[1].trim();
          }
        }
      }

      return {
        name,
        dob,
        certificateNo,
        raw: ocrText
      };
    }
  };
})();
