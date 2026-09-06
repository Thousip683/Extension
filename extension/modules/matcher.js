/**
 * Cross-Verification Matcher Module
 * Compares form values against document-extracted values using
 * string normalization, Levenshtein distance, and canonical dates.
 * Phase 9 of Build Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  /**
   * Calculates Levenshtein edit distance between two strings
   */
  function levenshteinDistance(s1, s2) {
    const a = s1 || '';
    const b = s2 || '';
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Computes normalized similarity score (0.0 to 1.0)
   */
  function calculateSimilarity(s1, s2) {
    if (!s1 && !s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  window.ErrorGuard.Matcher = {
    /**
     * Compares form name and document name
     * @param {string} formName
     * @param {string} docName
     * @returns {{ match: boolean, decision: 'MATCH'|'REVIEW'|'MISMATCH', score: number, reason: string }}
     */
    compareNames(formName, docName) {
      if (!formName || !docName) {
        return {
          match: false,
          decision: 'MISMATCH',
          score: 0,
          reason: 'One or both name values are missing.'
        };
      }

      const n1 = window.ErrorGuard.Normalize.text(formName);
      const n2 = window.ErrorGuard.Normalize.text(docName);

      if (n1 === n2) {
        return {
          match: true,
          decision: 'MATCH',
          score: 1.0,
          reason: 'Exact name match confirmed.'
        };
      }

      const score = calculateSimilarity(n1, n2);

      if (score >= 0.88) {
        return {
          match: false,
          decision: 'REVIEW',
          score: Math.round(score * 100) / 100,
          reason: `Minor spelling difference detected (Similarity: ${Math.round(score * 100)}%).`
        };
      }

      return {
        match: false,
        decision: 'MISMATCH',
        score: Math.round(score * 100) / 100,
        reason: `Significant name discrepancy detected (Similarity: ${Math.round(score * 100)}%).`
      };
    },

    /**
     * Compares form DOB and document DOB canonically
     * @param {string} formDob
     * @param {string} docDob
     * @returns {{ match: boolean, decision: 'MATCH'|'MISMATCH', reason: string, formIso: string, docIso: string }}
     */
    compareDob(formDob, docDob) {
      const formIso = window.ErrorGuard.Normalize.date(formDob);
      const docIso = window.ErrorGuard.Normalize.date(docDob);

      if (!formIso || !docIso) {
        return {
          match: false,
          decision: 'MISMATCH',
          reason: 'Date could not be unambiguously parsed.',
          formIso: formIso || formDob,
          docIso: docIso || docDob
        };
      }

      if (formIso === docIso) {
        return {
          match: true,
          decision: 'MATCH',
          reason: 'Date of Birth matches exactly.',
          formIso,
          docIso
        };
      }

      const formDisp = window.ErrorGuard.Normalize.formatDateDisplay(formIso);
      const docDisp = window.ErrorGuard.Normalize.formatDateDisplay(docIso);

      return {
        match: false,
        decision: 'MISMATCH',
        reason: `DOB mismatch: Form specifies ${formDisp}, but certificate states ${docDisp}.`,
        formIso,
        docIso
      };
    },

    /**
     * Compares Certificate / ID numbers
     */
    compareIdentifier(formId, docId) {
      const id1 = window.ErrorGuard.Normalize.identifier(formId);
      const id2 = window.ErrorGuard.Normalize.identifier(docId);

      if (!id1 || !id2) {
        return {
          match: false,
          decision: 'MISMATCH',
          reason: 'Identifier missing.'
        };
      }

      const match = id1 === id2;
      return {
        match,
        decision: match ? 'MATCH' : 'MISMATCH',
        reason: match ? 'Certificate number matches.' : `Identifier mismatch: ${id1} vs ${id2}`
      };
    }
  };
})();
