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
    extractedDocData = DocumentParser.parse(ocrResult.text);
    extractedDocData.ocrConfidence = ocrResult.confidence;
    Logger.info('ContentScript', 'Extracted document data', {
      hasName: !!extractedDocData.name,
      hasDob: !!extractedDocData.dob,
      hasCertNo: !!extractedDocData.certificateNo
    });

    // 5. Re-run complete evaluation with newly extracted document data
    await runEvaluation(fileIssues, qualityIssues);
  }

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

      // Check A: Full Name Cross Check
      if (crossChecks.verifyName && formData.full_name && extractedDocData.name) {
        const nameComparison = Matcher.compareNames(formData.full_name, extractedDocData.name);
        if (!nameComparison.match) {
          const isReview = nameComparison.decision === 'REVIEW';
          crossCheckIssues.push({
            code: 'NAME_MISMATCH',
            field: 'FULL_NAME',
            severity: isReview ? 'WARNING' : 'BLOCKING',
            message: isReview
              ? `Possible name spelling difference: Form says "${formData.full_name}", document says "${extractedDocData.name}".`
              : `Name mismatch: Form specifies "${formData.full_name}", but certificate shows "${extractedDocData.name}".`,
            formValue: formData.full_name,
            documentValue: extractedDocData.name,
            score: nameComparison.score,
            fix: 'Ensure your entered name matches the spelling on your certificate exactly.'
          });
        }
      }

      // Check B: Date of Birth Cross Check
      if (crossChecks.verifyDob && formData.dob && extractedDocData.dob) {
        const dobComparison = Matcher.compareDob(formData.dob, extractedDocData.dob);
        if (!dobComparison.match) {
          crossCheckIssues.push({
            code: 'DOB_MISMATCH',
            field: 'DOB',
            severity: 'BLOCKING',
            message: dobComparison.reason,
            formValue: formData.dob,
            documentValue: extractedDocData.dob,
            fix: 'Check the date of birth on your original certificate and correct the form.'
          });
        }
      }

      // Check C: Certificate Number Cross Check
      if (crossChecks.verifyCertificateNo && formData.certificate_no && extractedDocData.certificateNo) {
        const certComp = Matcher.compareIdentifier(formData.certificate_no, extractedDocData.certificateNo);
        if (!certComp.match) {
          crossCheckIssues.push({
            code: 'IDENTIFIER_MISMATCH',
            field: 'CERTIFICATE_NUMBER',
            severity: 'BLOCKING',
            message: `Certificate number mismatch: Form has "${formData.certificate_no}", document shows "${extractedDocData.certificateNo}".`,
            fix: 'Double check the certificate number on the document.'
          });
        }
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
