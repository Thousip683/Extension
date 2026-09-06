/**
 * Popup Dashboard Controller
 * Reads validation state from storage/content-script and renders the applicant health overview.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const scoreText = document.getElementById('scoreText');
  const circleProgress = document.getElementById('circleProgress');
  const statusPill = document.getElementById('statusPill');
  const statusHeadline = document.getElementById('statusHeadline');
  const statusDesc = document.getElementById('statusDesc');
  const refreshBtn = document.getElementById('refreshBtn');

  // Checklist row elements
  const chkForm = document.getElementById('chkForm');
  const chkDocUploaded = document.getElementById('chkDocUploaded');
  const chkDocSize = document.getElementById('chkDocSize');
  const chkNameMatch = document.getElementById('chkNameMatch');
  const chkDobMatch = document.getElementById('chkDobMatch');

  // Issues elements
  const issuesContainer = document.getElementById('issuesContainer');
  const issuesCountBadge = document.getElementById('issuesCountBadge');

  async function loadStatus() {
    // 1. Try reading from chrome.storage.local
    let report = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      report = await new Promise(r => chrome.storage.local.get(['ACTIVE_GUARD_REPORT'], res => r(res ? res.ACTIVE_GUARD_REPORT : null)));
    }

    // 2. Also query active tab for latest state
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATUS' }, (liveReport) => {
            if (chrome.runtime.lastError) {
              console.log('Tab message error', chrome.runtime.lastError.message);
            }
            if (liveReport) {
              renderReport(liveReport);
            } else if (report) {
              renderReport(report);
            } else {
              renderEmptyState();
            }
          });
        } else if (report) {
          renderReport(report);
        } else {
          renderEmptyState();
        }
      });
    } else if (report) {
      renderReport(report);
    } else {
      renderEmptyState();
    }
  }

  function renderReport(report) {
    if (!report) return renderEmptyState();

    const { isReady, healthScore, issues, checklist } = report;

    // 1. Health Score Gauge
    scoreText.textContent = `${healthScore}%`;
    circleProgress.setAttribute('stroke-dasharray', `${healthScore}, 100`);
    circleProgress.className = `circle ${isReady ? 'ready' : 'not-ready'}`;

    // 2. Status Pill & Headline
    if (isReady) {
      statusPill.textContent = 'READY TO SUBMIT';
      statusPill.className = 'hero-status-pill pill-ready';
      statusHeadline.textContent = 'Application Ready';
      statusDesc.textContent = 'All mandatory fields, documents, and identity checks have passed.';
    } else {
      const blockingCount = issues.blocking ? issues.blocking.length : 0;
      statusPill.textContent = `${blockingCount} ACTION REQUIRED`;
      statusPill.className = 'hero-status-pill pill-not-ready';
      statusHeadline.textContent = 'Application Not Ready';
      statusDesc.textContent = `${blockingCount} critical issue(s) will block successful submission.`;
    }

    // 3. Checklist Items
    if (checklist) {
      updateCheckItem(chkForm, checklist.form?.valid);
      updateCheckItem(chkDocUploaded, checklist.document?.uploaded);
      updateCheckItem(chkDocSize, checklist.document?.sizeValid);
      updateCheckItem(chkNameMatch, checklist.verification?.nameMatch);
      updateCheckItem(chkDobMatch, checklist.verification?.dobMatch);
    }

    // 4. Issues List
    const allIssues = issues?.all || [];
    issuesCountBadge.textContent = allIssues.length;

    if (allIssues.length === 0) {
      issuesContainer.innerHTML = `
        <div class="empty-issues">
          <span class="empty-icon">🎉</span>
          <p>No issues detected! Your application is in full compliance with portal rules.</p>
        </div>
      `;
    } else {
      let issuesHtml = '';
      for (const issue of allIssues) {
        const isBlocking = issue.severity === 'BLOCKING';
        issuesHtml += `
          <div class="popup-issue-card ${isBlocking ? 'popup-issue-blocking' : 'popup-issue-warning'}">
            <div class="issue-top">
              <span class="issue-sev">${isBlocking ? '🛑 BLOCKING' : '⚠️ WARNING'}</span>
              <span class="issue-code">${issue.code}</span>
            </div>
            <p class="issue-msg">${issue.message}</p>
            ${issue.fix ? `<div class="issue-fix">💡 Fix: ${issue.fix}</div>` : ''}
          </div>
        `;
      }
      issuesContainer.innerHTML = issuesHtml;
    }
  }

  function updateCheckItem(element, state) {
    if (!element) return;
    const icon = element.querySelector('.chk-icon');
    if (state === true) {
      icon.textContent = '✅';
      element.style.color = '#4ade80';
    } else if (state === false) {
      icon.textContent = '❌';
      element.style.color = '#f87171';
    } else {
      icon.textContent = '⚪';
      element.style.color = '#94a3b8';
    }
  }

  function renderEmptyState() {
    scoreText.textContent = '--%';
    circleProgress.setAttribute('stroke-dasharray', '0, 100');
    statusPill.textContent = 'NO ACTIVE FORM';
    statusHeadline.textContent = 'Standby Mode';
    statusDesc.textContent = 'Navigate to a supported portal or open the scholarship demo portal to scan.';
    issuesContainer.innerHTML = `
      <div class="empty-issues">
        <span class="empty-icon">🛡️</span>
        <p>Open the demo application portal to begin automated pre-submission checking.</p>
      </div>
    `;
  }

  // Refresh / Rescan Button
  refreshBtn.addEventListener('click', () => {
    refreshBtn.style.transform = 'rotate(180deg)';
    setTimeout(() => refreshBtn.style.transform = '', 300);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'TRIGGER_RESCAN' }, (report) => {
            if (report) renderReport(report);
          });
        }
      });
    }
  });

  // ─── AI Vision Settings Controller (Safely guarded if card is present) ───
  const apiKeyInput = document.getElementById('geminiApiKeyInput');
  const toggleKeyBtn = document.getElementById('toggleKeyVisibility');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const removeKeyBtn = document.getElementById('removeKeyBtn');
  const aiStatusPill = document.getElementById('aiStatusPill');
  const aiKeyFeedback = document.getElementById('aiKeyFeedback');

  if (apiKeyInput && toggleKeyBtn && saveKeyBtn && removeKeyBtn) {
    function showAiFeedback(msg, type = 'success') {
      if (!aiKeyFeedback) return;
      aiKeyFeedback.textContent = msg;
      aiKeyFeedback.className = `ai-feedback ${type}`;
      aiKeyFeedback.classList.remove('hidden');
      setTimeout(() => {
        aiKeyFeedback.classList.add('hidden');
      }, 4000);
    }

    async function loadAiSettings() {
      let key = '';
      if (window.ErrorGuard && window.ErrorGuard.Storage) {
        key = await window.ErrorGuard.Storage.getGoogleApiKey();
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await new Promise(r => chrome.storage.local.get(['google_gemini_api_key'], r));
        key = res?.google_gemini_api_key || '';
      }

      if (key && key.trim()) {
        apiKeyInput.value = key.trim();
        if (aiStatusPill) {
          aiStatusPill.textContent = '🟢 Gemini Active';
          aiStatusPill.className = 'ai-status-pill pill-active';
        }
      } else {
        apiKeyInput.value = '';
        if (aiStatusPill) {
          aiStatusPill.textContent = 'Offline Mode';
          aiStatusPill.className = 'ai-status-pill pill-offline';
        }
      }
    }

    // Toggle Visibility
    toggleKeyBtn.addEventListener('click', () => {
      apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
      toggleKeyBtn.textContent = apiKeyInput.type === 'password' ? '👁️' : '🔒';
    });

    // Save & Test Key
    saveKeyBtn.addEventListener('click', async () => {
      const rawVal = apiKeyInput.value.trim();
      if (!rawVal) {
        showAiFeedback('Please enter an API key.', 'error');
        return;
      }

      saveKeyBtn.disabled = true;
      saveKeyBtn.textContent = 'Testing...';

      try {
        let testRes = { valid: true };
        if (window.ErrorGuard && window.ErrorGuard.GoogleVision) {
          testRes = await window.ErrorGuard.GoogleVision.testApiKey(rawVal);
        }

        if (testRes.valid) {
          if (window.ErrorGuard && window.ErrorGuard.Storage) {
            await window.ErrorGuard.Storage.setGoogleApiKey(rawVal);
          } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await new Promise(r => chrome.storage.local.set({ google_gemini_api_key: rawVal }, r));
          }

          if (aiStatusPill) {
            aiStatusPill.textContent = '🟢 Gemini Active';
            aiStatusPill.className = 'ai-status-pill pill-active';
          }
          showAiFeedback('✅ Google Gemini Vision connected & saved!', 'success');
        } else {
          showAiFeedback(`❌ Invalid Key: ${testRes.message}`, 'error');
        }
      } catch (err) {
        showAiFeedback(`Error: ${err.message}`, 'error');
      } finally {
        saveKeyBtn.disabled = false;
        saveKeyBtn.textContent = '⚡ Connect & Save';
      }
    });

    // Remove Key
    removeKeyBtn.addEventListener('click', async () => {
      if (window.ErrorGuard && window.ErrorGuard.Storage) {
        await window.ErrorGuard.Storage.removeGoogleApiKey();
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise(r => chrome.storage.local.remove(['google_gemini_api_key'], r));
      }

      apiKeyInput.value = '';
      if (aiStatusPill) {
        aiStatusPill.textContent = 'Offline Mode';
        aiStatusPill.className = 'ai-status-pill pill-offline';
      }
      showAiFeedback('API key removed. Using offline Tesseract OCR.', 'success');
    });

    loadAiSettings();
  }

  // Initial load
  loadStatus();
});
