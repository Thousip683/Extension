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
      this.userHasCheckedErrors = false;
      this.isAiProcessing = false;
      this.aiDocumentReady = false;
      this.lastAiDocData = null;
    }

    init() {
      if (document.getElementById('error-guard-badge')) return;

      // 1. Floating Badge
      this.badgeEl = document.createElement('div');
      this.badgeEl.id = 'error-guard-badge';
      this.badgeEl.className = 'eg-floating-badge eg-idle';
      this.badgeEl.innerHTML = `
        <div class="eg-badge-content">
          <span class="eg-badge-icon">🛡️</span>
          <div class="eg-badge-text">
            <span class="eg-badge-title">Error Guard</span>
            <span class="eg-badge-status" id="egBadgeStatus">Ready to Inspect</span>
          </div>
          <button type="button" class="eg-badge-check-btn" id="egBadgeCheckBtn" title="Inspect Form for Pre-Submission Errors">
            🔍 Check for Errors
          </button>
          <button type="button" class="eg-badge-refresh-btn" id="egBadgeRefresh" title="Re-scan and Refresh Verification">🔄</button>
        </div>
      `;
      document.body.appendChild(this.badgeEl);

      const checkBtn = document.getElementById('egBadgeCheckBtn');
      if (checkBtn) {
        checkBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.userHasCheckedErrors = true;
          if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
            await window.ErrorGuard.reEvaluate({ showAlerts: true, openDrawer: true });
          }
        });
      }

      this.badgeEl.addEventListener('click', (e) => {
        if (e.target.closest('#egBadgeRefresh') || e.target.closest('#egBadgeCheckBtn')) return;
        if (!this.userHasCheckedErrors) {
          this.userHasCheckedErrors = true;
          if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
            window.ErrorGuard.reEvaluate({ showAlerts: true, openDrawer: true });
          }
        } else {
          this.toggleDrawer();
        }
      });

      const handleRefreshClick = async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.classList.add('eg-spinning');
        const badgeStatus = document.getElementById('egBadgeStatus');
        if (badgeStatus) badgeStatus.textContent = 'Refreshing...';
        if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
          await window.ErrorGuard.reEvaluate({ showAlerts: true });
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

    setAiProgress(percent, msg) {
      this.isAiProcessing = true;
      if (!this.badgeEl) this.init();
      const badgeStatus = document.getElementById('egBadgeStatus');
      if (badgeStatus) {
        badgeStatus.innerHTML = `<span class="eg-ai-pulse">⚡</span> AI Analyzing... ${percent}%`;
      }
      if (this.badgeEl) {
        this.badgeEl.className = 'eg-floating-badge eg-ai-analyzing';
      }
    }

    setAiReady(docData) {
      this.isAiProcessing = false;
      this.aiDocumentReady = true;
      this.lastAiDocData = docData;
      if (!this.badgeEl) this.init();
      const badgeStatus = document.getElementById('egBadgeStatus');
      if (!this.userHasCheckedErrors) {
        if (badgeStatus) {
          badgeStatus.innerHTML = `⚡ AI Ready • Click Check`;
        }
        if (this.badgeEl) {
          this.badgeEl.className = 'eg-floating-badge eg-ai-ready';
        }
      }
    }

    /**
     * Updates overlay states based on the latest validation report
     * @param {object} report - output of ErrorEngine.aggregate
     * @param {object} [options] - display options { showAlerts, openDrawer }
     */
    update(report, options = {}) {
      this.currentReport = report;
      if (!this.badgeEl) this.init();

      const showAlerts = options.showAlerts !== undefined ? options.showAlerts : this.userHasCheckedErrors;
      this.userHasCheckedErrors = showAlerts;

      const badgeStatus = document.getElementById('egBadgeStatus');
      const drawerScore = document.getElementById('egDrawerScore');
      const checkBtn = document.getElementById('egBadgeCheckBtn');

      // Clear previous field outlines
      this.clearFieldHighlights();

      if (!showAlerts) {
        // Calm, non-intrusive idle state: No red boxes on blank fields!
        if (checkBtn) checkBtn.style.display = 'inline-flex';

        if (this.isAiProcessing) {
          this.badgeEl.className = 'eg-floating-badge eg-ai-analyzing';
        } else if (this.aiDocumentReady) {
          this.badgeEl.className = 'eg-floating-badge eg-ai-ready';
          if (badgeStatus) badgeStatus.innerHTML = `⚡ AI Ready • Click Check`;
        } else {
          this.badgeEl.className = 'eg-floating-badge eg-idle';
          if (badgeStatus) badgeStatus.textContent = 'Active • Click to Check';
        }

        if (drawerScore) {
          drawerScore.textContent = `Health: Ready to Audit`;
          drawerScore.className = 'eg-health-tag';
        }
      } else {
        // User clicked check button or submitted form -> show full audit results
        if (checkBtn) checkBtn.style.display = 'none';

        if (report.isReady) {
          this.badgeEl.className = 'eg-floating-badge eg-ready';
          if (badgeStatus) badgeStatus.textContent = 'READY TO SUBMIT';
          if (drawerScore) {
            drawerScore.textContent = `Health: ${report.healthScore}% (Ready)`;
            drawerScore.className = 'eg-health-tag eg-tag-ready';
          }
        } else {
          const blockingCount = report.issues.blocking.length;
          this.badgeEl.className = 'eg-floating-badge eg-not-ready';
          if (badgeStatus) badgeStatus.textContent = `${blockingCount} Issue${blockingCount > 1 ? 's' : ''} (Action Required)`;
          if (drawerScore) {
            drawerScore.textContent = `Health: ${report.healthScore}% (Action Required)`;
            drawerScore.className = 'eg-health-tag eg-tag-error';
          }

          // Highlight problematic fields on the actual form
          for (const issue of report.issues.blocking) {
            this.highlightField(issue);
          }
        }
      }

      this.renderDrawerContent(report, showAlerts);

      if (options.openDrawer) {
        this.openDrawer();
      }
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

    renderDrawerContent(report, showAlerts = true) {
      const body = document.getElementById('egDrawerBody');
      if (!body) return;

      if (!showAlerts) {
        body.innerHTML = `
          <div class="eg-status-banner eg-banner-idle">
            <h4>🛡️ Pre-Submission Audit Ready</h4>
            <p>Error Guard is actively scanning your form and processing document AI in the background. Alerts are paused until you request a check.</p>
          </div>
          <div style="text-align: center; margin: 20px 0;">
            <button type="button" class="eg-btn eg-btn-primary" id="egDrawerAuditBtn" style="padding: 12px 20px; font-size: 0.95rem; border-radius: 8px; cursor: pointer; width: 100%; font-weight: 700;">
              🔍 Check for Errors Now
            </button>
          </div>
          <div class="eg-section-checklist">
            <h5>Background Monitoring Status</h5>
            <div class="eg-check-grid">
              <div class="eg-check-item pass">
                <span>⚡</span>
                <span>Real-time Form Listener Active</span>
              </div>
              <div class="eg-check-item ${this.aiDocumentReady ? 'pass' : (this.isAiProcessing ? 'pass' : 'fail')}">
                <span>${this.aiDocumentReady ? '✅' : (this.isAiProcessing ? '⚡' : '⏳')}</span>
                <span>${this.aiDocumentReady ? 'AI Document Model Ready' : (this.isAiProcessing ? 'AI Analyzing Uploaded Document...' : 'Awaiting Document Upload')}</span>
              </div>
            </div>
          </div>
        `;
        const auditBtn = document.getElementById('egDrawerAuditBtn');
        if (auditBtn) {
          auditBtn.addEventListener('click', async () => {
            this.userHasCheckedErrors = true;
            if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
              await window.ErrorGuard.reEvaluate({ showAlerts: true });
            }
          });
        }
        return;
      }

      let html = `
        <div class="eg-status-banner ${report.isReady ? 'eg-banner-ready' : 'eg-banner-error'}">
          <h4>${report.status}</h4>
          <p>${report.isReady
          ? 'All form values, document constraints, and identity cross-checks have passed.'
          : `${report.issues.blocking.length} blocking issue(s) need your attention before submitting.`}
          </p>
        </div>

        <div style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
          <button type="button" class="eg-badge-dismiss-btn" id="egDrawerDismissAlertsBtn" style="padding: 6px 12px; font-size: 0.75rem; border-radius: 6px; cursor: pointer; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">
            ✕ Hide Alerts & Resume Typing
          </button>
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

      const dismissBtn = document.getElementById('egDrawerDismissAlertsBtn');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          this.userHasCheckedErrors = false;
          this.clearFieldHighlights();
          if (window.ErrorGuard && window.ErrorGuard.reEvaluate) {
            window.ErrorGuard.reEvaluate({ showAlerts: false });
          }
          this.closeDrawer();
        });
      }

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
