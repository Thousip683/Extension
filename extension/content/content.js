/**
 * Main Content Script Orchestrator
 * Connects detector, validators, file watcher, OCR pipeline, matcher,
 * submission guard interceptor, and overlay UI.
 */

(function () {
  const {
    Logger,
    Normalize,
    Storage,
    RuleEngine,
    Detector,
    FormValidator,
    FileValidator,
    ImageQuality,
    OcrEngine,
    DocumentParser,
    Matcher,
    ErrorEngine,
    Overlay
  } = window.ErrorGuard;

  let currentFile = null;
  let extractedDocData = null;
  let latestReport = null;
  let debounceTimer = null;

  async function init() {
    Logger.info('ContentScript', 'Pre-Submission Error Guard initializing on page...');

    // 1. Initialize Portal Profile
    const profile = await RuleEngine.init();
    Logger.info('ContentScript', `Loaded rules profile: ${profile.name}`);

    // 2. Initialize In-Page UI Overlay
    Overlay.init();

    // 3. Initial Scan and Listener Attachments
    runEvaluation();
    attachListeners();

    // 4. Listen for Extension Popup Messages
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_STATUS') {
          sendResponse(latestReport);
        } else if (request.action === 'TRIGGER_RESCAN') {
          runEvaluation().then(rep => sendResponse(rep));
          return true; // async
        }
      });
    }
  }

  function attachListeners() {
    // Monitor form input events
    document.addEventListener('input', handleFieldInput, true);
    document.addEventListener('change', handleFieldChange, true);

    // Submission Guard: Capture submit events at the window level (capturing phase)
    window.addEventListener('submit', handleFormSubmit, true);
    window.addEventListener('click', handleSubmitButtonClick, true);

    // MutationObserver to detect dynamically inserted form fields
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runEvaluation(), 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleFieldInput(e) {
    const target = e.target;
    if (target.matches('input, select, textarea')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runEvaluation(), 250);
    }
  }

  async function handleFieldChange(e) {
    const target = e.target;
    if (target.type === 'file') {
      if (target.files && target.files[0]) {
        currentFile = target.files[0];
        Logger.info('ContentScript', `File selected: ${target.files[0].name} (${target.files[0].size} bytes)`);
        await processUploadedFile(currentFile);
      } else {
        currentFile = null;
        extractedDocData = null;
        await runEvaluation();
      }
    } else if (target.matches('input, select, textarea')) {
      await runEvaluation();
    }
  }

  async function processUploadedFile(file) {
    const fileRules = RuleEngine.getFileRules();

    // 1. Fast File Validation (Size, MIME, Extension)
    const fileIssues = FileValidator.validate(file, fileRules);

    // 2. Image Quality & Blur Checks (Canvas API)
    const qualityIssues = await ImageQuality.analyze(file, fileRules);

    // 3. Asynchronous OCR Pipeline
    let ocrResult = { text: '', confidence: 0 };
    try {
      ocrResult = await OcrEngine.extractText(file, (percent, msg) => {
        const badgeStatus = document.getElementById('egBadgeStatus');
        if (badgeStatus) {
          badgeStatus.textContent = `OCR: ${percent}%`;
        }
      });
    } catch (err) {
      Logger.warn('ContentScript', 'OCR extraction issue', err);
    }

    // 4. Structured Document Parsing
    extractedDocData = DocumentParser.parse(ocrResult.text, ocrResult.aiData);
    extractedDocData.ocrConfidence = ocrResult.confidence;

    // ── Log Full OCR and Parsed Output to Browser Console ──
    console.log('================== [ErrorGuard OCR] RAW TEXT START ==================');
    console.log(ocrResult.text || '(No text extracted)');
    console.log('================== [ErrorGuard OCR] RAW TEXT END ====================');
    console.log('[ErrorGuard] Parsed Document Structure:', extractedDocData);

    Logger.info('ContentScript', 'Extracted document data summary:', {
      detectedName: extractedDocData.name || '(none)',
      detectedDob: extractedDocData.dob || '(none)',
      detectedAadhaar: extractedDocData.aadhaarNo || '(none)',
      detectedCertNo: extractedDocData.certificateNo || '(none)',
      docType: extractedDocData.docType
    });

    // 5. Re-run complete evaluation with newly extracted document data
    await runEvaluation(fileIssues, qualityIssues);
  }

  // Expose global re-evaluation trigger for manual refresh
  window.ErrorGuard.reEvaluate = async function() {
    Logger.info('ContentScript', 'Manual re-scan triggered by user.');
    return await runEvaluation();
  };

  async function runEvaluation(cachedFileIssues = null, cachedQualityIssues = null) {
    const scanResult = Detector.scan();
    const profile = RuleEngine.getProfile();
    const fileRules = RuleEngine.getFileRules();

    // Extract Form Key-Value Map
    const formData = {};
    let hasFileInput = false;
    for (const item of scanResult.fields) {
      if (item.semantic) {
        if (item.semantic.type === 'FULL_NAME') formData.full_name = item.value;
        if (item.semantic.type === 'DOB') formData.dob = item.value;
        if (item.semantic.type === 'CERTIFICATE_NUMBER') formData.certificate_no = item.value;
        if (item.semantic.type === 'DECLARATION') formData.declaration = item.field.checked;
        if (item.semantic.type === 'FILE_UPLOAD') {
          hasFileInput = true;
          if (item.field.files && item.field.files[0]) {
            currentFile = item.field.files[0];
          }
        }
      }
    }
    formData.hasFile = !!currentFile;

    // 1. Form Level Validation
    const formIssues = FormValidator.validate(scanResult.fields, profile);

    // 2. File Level Validation
    let fileIssues = [];
    let qualityIssues = [];
    if (currentFile) {
      fileIssues = cachedFileIssues || FileValidator.validate(currentFile, fileRules);
      qualityIssues = cachedQualityIssues || await ImageQuality.analyze(currentFile, fileRules);
    }

    // 3. Form <-> Document Cross Verification
    const crossCheckIssues = [];
    if (currentFile && extractedDocData) {
      const crossChecks = RuleEngine.getCrossChecks();
      const rawText = extractedDocData.raw || '';
      const hasRecognizedText = rawText.trim().length >= 10;

      // Check A: Full Name Cross Check
      if (crossChecks.verifyName && formData.full_name) {
        if (extractedDocData.name) {
          const nameComparison = Matcher.compareNames(formData.full_name, extractedDocData.name);
          if (!nameComparison.match) {
            // Also check if form name is elsewhere in document before flagging
            const fullTextSearch = Matcher.searchNameInDocument(formData.full_name, rawText, extractedDocData.lines);
            if (!fullTextSearch.match) {
              const isReview = nameComparison.decision === 'REVIEW' || fullTextSearch.decision === 'REVIEW';
              crossCheckIssues.push({
                code: 'NAME_MISMATCH',
                field: 'FULL_NAME',
                severity: isReview ? 'WARNING' : 'BLOCKING',
                message: isReview
                  ? `Possible name spelling difference: Form says "${formData.full_name}", document shows "${extractedDocData.name}".`
                  : `Name mismatch: Form specifies "${formData.full_name}", but certificate/ID shows "${extractedDocData.name}".`,
                formValue: formData.full_name,
                documentValue: extractedDocData.name,
                score: nameComparison.score || fullTextSearch.score,
                fix: 'Ensure your entered name matches the spelling on your certificate or ID card exactly.'
              });
            }
          }
        } else if (hasRecognizedText) {
          // No explicit name field detected, search full text
          const fullTextSearch = Matcher.searchNameInDocument(formData.full_name, rawText, extractedDocData.lines);
          if (!fullTextSearch.match) {
            const isReview = fullTextSearch.decision === 'REVIEW';
            crossCheckIssues.push({
              code: 'NAME_MISMATCH',
              field: 'FULL_NAME',
              severity: isReview ? 'WARNING' : 'BLOCKING',
              message: isReview
                ? `Possible name spelling difference: Form says "${formData.full_name}", nearest document text says "${fullTextSearch.matchedLine || ''}".`
                : `Name mismatch: Applicant name "${formData.full_name}" was not found on the uploaded document.`,
              formValue: formData.full_name,
              documentValue: fullTextSearch.matchedLine || null,
              score: fullTextSearch.score,
              fix: 'Upload the document belonging to the applicant or correct the name in the form.'
            });
          }
        }
      }

      // Check B: Date of Birth Cross Check
      if (crossChecks.verifyDob && formData.dob) {
        if (extractedDocData.dob) {
          const dobComparison = Matcher.compareDob(formData.dob, extractedDocData.dob);
          if (!dobComparison.match) {
            // Check if form DOB is elsewhere in raw text
            const dobSearch = Matcher.searchDobInDocument(formData.dob, rawText);
            if (!dobSearch.match) {
              crossCheckIssues.push({
                code: 'DOB_MISMATCH',
                field: 'DOB',
                severity: 'BLOCKING',
                message: dobComparison.reason,
                formValue: formData.dob,
                documentValue: extractedDocData.dob,
                fix: 'Check the date of birth on your original certificate/ID card and correct the form.'
              });
            }
          }
        } else if (hasRecognizedText) {
          const dobSearch = Matcher.searchDobInDocument(formData.dob, rawText);
          if (!dobSearch.match) {
            crossCheckIssues.push({
              code: 'DOB_MISMATCH',
              field: 'DOB',
              severity: 'BLOCKING',
              message: dobSearch.reason,
              formValue: formData.dob,
              documentValue: null,
              fix: 'Verify the date of birth on the uploaded document.'
            });
          }
        }
      }

      // Check C: Certificate / ID Number Cross Check
      if (crossChecks.verifyCertificateNo && formData.certificate_no) {
        const docId = extractedDocData.certificateNo || extractedDocData.aadhaarNo || extractedDocData.panNo;
        if (docId) {
          const certComp = Matcher.compareIdentifier(formData.certificate_no, docId);
          if (!certComp.match) {
            // Check if normalized ID exists in full text
            const normFormId = Normalize.identifier(formData.certificate_no);
            const normRaw = Normalize.identifier(rawText);
            if (!normRaw.includes(normFormId)) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: 'CERTIFICATE_NUMBER',
                severity: 'BLOCKING',
                message: `Identifier mismatch: Form has "${formData.certificate_no}", document shows "${docId}".`,
                fix: 'Double check the certificate or ID number on the document.'
              });
            }
          }
        } else if (hasRecognizedText) {
          const normFormId = Normalize.identifier(formData.certificate_no);
          const normRaw = Normalize.identifier(rawText);
          if (!normRaw.includes(normFormId)) {
            crossCheckIssues.push({
              code: 'IDENTIFIER_MISMATCH',
              field: 'CERTIFICATE_NUMBER',
              severity: 'BLOCKING',
              message: `Certificate/ID number "${formData.certificate_no}" was not found on the uploaded document.`,
              fix: 'Double check the document number entered in the form.'
            });
          }
        }
      }

      // Check D: Unreadable Document Check
      if (currentFile.type && currentFile.type.startsWith('image/') && rawText.trim().length < 5) {
        qualityIssues.push({
          code: 'DOCUMENT_LOW_QUALITY',
          severity: 'WARNING',
          message: 'Could not extract text clearly from this document. Please ensure the scan is clear, well-lit, and in focus.',
          fix: 'Upload a clearer or higher-resolution scan of your official document.'
        });
      }
    }

    // 4. Aggregate via Error Engine
    latestReport = ErrorEngine.aggregate({
      formIssues,
      fileIssues,
      qualityIssues,
      crossCheckIssues,
      extractedData: extractedDocData,
      formData
    });

    // 5. Update In-Page UI Overlay
    Overlay.update(latestReport);

    // 6. Persist to Chrome Storage for Popup
    await Storage.set('ACTIVE_GUARD_REPORT', latestReport);

    return latestReport;
  }

  // Pre-Submission Interceptor
  async function handleFormSubmit(e) {
    // Run evaluation right before submitting
    const report = await runEvaluation();

    if (!report.isReady) {
      Logger.warn('SubmissionGuard', 'Blocked form submission due to blocking errors', report.issues.blocking);
      e.preventDefault();
      e.stopImmediatePropagation();
      Overlay.showPreSubmitModal(report);
      return false;
    }

    Logger.info('SubmissionGuard', 'Submission allowed: all checks passed.');
    return true;
  }

  async function handleSubmitButtonClick(e) {
    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;

    const btnText = (btn.textContent || btn.value || '').toLowerCase();
    if (btn.type === 'submit' || btnText.includes('submit') || btnText.includes('apply')) {
      const report = await runEvaluation();
      if (!report.isReady) {
        Logger.warn('SubmissionGuard', 'Blocked submit button click', report.issues.blocking);
        e.preventDefault();
        e.stopImmediatePropagation();
        Overlay.showPreSubmitModal(report);
      }
    }
  }

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
