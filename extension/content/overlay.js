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
      this.aiProgressPercent = 0;
      this.aiProgressMsg = '';
      this.aiDocumentReady = false;
      this.lastAiDocData = null;
      this.aiAutoFillMode = false; // false = Manual Guard, true = AI Auto-Fill
      this.hasForm = true;
      this.onProceedSubmit = null;
      this.currentNavIndex = -1;
    }

    setOnProceedSubmit(callback) {
      this.onProceedSubmit = callback;
    }

    /**
     * Called by content.js when the mode changes (from popup toggle or storage).
     * Re-renders the badge label accordingly.
     */
    setMode(isAiMode) {
      this.aiAutoFillMode = !!isAiMode;
      const badgeStatus = document.getElementById('egBadgeStatus');
      if (!badgeStatus) return;
      if (!this.userHasCheckedErrors) {
        if (this.isAiProcessing) return; // let AI progress message stay
        if (this.aiDocumentReady) {
          badgeStatus.innerHTML = this.aiAutoFillMode
            ? `⚡ AI Ready • Click Auto-Fill`
            : `⚡ AI Ready • Click Check`;
        } else {
          badgeStatus.textContent = this.aiAutoFillMode
            ? '🤖 AI Auto-Fill • Active'
            : '📋 Manual Guard • Click to Check';
        }
      }
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
        if (!this.hasForm) {
          this.toggleStandbyPopover();
          return;
        }
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
          await window.ErrorGuard.reEvaluate({ showAlerts: this.hasForm ? this.userHasCheckedErrors : false });
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
        <div class="eg-field-navigator" id="egFieldNavigator">
          <div class="eg-nav-info">
            <span class="eg-nav-icon">🧭</span>
            <div class="eg-nav-text">
              <span class="eg-nav-label" id="egNavLabel">Field Navigator</span>
              <span class="eg-nav-counter" id="egNavCounter">0 of 0 fields</span>
            </div>
          </div>
          <div class="eg-nav-buttons">
            <button type="button" class="eg-nav-btn" id="egNavPrevBtn" title="Jump to Previous Field" disabled>
              ◀ Prev
            </button>
            <button type="button" class="eg-nav-btn" id="egNavNextBtn" title="Jump to Next Field" disabled>
              Next ▶
            </button>
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

      document.getElementById('egNavPrevBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.navigatePreviousField();
      });

      document.getElementById('egNavNextBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.navigateNextField();
      });

      document.addEventListener('focusin', (e) => {
        if (!e.target) return;
        if (e.target.closest && e.target.closest('#error-guard-drawer, #error-guard-badge, #error-guard-modal, #eg-autofill-banner, #eg-wrongdoc-banner, #eg-blur-banner')) {
          return;
        }
        const fields = this.getVisibleFormFields();
        const idx = fields.indexOf(e.target);
        if (idx !== -1) {
          this.currentNavIndex = idx;
          this.updateFieldNavigator();
        }
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
            <button type="button" class="eg-btn eg-btn-secondary" id="egModalReviewBtn">
              🔍 Review & Fix Errors
            </button>
            <button type="button" class="eg-btn eg-btn-override" id="egModalProceedBtn">
              ⚠️ Proceed & Submit Anyway →
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

      document.getElementById('egModalProceedBtn').addEventListener('click', () => {
        this.hideModal();
        if (typeof this.onProceedSubmit === 'function') {
          this.onProceedSubmit();
        }
      });
    }

    setAiProgress(percent, msg) {
      this.isAiProcessing = true;
      this.aiProgressPercent = Math.max(this.aiProgressPercent && this.aiProgressPercent < 100 ? this.aiProgressPercent : 0, percent || 0);
      if (msg) this.aiProgressMsg = msg;
      if (!this.badgeEl) this.init();

      this.updateProgressUI(this.aiProgressPercent, this.aiProgressMsg);

      if (this.aiProgressPercent < 100) {
        this.startProgressTicker();
      } else {
        this.stopProgressTicker();
      }
    }

    startProgressTicker() {
      if (this.aiProgressTimer) return;
      this.aiProgressTimer = setInterval(() => {
        if (!this.isAiProcessing || this.aiProgressPercent >= 96) {
          return;
        }

        // Increment naturally: faster early on, pacing down near 95%
        const remaining = 96 - this.aiProgressPercent;
        const step = remaining > 35 ? 2 : (remaining > 10 ? 1 : (Math.random() > 0.4 ? 1 : 0));
        this.aiProgressPercent += step;

        let dynamicMsg = this.aiProgressMsg;
        if (this.aiProgressPercent >= 25 && this.aiProgressPercent < 50) {
          dynamicMsg = 'Gemini AI parsing document text & certificate layout...';
        } else if (this.aiProgressPercent >= 50 && this.aiProgressPercent < 72) {
          dynamicMsg = 'Extracting applicant particulars & identification numbers...';
        } else if (this.aiProgressPercent >= 72 && this.aiProgressPercent < 88) {
          dynamicMsg = 'Matching extracted details with application form fields...';
        } else if (this.aiProgressPercent >= 88) {
          dynamicMsg = 'Finalizing AI field mappings & quality verification...';
        }

        this.updateProgressUI(this.aiProgressPercent, dynamicMsg);
      }, 150);
    }

    stopProgressTicker() {
      if (this.aiProgressTimer) {
        clearInterval(this.aiProgressTimer);
        this.aiProgressTimer = null;
      }
    }

    updateProgressUI(percent, msg) {
      const badgeStatus = document.getElementById('egBadgeStatus');
      if (badgeStatus) {
        badgeStatus.innerHTML = `<span class="eg-ai-pulse">⚡</span> AI Analyzing... ${percent}%`;
      }
      if (this.badgeEl) {
        this.badgeEl.className = 'eg-floating-badge eg-ai-analyzing';
      }
      const checkBtn = document.getElementById('egBadgeCheckBtn');
      if (checkBtn) checkBtn.style.display = 'none';

      // Live update the drawer loading screen if open
      if (this.drawerEl && this.drawerEl.classList.contains('eg-drawer-open')) {
        const drawerScore = document.getElementById('egDrawerScore');
        if (drawerScore) {
          drawerScore.textContent = `AI: ${percent}%`;
          drawerScore.className = 'eg-health-tag eg-tag-ai';
        }
        const barFill = this.drawerEl.querySelector('.eg-loading-bar-fill');
        if (barFill) barFill.style.width = `${percent}%`;
        const percentText = this.drawerEl.querySelector('.eg-loading-percent');
        if (percentText) percentText.textContent = `${percent}% Completed`;
        const subtext = this.drawerEl.querySelector('.eg-drawer-loading-subtext');
        if (subtext && msg) subtext.textContent = msg;
      }

      // Live update floating loading banner so the user clearly sees increasing numbers
      this.showAiLoadingBanner(percent, msg);
    }

    setAiReady(docData) {
      this.stopProgressTicker();
      this.isAiProcessing = false;
      this.aiDocumentReady = true;
      this.lastAiDocData = docData;
      this.hideAiLoadingBanner();
      if (!this.badgeEl) this.init();
      const checkBtn = document.getElementById('egBadgeCheckBtn');
      if (checkBtn && !this.userHasCheckedErrors) checkBtn.style.display = 'inline-flex';
      const badgeStatus = document.getElementById('egBadgeStatus');
      if (!this.userHasCheckedErrors) {
        if (badgeStatus) {
          badgeStatus.innerHTML = this.aiAutoFillMode
            ? `⚡ AI Ready • Click Auto-Fill`
            : `⚡ AI Ready • Click Check`;
        }
        if (this.badgeEl) {
          this.badgeEl.className = 'eg-floating-badge eg-ai-ready';
        }
      }
    }

    clearAiLoading() {
      this.stopProgressTicker();
      this.isAiProcessing = false;
      this.hideAiLoadingBanner();
      const checkBtn = document.getElementById('egBadgeCheckBtn');
      if (checkBtn && !this.userHasCheckedErrors) checkBtn.style.display = 'inline-flex';
    }

    showDrawerLoading(title, message, percent) {
      this.isAiProcessing = true;
      if (percent !== undefined) this.aiProgressPercent = percent;
      if (message) this.aiProgressMsg = message;
      if (!this.drawerEl) this.init();
      this.openDrawer();
      const body = document.getElementById('egDrawerBody');
      const drawerScore = document.getElementById('egDrawerScore');
      if (drawerScore) {
        drawerScore.textContent = `AI: ${this.aiProgressPercent || 30}%`;
        drawerScore.className = 'eg-health-tag eg-tag-ai';
      }
      if (body) {
        body.innerHTML = `
          <div class="eg-status-banner eg-banner-ai-loading">
            <h4>⚡ ${title || 'AI Verification in Progress'}</h4>
            <p>${message || this.aiProgressMsg || 'Analyzing uploaded document with Gemini AI...'}</p>
          </div>
          <div class="eg-drawer-loading-box">
            <div class="eg-drawer-spinner-ring"></div>
            <h4 class="eg-drawer-loading-title">${title || 'AI Document Analysis in Progress'}</h4>
            <p class="eg-drawer-loading-subtext">
              ${message || this.aiProgressMsg || 'Extracting structured details and matching against form fields...'}
            </p>
            <div class="eg-loading-bar-wrap">
              <div class="eg-loading-bar-fill" style="width: ${this.aiProgressPercent || 30}%;"></div>
            </div>
            <div class="eg-loading-percent">${this.aiProgressPercent || 30}% Completed</div>
            <div class="eg-loading-notice">
              ⏳ Waiting for AI analysis to complete before finalizing verification. The audit will display immediately.
            </div>
          </div>
        `;
      }
    }

    showAiLoadingBanner(percent, msg) {
      let banner = document.getElementById('eg-ai-loading-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'eg-ai-loading-banner';
        banner.className = 'eg-ai-loading-banner';
        banner.innerHTML = `
          <div class="eg-ai-loading-content">
            <div class="eg-ai-loading-left">
              <span class="eg-ai-pulse" style="font-size: 1.3rem;">⚡</span>
              <div>
                <div class="eg-ai-loading-title">
                  <strong>Gemini AI Analyzing Document</strong>
                  <span class="eg-ai-loading-badge" id="egAiLoadingPercent">${percent}%</span>
                </div>
                <p class="eg-ai-loading-desc" id="egAiLoadingDesc">${msg || 'Reading document & preparing auto-fill...'}</p>
              </div>
            </div>
            <div class="eg-ai-loading-spinner"></div>
          </div>
          <div class="eg-ai-loading-bar-wrap">
            <div class="eg-ai-loading-bar-fill" id="egAiLoadingBarFill" style="width: ${percent}%;"></div>
          </div>
        `;
        document.body.appendChild(banner);
      } else {
        const badge = document.getElementById('egAiLoadingPercent');
        const desc = document.getElementById('egAiLoadingDesc');
        const fill = document.getElementById('egAiLoadingBarFill');
        if (badge) badge.textContent = `${percent}%`;
        if (desc && msg) desc.textContent = msg;
        if (fill) fill.style.width = `${percent}%`;
      }
    }

    hideAiLoadingBanner() {
      const banner = document.getElementById('eg-ai-loading-banner');
      if (banner) {
        banner.remove();
      }
    }

    toggleStandbyPopover() {
      const existing = document.getElementById('eg-standby-popover');
      if (existing) {
        this.hideStandbyPopover();
      } else {
        this.showStandbyPopover();
      }
    }

    showStandbyPopover() {
      this.hideStandbyPopover();
      const popover = document.createElement('div');
      popover.id = 'eg-standby-popover';
      popover.className = 'eg-standby-popover';
      popover.innerHTML = `
        <div class="eg-standby-popover-header">
          <div class="eg-standby-popover-title">
            <span style="font-size: 1.3rem;">🛡️</span>
            <div>
              <strong>Error Guard: Standby Mode</strong>
              <span class="eg-standby-pill">No Form on Page</span>
            </div>
          </div>
          <button type="button" class="eg-banner-close" id="egCloseStandby" title="Close">✕</button>
        </div>
        <div class="eg-standby-popover-body">
          <div class="eg-standby-hero-icon">📄🔍</div>
          <h4 class="eg-standby-headline">No Application Form Detected</h4>
          <p class="eg-standby-explanation">
            Error Guard is running and actively listening in the background. When you open a webpage with an application, scholarship, or registration form, pre-submission audits and AI document assistance will activate automatically.
          </p>
          <div class="eg-standby-pills-row">
            <div class="eg-standby-feature-badge">⚡ Real-Time Typo & Format Audits</div>
            <div class="eg-standby-feature-badge">📑 Document Mismatch & Blurring Guard</div>
            <div class="eg-standby-feature-badge">🤖 AI Auto-Fill & Cross-Verification</div>
          </div>
        </div>
        <div class="eg-standby-popover-footer">
          <button type="button" class="eg-btn eg-btn-primary" id="egOpenDemoPortalBtn" style="padding: 10px 14px; font-size: 0.84rem; font-weight: 700; border-radius: 8px; width: 100%; cursor: pointer;">
            🏛️ Open Demo Portal to Test (localhost:3000)
          </button>
        </div>
      `;

      document.body.appendChild(popover);

      document.getElementById('egCloseStandby')?.addEventListener('click', () => this.hideStandbyPopover());
      document.getElementById('egOpenDemoPortalBtn')?.addEventListener('click', () => {
        window.open('http://localhost:3000', '_blank');
        this.hideStandbyPopover();
      });
    }

    hideStandbyPopover() {
      const existing = document.getElementById('eg-standby-popover');
      if (existing) existing.remove();
    }

    /**
     * Updates overlay states based on the latest validation report
     * @param {object} report - output of ErrorEngine.aggregate
     * @param {object} [options] - display options { showAlerts, openDrawer, highlightFields }
     *   highlightFields: when false, inline red borders and tooltips are suppressed even
     *                    when showAlerts is true (used in Manual Guard mode).
     *                    Defaults to true when showAlerts is true.
     */
    update(report, options = {}) {
      this.currentReport = report;
      if (!this.badgeEl) this.init();

      const badgeStatus = document.getElementById('egBadgeStatus');
      const drawerScore = document.getElementById('egDrawerScore');
      const checkBtn = document.getElementById('egBadgeCheckBtn');

      // Check if page has no active form
      if (!report || report.hasForm === false) {
        this.hasForm = false;
        this.clearFieldHighlights();
        if (checkBtn) checkBtn.style.display = 'none';
        this.badgeEl.className = 'eg-floating-badge eg-standby';
        this.badgeEl.title = 'Error Guard is in Standby Mode (No application form detected on this page). Click for details.';
        if (badgeStatus) {
          badgeStatus.innerHTML = '<span class="eg-pulse-dot" style="background: #94a3b8; margin-right: 4px;"></span> Standby • No Form';
        }
        if (drawerScore) {
          drawerScore.textContent = 'Status: Standby';
          drawerScore.className = 'eg-health-tag';
        }
        this.renderDrawerContent(report, false);
        if (options.openDrawer) this.openDrawer();
        return;
      }

      this.hasForm = true;
      this.hideStandbyPopover();
      this.badgeEl.title = '';

      const showAlerts = options.showAlerts !== undefined ? options.showAlerts : this.userHasCheckedErrors;
      this.userHasCheckedErrors = showAlerts;

      // In Manual Guard mode, even after checking, we don't paint fields red
      const highlightFields = options.highlightFields !== undefined
        ? options.highlightFields
        : (showAlerts && this.aiAutoFillMode);

      if (this.isAiProcessing) {
        if (checkBtn) checkBtn.style.display = 'none';
        this.badgeEl.className = 'eg-floating-badge eg-ai-analyzing';
        if (badgeStatus) {
          badgeStatus.innerHTML = `<span class="eg-ai-pulse">⚡</span> AI Analyzing... ${this.aiProgressPercent || 0}%`;
        }
        if (drawerScore) {
          drawerScore.textContent = `AI: ${this.aiProgressPercent || 0}%`;
          drawerScore.className = 'eg-health-tag eg-tag-ai';
        }
        this.renderDrawerContent(report, showAlerts);
        if (options.openDrawer) this.openDrawer();
        return;
      }

      if (!showAlerts) {
        // Calm, non-intrusive idle state: No red boxes on blank fields!
        this.clearFieldHighlights();
        if (checkBtn) checkBtn.style.display = 'inline-flex';

        if (this.aiDocumentReady) {
          this.badgeEl.className = 'eg-floating-badge eg-ai-ready';
          if (badgeStatus) badgeStatus.innerHTML = this.aiAutoFillMode
            ? `⚡ AI Ready • Click Auto-Fill`
            : `⚡ AI Ready • Click Check`;
        } else {
          this.badgeEl.className = 'eg-floating-badge eg-idle';
          if (badgeStatus) badgeStatus.textContent = this.aiAutoFillMode
            ? '🤖 AI Auto-Fill • Active'
            : '📋 Manual Guard • Click to Check';
        }

        if (drawerScore) {
          drawerScore.textContent = `Health: Ready to Audit`;
          drawerScore.className = 'eg-health-tag';
        }
      } else {
        // User clicked check button or submitted form -> show full audit results
        if (checkBtn) checkBtn.style.display = 'none';

        if (report.isReady) {
          this.clearFieldHighlights();
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

          // Only paint red field borders in AI Auto-Fill mode
          if (highlightFields) {
            this.syncFieldHighlights(report.issues.blocking);
          } else {
            this.clearFieldHighlights();
          }
        }
      }

      this.renderDrawerContent(report, showAlerts);

      if (options.openDrawer) {
        this.openDrawer();
      } else {
        this.updateFieldNavigator();
      }
    }

    syncFieldHighlights(issues = []) {
      const activeElements = new Set();

      for (const issue of issues) {
        // Never paint untouched empty fields red while the user is filling out the form!
        // Empty required field warnings should only appear when the user explicitly clicks "Check for Errors" or submits.
        if (issue.code === 'REQUIRED_FIELD_MISSING' && !this.userHasCheckedErrors) {
          continue;
        }

        let el = issue.element || null;
        if (!el && issue.elementId) el = document.getElementById(issue.elementId);
        if (!el && issue.field) el = document.querySelector(`[name="${issue.field}"], #${issue.field}`);

        if (el) {
          activeElements.add(el);
          this.highlightedElements.add(el);

          // Find existing tooltip or create a new one positioned directly below the input
          let tooltip = el.nextElementSibling && el.nextElementSibling.classList.contains('eg-inline-tooltip')
            ? el.nextElementSibling
            : null;

          if (!tooltip && (el.id || el.name)) {
            tooltip = document.querySelector(`.eg-inline-tooltip[data-for="${el.id || el.name}"]`);
          }

          const tooltipHtml = `⚠️ <strong>${issue.code}:</strong> ${issue.message}`;
          if (tooltip) {
            if (tooltip.innerHTML !== tooltipHtml) {
              tooltip.innerHTML = tooltipHtml;
            }
          } else {
            tooltip = document.createElement('div');
            tooltip.className = 'eg-inline-tooltip';
            if (el.id || el.name) tooltip.setAttribute('data-for', el.id || el.name);
            tooltip.innerHTML = tooltipHtml;

            // Place warning message directly below the input element (or dropzone if file input)
            const dropzone = (el.type === 'file' || el.tagName.toLowerCase() === 'input') ? el.closest('.upload-dropzone') : null;
            const target = dropzone || el;
            if (target.nextSibling) {
              target.parentNode.insertBefore(tooltip, target.nextSibling);
            } else if (target.parentNode) {
              target.parentNode.appendChild(tooltip);
            }
          }
        }
      }

      // Remove warning messages from elements that are no longer in error
      for (const el of Array.from(this.highlightedElements)) {
        if (!activeElements.has(el)) {
          el.classList.remove('eg-field-error');
          if (el.nextElementSibling && el.nextElementSibling.classList.contains('eg-inline-tooltip')) {
            el.nextElementSibling.remove();
          }
          if (el.id || el.name) {
            document.querySelectorAll(`.eg-inline-tooltip[data-for="${el.id || el.name}"]`).forEach(t => t.remove());
          }
          const dropzone = (el.type === 'file' || el.tagName?.toLowerCase() === 'input') ? el.closest('.upload-dropzone') : null;
          if (dropzone && dropzone.nextElementSibling && dropzone.nextElementSibling.classList.contains('eg-inline-tooltip')) {
            dropzone.nextElementSibling.remove();
          }
          this.highlightedElements.delete(el);
        }
      }
    }

    highlightField(issue) {
      this.syncFieldHighlights([issue]);
    }

    clearFieldHighlights() {
      document.querySelectorAll('.eg-field-error').forEach(el => {
        el.classList.remove('eg-field-error');
      });
      document.querySelectorAll('.eg-inline-tooltip').forEach(el => {
        el.remove();
      });
      this.highlightedElements.clear();
      this.hideWrongDocBanner();
      this.hideBlurRejectedBanner();
    }

    renderDrawerContent(report, showAlerts = true) {
      const body = document.getElementById('egDrawerBody');
      if (!body) return;

      // 1. AI Loading State in Drawer
      if (this.isAiProcessing) {
        body.innerHTML = `
          <div class="eg-status-banner eg-banner-ai-loading">
            <h4>⚡ AI Document Processing Active</h4>
            <p>${this.aiProgressMsg || 'Analyzing uploaded document with Gemini AI...'}</p>
          </div>
          <div class="eg-drawer-loading-box">
            <div class="eg-drawer-spinner-ring"></div>
            <h4 class="eg-drawer-loading-title">AI Document Analysis in Progress</h4>
            <p class="eg-drawer-loading-subtext">
              ${this.aiProgressMsg || 'Extracting structured details and matching against form fields...'}
            </p>
            <div class="eg-loading-bar-wrap">
              <div class="eg-loading-bar-fill" style="width: ${this.aiProgressPercent || 25}%;"></div>
            </div>
            <div class="eg-loading-percent">${this.aiProgressPercent || 25}% Complete</div>
            <div class="eg-loading-notice">
              💡 Pre-submission verification will update automatically as soon as AI analysis finishes.
            </div>
          </div>
        `;
        return;
      }

      // 2. Safe Standby State when No Form is Detected
      if (!report || report.hasForm === false) {
        body.innerHTML = `
          <div class="eg-status-banner eg-banner-idle">
            <h4>🛡️ Safe Standby Mode</h4>
            <p>No active form detected on this webpage.</p>
          </div>
          <div class="eg-drawer-standby-box">
            <div class="eg-standby-icon">📄🔍</div>
            <h4 class="eg-standby-title">No Form Detected</h4>
            <p class="eg-standby-desc">
              Error Guard is running safely in the background. When you open a webpage with an application or registration form, pre-submission audits and AI assistance will activate automatically.
            </p>
            <div class="eg-standby-tag">
              <span class="eg-pulse-dot"></span>
              Listening for form inputs...
            </div>
            <div style="margin-top: 20px;">
              <button type="button" class="eg-btn eg-btn-primary" id="egDrawerDemoPortalBtn" style="padding: 10px 16px; font-size: 0.88rem; border-radius: 8px; cursor: pointer; width: 100%; font-weight: 700;">
                🏛️ Open Demo Portal to Test
              </button>
            </div>
          </div>
        `;
        document.getElementById('egDrawerDemoPortalBtn')?.addEventListener('click', () => {
          window.open('http://localhost:3000', '_blank');
        });
        return;
      }

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
            ${report.checklist.document?.hasFileInput ? `
            <div class="eg-check-item ${report.checklist.document.uploaded ? (report.checklist.document.sizeValid && report.checklist.document.formatValid ? 'pass' : 'fail') : (report.checklist.document.required ? 'fail' : 'pending')}">
              <span>${report.checklist.document.uploaded ? (report.checklist.document.sizeValid && report.checklist.document.formatValid ? '✅' : '❌') : (report.checklist.document.required ? '❌' : '⏳')}</span>
              <span>${report.checklist.document.uploaded ? 'Document Size & Format' : (report.checklist.document.required ? 'Document Required' : 'Document Optional')}</span>
            </div>
            <div class="eg-check-item ${(report.checklist.verification.nameMatch === true || report.checklist.verification.dobMatch === true) ? 'pass' : (report.checklist.verification.nameMatch === false || report.checklist.verification.dobMatch === false ? 'fail' : 'pending')}">
              <span>${(report.checklist.verification.nameMatch === true || report.checklist.verification.dobMatch === true) ? '✅' : (report.checklist.verification.nameMatch === false || report.checklist.verification.dobMatch === false ? '❌' : '⏳')}</span>
              <span>Name & DOB Cross-Check</span>
            </div>
            ` : ''}
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

      if (!report.isReady) {
        html += `
          <div class="eg-override-card">
            <div class="eg-override-info">
              <strong>Form data is accurate?</strong>
              <p>If you have verified that your entered details are correct despite AI warnings, you can proceed with submission.</p>
            </div>
            <button type="button" class="eg-btn eg-btn-override" id="egDrawerProceedBtn" style="width: 100%; justify-content: center;">
              ⚠️ Proceed & Submit Anyway →
            </button>
          </div>
        `;
      }

      body.innerHTML = html;

      const drawerProceedBtn = body.querySelector('#egDrawerProceedBtn');
      if (drawerProceedBtn) {
        drawerProceedBtn.addEventListener('click', () => {
          this.closeDrawer();
          if (typeof this.onProceedSubmit === 'function') {
            this.onProceedSubmit();
          }
        });
      }

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
      if (!report || !report.issues || !report.issues.blocking || report.issues.blocking.length === 0) {
        return;
      }
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
        this.updateFieldNavigator();
      }
    }

    closeDrawer() {
      if (this.drawerEl) {
        this.drawerEl.classList.remove('eg-drawer-open');
        this.drawerEl.classList.add('eg-drawer-closed');
      }
    }

    // ─── Field Navigator (Jump to Next / Previous Field) ───
    getVisibleFormFields() {
      const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';
      const elements = Array.from(document.querySelectorAll(selector));

      return elements.filter(el => {
        // Exclude inputs inside Error Guard UI elements
        if (el.closest('#error-guard-drawer, #error-guard-badge, #error-guard-modal, #eg-autofill-banner, #eg-wrongdoc-banner, #eg-blur-banner, .eg-modal-overlay')) {
          return false;
        }
        // Exclude disabled elements (cannot receive user interaction/focus)
        if (el.disabled) {
          return false;
        }
        // Exclude hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        return (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
      });
    }

    getFieldLabel(el) {
      if (!el) return 'Input Field';

      // 1. label[for="id"]
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label && label.innerText.trim()) {
          return label.innerText.replace(/\*/g, '').replace(/[:]/g, '').trim();
        }
      }
      // 2. Parent label element
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.innerText.trim()) {
        return parentLabel.innerText.replace(/\*/g, '').replace(/[:]/g, '').trim();
      }
      // 3. Form group label or header
      const group = el.closest('.form-group, .form-row, .field-wrap, .form-field, .doc-upload-block');
      if (group) {
        const groupLabel = group.querySelector('label, .form-label, strong, .doc-label');
        if (groupLabel && groupLabel.innerText.trim()) {
          return groupLabel.innerText.replace(/\*/g, '').replace(/[:]/g, '').trim();
        }
      }
      // 4. aria-label or placeholder
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }
      if (el.placeholder && el.placeholder.trim()) {
        return el.placeholder.trim();
      }
      // 5. Semantic name or id
      if (el.name) {
        return el.name.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
      }
      if (el.id) {
        return el.id.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
      }
      return `${el.tagName.toLowerCase()} field`;
    }

    updateFieldNavigator() {
      const navEl = document.getElementById('egFieldNavigator');
      if (!navEl) return;

      const fields = this.getVisibleFormFields();
      const total = fields.length;
      const prevBtn = document.getElementById('egNavPrevBtn');
      const nextBtn = document.getElementById('egNavNextBtn');
      const labelEl = document.getElementById('egNavLabel');
      const counterEl = document.getElementById('egNavCounter');

      // Edge case: No input fields on page
      if (total === 0) {
        if (labelEl) labelEl.textContent = 'No Input Fields';
        if (counterEl) counterEl.textContent = '0 of 0 fields';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        this.currentNavIndex = -1;
        return;
      }

      // Edge case: Only 1 input field on page
      if (total === 1) {
        this.currentNavIndex = 0;
        const fieldName = this.getFieldLabel(fields[0]);
        if (labelEl) labelEl.textContent = fieldName;
        if (counterEl) counterEl.textContent = 'Field 1 of 1';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
      }

      // Ensure index is within range if active
      if (this.currentNavIndex >= total) {
        this.currentNavIndex = total - 1;
      }

      // No field currently selected yet
      if (this.currentNavIndex < 0) {
        if (labelEl) labelEl.textContent = 'Navigate Fields';
        if (counterEl) counterEl.textContent = `${total} fields on page`;
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = false;
        return;
      }

      // An active field is selected
      const currentEl = fields[this.currentNavIndex];
      const fieldName = this.getFieldLabel(currentEl);
      if (labelEl) labelEl.textContent = fieldName;
      if (counterEl) counterEl.textContent = `Field ${this.currentNavIndex + 1} of ${total}`;

      // Edge cases: First or Last input field
      if (prevBtn) {
        prevBtn.disabled = (this.currentNavIndex <= 0);
      }
      if (nextBtn) {
        nextBtn.disabled = (this.currentNavIndex >= total - 1);
      }
    }

    navigateNextField() {
      const fields = this.getVisibleFormFields();
      if (fields.length === 0) {
        this.updateFieldNavigator();
        return;
      }

      let targetIndex;
      if (this.currentNavIndex < 0) {
        targetIndex = 0;
      } else if (this.currentNavIndex < fields.length - 1) {
        targetIndex = this.currentNavIndex + 1;
      } else {
        // Edge case: Already at last field
        this.updateFieldNavigator();
        return;
      }

      this.navigateToField(targetIndex, fields);
    }

    navigatePreviousField() {
      const fields = this.getVisibleFormFields();
      if (fields.length === 0) {
        this.updateFieldNavigator();
        return;
      }

      let targetIndex;
      if (this.currentNavIndex > 0) {
        targetIndex = this.currentNavIndex - 1;
      } else {
        // Edge case: Already at first field
        this.updateFieldNavigator();
        return;
      }

      this.navigateToField(targetIndex, fields);
    }

    navigateToField(index, fieldsList = null) {
      const fields = fieldsList || this.getVisibleFormFields();
      if (index < 0 || index >= fields.length) return;

      this.currentNavIndex = index;
      const targetEl = fields[index];

      // Smooth scroll target field to center of viewport
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Focus field
      try {
        targetEl.focus({ preventScroll: true });
      } catch (e) {
        targetEl.focus();
      }

      // Temporary pulse animation highlight for clean visual feedback
      document.querySelectorAll('.eg-focused-field-pulse').forEach(el => el.classList.remove('eg-focused-field-pulse'));
      targetEl.classList.add('eg-focused-field-pulse');
      setTimeout(() => {
        targetEl.classList.remove('eg-focused-field-pulse');
      }, 1400);

      // Update sidebar navigator state
      this.updateFieldNavigator();
    }

    // ─── AI Auto-Fill & Auto-Correct In-Page Components ───
    showAutoFillBanner(docData, onApply, fieldMap = null) {
      this.hideAutoFillBanner();
      if (!docData || (!docData.name && !docData.dob && !docData.certificateNo)) return;

      const banner = document.createElement('div');
      banner.id = 'eg-autofill-banner';
      banner.className = 'eg-autofill-banner';

      const typeName = docData.docType === 'AADHAAR' ? 'Aadhaar Card' :
        docData.docType === 'PAN' ? 'PAN Card' :
          docData.docType === 'CASTE_CERTIFICATE' ? 'Caste Certificate' :
            docData.docType === 'INCOME_CERTIFICATE' ? 'Income Certificate' :
              docData.docType === 'MARKSHEET' ? 'Marksheet' : 'Official Document';

      // Human-readable labels and icons for each field key
      const FIELD_META = {
        fullName:      { label: 'Name',         icon: '👤' },
        fatherName:    { label: 'Father Name',   icon: '👨' },
        motherName:    { label: 'Mother Name',   icon: '👩' },
        dob:           { label: 'Date of Birth', icon: '📅' },
        gender:        { label: 'Gender',        icon: '⚧' },
        aadhaarNumber: { label: 'Aadhaar No.',   icon: '🆔' },
        panNumber:     { label: 'PAN',           icon: '💳' },
        certificateNo: { label: 'Certificate No.', icon: '📜' },
        phone:         { label: 'Mobile',        icon: '📞' },
        email:         { label: 'Email',         icon: '📧' },
        category:      { label: 'Category',      icon: '🏷️' }
      };

      // Fields to skip in the preview (optional/sensitive/not from doc)
      const SKIP_PREVIEW = new Set([
        'captchaInput', 'bankAccountNo', 'ifscCode',
        'alternatePhone', 'familyIncome', 'pwdStatus'
      ]);

      // Build tag HTML — dynamic from fieldMap if available, else legacy 3-field display
      let tagsHtml = '';
      if (fieldMap && typeof fieldMap === 'object') {
        for (const [key, value] of Object.entries(fieldMap)) {
          if (!value || SKIP_PREVIEW.has(key)) continue;
          const meta = FIELD_META[key];
          if (!meta) continue; // skip unmapped/unknown keys
          tagsHtml += `<span class="eg-autofill-tag">${meta.icon} ${meta.label}: <strong>${value}</strong></span>`;
        }
      } else {
        // Legacy fallback: only show name / dob / id
        if (docData.name)          tagsHtml += `<span class="eg-autofill-tag">👤 Name: <strong>${docData.name}</strong></span>`;
        if (docData.dob)           tagsHtml += `<span class="eg-autofill-tag">📅 DOB: <strong>${docData.dob}</strong></span>`;
        if (docData.certificateNo) tagsHtml += `<span class="eg-autofill-tag">🆔 ID: <strong>${docData.certificateNo}</strong></span>`;
      }

      const fieldCount = tagsHtml.split('eg-autofill-tag').length - 1;

      banner.innerHTML = `
        <div class="eg-autofill-header">
          <div class="eg-autofill-header-left">
            <span class="eg-autofill-sparkle">✨</span>
            <div>
              <strong class="eg-autofill-title">AI Detected ${typeName}</strong>
              <p class="eg-autofill-subtitle">${fieldCount} field${fieldCount !== 1 ? 's' : ''} ready to fill. Click to auto-fill form:</p>
            </div>
          </div>
          <button type="button" class="eg-banner-close" id="egCloseAutoFill">✕</button>
        </div>
        <div class="eg-autofill-tags">
          ${tagsHtml}
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

    showWrongDocBanner({ expectedType, actualType, fileInputEl, fileName, onReplace } = {}) {
      this.hideWrongDocBanner();
      this.hideAutoFillBanner();

      const banner = document.createElement('div');
      banner.id = 'eg-wrongdoc-banner';
      banner.className = 'eg-wrongdoc-banner';

      const formatDoc = (t) => {
        switch (t) {
          case 'AADHAAR': return 'Aadhaar Card';
          case 'PAN': return 'PAN Card';
          case 'CASTE_CERTIFICATE': return 'Caste Certificate';
          case 'INCOME_CERTIFICATE': return 'Income Certificate';
          case 'CERTIFICATE': return 'Official Certificate';
          case 'MARKSHEET': return 'Marksheet / Academic Memo';
          default: return t ? t.replace(/_/g, ' ') : 'Required Document';
        }
      };

      const expectedName = formatDoc(expectedType);
      const actualName = formatDoc(actualType);

      // Find field label or upload title if possible
      let slotTitle = '';
      if (fileInputEl) {
        if (fileInputEl.id) {
          const lbl = document.querySelector(`label[for="${fileInputEl.id}"]`);
          if (lbl) slotTitle = lbl.innerText.replace(/\*/g, '').trim();
        }
        if (!slotTitle) {
          const block = fileInputEl.closest('.doc-upload-block, .form-group');
          const header = block ? block.querySelector('.doc-label, label, strong') : null;
          if (header) slotTitle = header.innerText.replace(/\*/g, '').trim();
        }
      }
      if (!slotTitle) slotTitle = `${expectedName} Upload`;

      banner.innerHTML = `
        <div class="eg-wrongdoc-header">
          <div class="eg-wrongdoc-header-left">
            <span class="eg-wrongdoc-icon">🛑</span>
            <div>
              <strong class="eg-wrongdoc-title">Wrong Document Detected!</strong>
              <p class="eg-wrongdoc-subtitle">
                You uploaded an <strong>${actualName}</strong> into the slot for <strong>${slotTitle}</strong>.
              </p>
            </div>
          </div>
          <button type="button" class="eg-banner-close" id="egCloseWrongDoc" title="Close">✕</button>
        </div>
        <div class="eg-wrongdoc-body">
          ⚠️ <strong>Document Mismatch:</strong> This field specifically requires a valid <strong>${expectedName}</strong>. Submitting an incorrect document will cause your application to be rejected during verification.
        </div>
        <div class="eg-wrongdoc-footer">
          <button type="button" class="eg-btn-replace-doc" id="egReplaceDocBtn">
            🔄 Click to Upload ${expectedName}
          </button>
          <button type="button" class="eg-btn-dismiss-wrongdoc" id="egDismissWrongDoc">
            Dismiss
          </button>
        </div>
      `;

      document.body.appendChild(banner);

      const closeBtn = document.getElementById('egCloseWrongDoc');
      const dismissBtn = document.getElementById('egDismissWrongDoc');
      const replaceBtn = document.getElementById('egReplaceDocBtn');

      if (closeBtn) closeBtn.addEventListener('click', () => this.hideWrongDocBanner());
      if (dismissBtn) dismissBtn.addEventListener('click', () => this.hideWrongDocBanner());
      if (replaceBtn) {
        replaceBtn.addEventListener('click', () => {
          this.hideWrongDocBanner();
          if (typeof onReplace === 'function') {
            onReplace();
          } else if (fileInputEl) {
            fileInputEl.click();
          }
        });
      }
    }

    hideWrongDocBanner() {
      const existing = document.getElementById('eg-wrongdoc-banner');
      if (existing) existing.remove();
    }

    showBlurRejectedBanner({ fileInputEl, fileName, message, onReplace } = {}) {
      this.hideBlurRejectedBanner();
      this.hideWrongDocBanner();
      this.hideAutoFillBanner();

      const banner = document.createElement('div');
      banner.id = 'eg-blur-banner';
      banner.className = 'eg-wrongdoc-banner eg-blur-banner';

      let slotTitle = '';
      if (fileInputEl) {
        if (fileInputEl.id) {
          const lbl = document.querySelector(`label[for="${fileInputEl.id}"]`);
          if (lbl) slotTitle = lbl.innerText.replace(/\*/g, '').trim();
        }
        if (!slotTitle) {
          const block = fileInputEl.closest('.doc-upload-block, .form-group');
          const header = block ? block.querySelector('.doc-label, label, strong') : null;
          if (header) slotTitle = header.innerText.replace(/\*/g, '').trim();
        }
      }
      if (!slotTitle) slotTitle = 'Document';

      banner.innerHTML = `
        <div class="eg-wrongdoc-header">
          <div class="eg-wrongdoc-header-left">
            <span class="eg-wrongdoc-icon">🔍❌</span>
            <div>
              <strong class="eg-wrongdoc-title" style="color: #dc2626;">Document Rejected — Blurry / Unreadable!</strong>
              <p class="eg-wrongdoc-subtitle">
                The file uploaded for <strong>${slotTitle}</strong> (<em>${fileName || 'document'}</em>) is out of focus or blurred.
              </p>
            </div>
          </div>
          <button type="button" class="eg-banner-close" id="egCloseBlurDoc" title="Close">✕</button>
        </div>
        <div class="eg-wrongdoc-body" style="border-left: 4px solid #dc2626; background: #fef2f2; color: #991b1b; padding: 12px 14px; border-radius: 6px; margin: 10px 0; font-size: 0.88rem; line-height: 1.5;">
          🚫 <strong>Document Not Accepted:</strong> Government portals require official certificate scans to be sharp and fully legible for verification.<br>
          💡 <strong>Action Required:</strong> ${message || 'Please upload a clear, sharp, well-lit scan or photo.'}
        </div>
        <div class="eg-wrongdoc-footer">
          <button type="button" class="eg-btn-replace-doc" id="egReplaceBlurDocBtn" style="background: #dc2626; color: #ffffff;">
            🔄 Upload a Clear, Sharp Document
          </button>
          <button type="button" class="eg-btn-dismiss-wrongdoc" id="egDismissBlurDoc">
            Dismiss
          </button>
        </div>
      `;

      document.body.appendChild(banner);

      const closeBtn = document.getElementById('egCloseBlurDoc');
      const dismissBtn = document.getElementById('egDismissBlurDoc');
      const replaceBtn = document.getElementById('egReplaceBlurDocBtn');

      if (closeBtn) closeBtn.addEventListener('click', () => this.hideBlurRejectedBanner());
      if (dismissBtn) dismissBtn.addEventListener('click', () => this.hideBlurRejectedBanner());
      if (replaceBtn) {
        replaceBtn.addEventListener('click', () => {
          this.hideBlurRejectedBanner();
          if (typeof onReplace === 'function') {
            onReplace();
          } else if (fileInputEl) {
            fileInputEl.click();
          }
        });
      }
    }

    hideBlurRejectedBanner() {
      const existing = document.getElementById('eg-blur-banner');
      if (existing) existing.remove();
    }

    showAutoCorrectChip(fieldElement, correctValue, onApply) {
      if (!fieldElement || !correctValue) return;

      const parent = fieldElement.parentElement || fieldElement.closest('.form-group') || fieldElement;
      const existingChip = parent.querySelector('.eg-autocorrect-chip');
      if (existingChip) {
        if (existingChip.dataset.val === correctValue) return;
        existingChip.remove();
      }

      const chip = document.createElement('div');
      chip.className = 'eg-autocorrect-chip';
      chip.dataset.val = correctValue;
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
