/**
 * In-Page UI Overlay
 * Manages floating guard badge, field-level error highlights,
 * and the pre-submission blocking dialog.
 * Phases 11 & 12 of Build Guide.
 */

(function () {
  window.ErrorGuard = window.ErrorGuard || {};

  class OverlayManager {
    constructor() {
      this.badgeEl = null;
      this.modalEl = null;
      this.drawerEl = null;
      this.highlightedElements = new Set();
      this.currentReport = null;
    }

    init() {
      if (document.getElementById('error-guard-badge')) return;

      // 1. Floating Badge
      this.badgeEl = document.createElement('div');
      this.badgeEl.id = 'error-guard-badge';
      this.badgeEl.className = 'eg-floating-badge eg-checking';
      this.badgeEl.innerHTML = `
        <div class="eg-badge-content">
          <span class="eg-badge-icon">🛡️</span>
          <div class="eg-badge-text">
            <span class="eg-badge-title">Error Guard</span>
            <span class="eg-badge-status" id="egBadgeStatus">Scanning Form...</span>
          </div>
          <button type="button" class="eg-badge-refresh-btn" id="egBadgeRefresh" title="Re-scan and Refresh Verification">🔄</button>
        </div>
      `;
      document.body.appendChild(this.badgeEl);

      this.badgeEl.addEventListener('click', (e) => {
        if (e.target.closest('#egBadgeRefresh')) return;
        this.toggleDrawer();
      });

      const handleRefreshClick = async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.classList.add('eg-spinning');
        const badgeStatus = document.getElementById('egBadgeStatus');
        if (badgeStatus) badgeStatus.textContent = 'Refreshing...';
        if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
          await window.ErrorGuard.reEvaluate();
        }
        setTimeout(() => {
          btn.classList.remove('eg-spinning');
        }, 400);
      };

      document.getElementById('egBadgeRefresh').addEventListener('click', handleRefreshClick);

      // 2. Slide-out Quick Drawer
      this.drawerEl = document.createElement('div');
      this.drawerEl.id = 'error-guard-drawer';
      this.drawerEl.className = 'eg-drawer eg-drawer-closed';
      this.drawerEl.innerHTML = `
        <div class="eg-drawer-header">
          <div class="eg-drawer-title">
            <span>🛡️ Pre-Submission Error Guard</span>
            <span class="eg-health-tag" id="egDrawerScore">Health: --%</span>
          </div>
          <div class="eg-drawer-header-actions">
            <button type="button" class="eg-drawer-refresh-btn" id="egDrawerRefresh" title="Re-scan Form">🔄 Refresh</button>
            <button type="button" class="eg-drawer-close" id="egDrawerClose">✕</button>
          </div>
        </div>
        <div class="eg-drawer-body" id="egDrawerBody">
          <!-- Populated dynamically -->
        </div>
      `;
      document.body.appendChild(this.drawerEl);

      document.getElementById('egDrawerRefresh').addEventListener('click', handleRefreshClick);

      document.getElementById('egDrawerClose').addEventListener('click', () => {
        this.closeDrawer();
      });

      // 3. Pre-Submit Interception Modal
      this.modalEl = document.createElement('div');
      this.modalEl.id = 'error-guard-modal';
      this.modalEl.className = 'eg-modal-overlay eg-modal-hidden';
      this.modalEl.innerHTML = `
        <div class="eg-modal-box">
          <div class="eg-modal-header">
            <div class="eg-modal-title">
              <span class="eg-modal-shield">🛑</span>
              <div>
                <h3>Submission Blocked by Error Guard</h3>
                <p>Avoidable errors detected in your application before submission.</p>
              </div>
            </div>
            <button type="button" class="eg-modal-close" id="egModalClose">✕</button>
          </div>
          <div class="eg-modal-body" id="egModalIssues">
            <!-- Issues list -->
          </div>
          <div class="eg-modal-footer">
            <button type="button" class="eg-btn eg-btn-primary" id="egModalReviewBtn">
              Review & Fix Errors
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(this.modalEl);

      document.getElementById('egModalClose').addEventListener('click', () => {
        this.hideModal();
      });

      document.getElementById('egModalReviewBtn').addEventListener('click', () => {
        this.hideModal();
        this.openDrawer();
      });
    }

    /**
     * Updates overlay states based on the latest validation report
     * @param {object} report - output of ErrorEngine.aggregate
     */
    update(report) {
      this.currentReport = report;
      if (!this.badgeEl) this.init();

      const badgeStatus = document.getElementById('egBadgeStatus');
      const drawerScore = document.getElementById('egDrawerScore');

      // Clear previous field outlines
      this.clearFieldHighlights();

      if (report.isReady) {
        this.badgeEl.className = 'eg-floating-badge eg-ready';
        badgeStatus.textContent = 'READY TO SUBMIT';
        if (drawerScore) {
          drawerScore.textContent = `Health: ${report.healthScore}% (Ready)`;
          drawerScore.className = 'eg-health-tag eg-tag-ready';
        }
      } else {
        const blockingCount = report.issues.blocking.length;
        this.badgeEl.className = 'eg-floating-badge eg-not-ready';
        badgeStatus.textContent = `${blockingCount} Issue${blockingCount > 1 ? 's' : ''} (NOT READY)`;
        if (drawerScore) {
          drawerScore.textContent = `Health: ${report.healthScore}% (Action Required)`;
          drawerScore.className = 'eg-health-tag eg-tag-error';
        }

        // Highlight problematic fields on the actual form
        for (const issue of report.issues.blocking) {
          this.highlightField(issue);
        }
      }

      this.renderDrawerContent(report);
    }

    highlightField(issue) {
      let el = null;
      if (issue.elementId) {
        el = document.getElementById(issue.elementId);
      }
      if (!el && issue.field) {
        el = document.querySelector(`[name="${issue.field}"], #${issue.field}`);
      }

      if (el) {
        el.classList.add('eg-field-error');
        this.highlightedElements.add(el);

        // Add inline error tooltip if not present
        const existingTooltip = el.parentElement.querySelector('.eg-inline-tooltip');
        if (!existingTooltip) {
          const tooltip = document.createElement('div');
          tooltip.className = 'eg-inline-tooltip';
          tooltip.innerHTML = `⚠️ <strong>${issue.code}:</strong> ${issue.message}`;
          el.parentElement.appendChild(tooltip);
        }
      }
    }

    clearFieldHighlights() {
      document.querySelectorAll('.eg-field-error').forEach(el => {
        el.classList.remove('eg-field-error');
      });
      document.querySelectorAll('.eg-inline-tooltip').forEach(el => {
        el.remove();
      });
      this.highlightedElements.clear();
    }

    renderDrawerContent(report) {
      const body = document.getElementById('egDrawerBody');
      if (!body) return;

      let html = `
        <div class="eg-status-banner ${report.isReady ? 'eg-banner-ready' : 'eg-banner-error'}">
          <h4>${report.status}</h4>
          <p>${report.isReady 
            ? 'All form values, document constraints, and identity cross-checks have passed.' 
            : `${report.issues.blocking.length} blocking issue(s) need your attention before submitting.`}
          </p>
        </div>

        <div class="eg-section-checklist">
          <h5>Pre-Submission Verification Checklist</h5>
          <div class="eg-check-grid">
            <div class="eg-check-item ${report.checklist.form.valid ? 'pass' : 'fail'}">
              <span>${report.checklist.form.valid ? '✅' : '❌'}</span>
              <span>Form Fields Completed</span>
            </div>
            <div class="eg-check-item ${report.checklist.document.uploaded ? (report.checklist.document.sizeValid && report.checklist.document.formatValid ? 'pass' : 'fail') : 'fail'}">
              <span>${report.checklist.document.uploaded && report.checklist.document.sizeValid ? '✅' : '❌'}</span>
              <span>Document Size & Format</span>
            </div>
            <div class="eg-check-item ${report.checklist.verification.nameMatch !== false && report.checklist.verification.dobMatch !== false ? 'pass' : 'fail'}">
              <span>${report.checklist.verification.nameMatch !== false && report.checklist.verification.dobMatch !== false ? '✅' : '❌'}</span>
              <span>Name & DOB Cross-Check</span>
            </div>
          </div>
        </div>
      `;

      if (report.issues.all.length > 0) {
        html += `<div class="eg-issues-list"><h5>Detected Issues & Corrections</h5>`;
        for (const issue of report.issues.all) {
          const isBlocking = issue.severity === 'BLOCKING';
          html += `
            <div class="eg-issue-card ${isBlocking ? 'eg-card-blocking' : 'eg-card-warning'}">
              <div class="eg-card-top">
                <span class="eg-card-severity">${isBlocking ? '🛑 BLOCKING' : '⚠️ WARNING'}</span>
                <span class="eg-card-code">${issue.code}</span>
              </div>
              <p class="eg-card-msg">${issue.message}</p>
              ${issue.fix ? `<div class="eg-card-fix">💡 <strong>Suggested Fix:</strong> ${issue.fix}</div>` : ''}
              ${issue.elementId ? `
                <button type="button" class="eg-jump-btn" data-target="${issue.elementId}">
                  🔍 Jump to Field
                </button>
              ` : ''}
            </div>
          `;
        }
        html += `</div>`;
      }

      body.innerHTML = html;

      // Attach jump buttons
      body.querySelectorAll('.eg-jump-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetId = e.target.getAttribute('data-target');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.focus();
            this.closeDrawer();
          }
        });
      });
    }

    showPreSubmitModal(report) {
      if (!this.modalEl) this.init();
      const issuesContainer = document.getElementById('egModalIssues');

      let html = `
        <div class="eg-modal-alert">
          <strong>Cannot proceed with application submission.</strong>
          <p>Please resolve the following ${report.issues.blocking.length} critical issue(s):</p>
        </div>
        <div class="eg-modal-items">
      `;

      for (const issue of report.issues.blocking) {
        html += `
          <div class="eg-modal-item">
            <span class="eg-modal-item-icon">❌</span>
            <div>
              <strong>${issue.code}</strong>
              <p>${issue.message}</p>
              ${issue.fix ? `<small>Fix: ${issue.fix}</small>` : ''}
            </div>
          </div>
        `;
      }
      html += `</div>`;

      issuesContainer.innerHTML = html;
      this.modalEl.classList.remove('eg-modal-hidden');
    }

    hideModal() {
      if (this.modalEl) {
        this.modalEl.classList.add('eg-modal-hidden');
      }
    }

    toggleDrawer() {
      if (this.drawerEl.classList.contains('eg-drawer-open')) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    }

    openDrawer() {
      if (this.drawerEl) {
        this.drawerEl.classList.remove('eg-drawer-closed');
        this.drawerEl.classList.add('eg-drawer-open');
      }
    }

    closeDrawer() {
      if (this.drawerEl) {
        this.drawerEl.classList.remove('eg-drawer-open');
        this.drawerEl.classList.add('eg-drawer-closed');
      }
    }

    // ─── AI Auto-Fill & Auto-Correct In-Page Components ───
    showAutoFillBanner(docData, onApply) {
      this.hideAutoFillBanner();
      if (!docData || (!docData.name && !docData.dob && !docData.certificateNo)) return;

      const banner = document.createElement('div');
      banner.id = 'eg-autofill-banner';
      banner.className = 'eg-autofill-banner';

      const typeName = docData.docType === 'AADHAAR' ? 'Aadhaar Card' :
                       docData.docType === 'PAN' ? 'PAN Card' :
                       docData.docType === 'CASTE_CERTIFICATE' ? 'Caste Certificate' : 'Official Document';

      banner.innerHTML = `
        <div class="eg-autofill-header">
          <div class="eg-autofill-header-left">
            <span class="eg-autofill-sparkle">✨</span>
            <div>
              <strong class="eg-autofill-title">AI Detected ${typeName}</strong>
              <p class="eg-autofill-subtitle">Details extracted from unlabelled document. Click to auto-fill form:</p>
            </div>
          </div>
          <button type="button" class="eg-banner-close" id="egCloseAutoFill">✕</button>
        </div>
        <div class="eg-autofill-tags">
          ${docData.name ? `<span class="eg-autofill-tag">👤 Name: <strong>${docData.name}</strong></span>` : ''}
          ${docData.dob ? `<span class="eg-autofill-tag">📅 DOB: <strong>${docData.dob}</strong></span>` : ''}
          ${docData.certificateNo ? `<span class="eg-autofill-tag">🆔 ID: <strong>${docData.certificateNo}</strong></span>` : ''}
        </div>
        <div class="eg-autofill-footer">
          <button type="button" class="eg-btn-autofill" id="egApplyAutoFill">
            🪄 1-Click Auto-Fill Form
          </button>
          <button type="button" class="eg-btn-dismiss-autofill" id="egDismissAutoFill">
            Dismiss
          </button>
        </div>
      `;

      document.body.appendChild(banner);

      document.getElementById('egCloseAutoFill').addEventListener('click', () => this.hideAutoFillBanner());
      document.getElementById('egDismissAutoFill').addEventListener('click', () => this.hideAutoFillBanner());
      document.getElementById('egApplyAutoFill').addEventListener('click', () => {
        if (typeof onApply === 'function') onApply();
        this.hideAutoFillBanner();
      });
    }

    hideAutoFillBanner() {
      const existing = document.getElementById('eg-autofill-banner');
      if (existing) existing.remove();
    }

    showAutoCorrectChip(fieldElement, correctValue, onApply) {
      if (!fieldElement || !correctValue) return;

      const parent = fieldElement.parentElement || fieldElement.closest('.form-group') || fieldElement;
      const existingChip = parent.querySelector('.eg-autocorrect-chip');
      if (existingChip) existingChip.remove();

      const chip = document.createElement('div');
      chip.className = 'eg-autocorrect-chip';
      chip.innerHTML = `
        <span class="eg-chip-text">⚡ Document has: <strong>"${correctValue}"</strong></span>
        <button type="button" class="eg-chip-apply-btn">Auto-Fix</button>
      `;

      parent.appendChild(chip);

      chip.querySelector('.eg-chip-apply-btn').addEventListener('click', () => {
        if (typeof onApply === 'function') onApply();
        chip.remove();
      });
    }

    clearAutoCorrectChips() {
      document.querySelectorAll('.eg-autocorrect-chip').forEach(el => el.remove());
    }
  }

  window.ErrorGuard.Overlay = new OverlayManager();
})();
