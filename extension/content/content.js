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
  let activeAiFieldMap = null; // Ground truth { fieldKey: value } from Gemini API
  let latestReport = null;
  let debounceTimer = null;
  let userHasCheckedErrors = false;
  let aiAutoFillMode = false; // false = Manual Guard (default), true = AI Auto-Fill
  let activeAiPromise = null; // Active document AI analysis promise
  let bypassSubmissionGuard = false; // User override flag to proceed and submit
  let pendingSubmissionTarget = { form: null, submitBtn: null }; // Remembered form and submit button for bypass execution
  const uploadedDocsState = new Map(); // fileInputEl -> { file, expectedType, actualType, isMismatch, extractedDocData, aiFieldMap }

  /**
   * Evaluates whether an interactive application form exists on this webpage.
   * Accurately filters out search bars, navigation inputs, and generic sites like GitHub, Wikipedia, etc.
   */
  function isFormPresent(scanResult) {
    if (!scanResult) return false;
    const fields = scanResult.fields || [];

    // Filter out non-application controls (search bars, header/nav inputs, filters, buttons)
    const applicationFields = fields.filter(f => {
      const el = f.field;
      if (!el) return false;

      const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'search'].includes(type)) return false;

      // Ignore inputs inside header, nav, or search containers
      if (el.closest('header, nav, [role="search"], [role="navigation"], .header, .nav, .search, #search')) {
        return false;
      }

      // Ignore search, filter, and quick navigation inputs
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const combined = `${name} ${id} ${placeholder} ${ariaLabel}`;

      if (
        combined.includes('search') ||
        combined.includes('query') ||
        combined.includes('filter') ||
        combined.includes('jump to') ||
        combined.includes('go to') ||
        combined.includes('find')
      ) {
        return false;
      }

      return true;
    });

    if (applicationFields.length === 0) {
      return false;
    }

    // 1. A file upload input (certificates, IDs, documents)
    const hasFileUpload = applicationFields.some(f => {
      const el = f.field;
      return el && (el.type === 'file' || f.semantic?.type === 'FILE_UPLOAD');
    });
    if (hasFileUpload) return true;

    // 2. Core identity / official form fields (Name, DOB, Aadhaar, PAN, Certificate No, Declaration)
    const CORE_IDENTITY_TYPES = new Set([
      'FULL_NAME', 'DOB', 'CERTIFICATE_NUMBER', 'AADHAAR_NUMBER', 'PAN_NUMBER', 'DECLARATION'
    ]);
    const hasCoreIdentityField = applicationFields.some(f => f.semantic && CORE_IDENTITY_TYPES.has(f.semantic.type));
    if (hasCoreIdentityField) return true;

    // 3. At least 2 distinct semantic application fields (e.g. Email + Phone)
    const semanticTypes = new Set(
      applicationFields
        .filter(f => f.semantic && f.semantic.type)
        .map(f => f.semantic.type)
    );
    if (semanticTypes.size >= 2) return true;

    // 4. A form with an explicit application submission button and >= 3 fillable fields
    const forms = scanResult.forms || [];
    const submitButtons = scanResult.submitButtons || [];
    if (forms.length > 0 && submitButtons.length > 0 && applicationFields.length >= 3) {
      return true;
    }

    return false;
  }

  async function init() {
    Logger.info('ContentScript', 'Pre-Submission Error Guard initializing on page...');

    // 1. Initialize Portal Profile
    const profile = await RuleEngine.init();
    Logger.info('ContentScript', `Loaded rules profile: ${profile.name}`);

    // 2. Load persisted mode setting from storage
    aiAutoFillMode = await Storage.getAiAutoFillMode();
    Overlay.init();
    Overlay.setMode(aiAutoFillMode);
    Overlay.setOnProceedSubmit(() => {
      Logger.info('SubmissionGuard', 'User explicitly clicked Proceed & Submit Anyway. Bypassing Error Guard.');
      bypassSubmissionGuard = true;

      const targetBtn = pendingSubmissionTarget.submitBtn;
      const targetForm = pendingSubmissionTarget.form || (targetBtn ? targetBtn.closest('form') : null) || document.querySelector('form');

      if (targetBtn && typeof targetBtn.click === 'function') {
        targetBtn.click();
      } else if (targetForm) {
        if (typeof targetForm.requestSubmit === 'function') {
          targetForm.requestSubmit();
        } else {
          targetForm.submit();
        }
      }
    });
    Logger.info('ContentScript', `Mode loaded: ${aiAutoFillMode ? 'AI Auto-Fill' : 'Manual Guard'}`);

    // 3. Initial Scan and Listener Attachments (Silent evaluation - do NOT show red alerts on blank form)
    runEvaluation({ showAlerts: false });
    attachListeners();

    // 4. Listen for Extension Popup Messages
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_STATUS') {
          sendResponse(latestReport);
        } else if (request.action === 'TRIGGER_RESCAN') {
          userHasCheckedErrors = true;
          runEvaluation({ showAlerts: true }).then(rep => sendResponse(rep));
          return true; // async
        } else if (request.action === 'SET_MODE') {
          // Popup toggled the mode – apply immediately
          aiAutoFillMode = !!request.aiAutoFillMode;
          Overlay.setMode(aiAutoFillMode);
          Logger.info('ContentScript', `Mode changed to: ${aiAutoFillMode ? 'AI Auto-Fill' : 'Manual Guard'}`);
          // Re-run evaluation so badge/drawer reflect new mode immediately
          runEvaluation({ showAlerts: userHasCheckedErrors });
          sendResponse({ ok: true });
        }
      });
    }

    // 5. Also listen to chrome.storage changes so mode updates even if popup closed quickly
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.EG_AI_AUTOFILL_MODE !== undefined) {
          aiAutoFillMode = !!changes.EG_AI_AUTOFILL_MODE.newValue;
          Overlay.setMode(aiAutoFillMode);
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

    // MutationObserver to detect dynamically inserted form fields (ignoring ErrorGuard's own UI elements)
    const observer = new MutationObserver((mutations) => {
      let hasFormChanges = false;
      for (const m of mutations) {
        // Skip mutations inside ErrorGuard UI elements
        const t = m.target;
        if (t && (t.id?.startsWith?.('eg-') || t.className?.includes?.('eg-') || t.closest?.('[id^="eg-"], [class*="eg-"]'))) {
          continue;
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            if (node.id?.startsWith?.('eg-') || node.className?.includes?.('eg-')) continue;
            if (node.matches?.('input, select, textarea, form') || node.querySelector?.('input, select, textarea, form')) {
              hasFormChanges = true;
              break;
            }
          }
        }
        if (hasFormChanges) break;
        for (const node of m.removedNodes) {
          if (node.nodeType === 1) {
            if (node.id?.startsWith?.('eg-') || node.className?.includes?.('eg-')) continue;
            if (node.matches?.('input, select, textarea, form') || node.querySelector?.('input, select, textarea, form')) {
              hasFormChanges = true;
              break;
            }
          }
        }
        if (hasFormChanges) break;
      }

      if (hasFormChanges) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runEvaluation({ showAlerts: userHasCheckedErrors }), 300);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleFieldInput(e) {
    const target = e.target;
    if (target.matches('input, select, textarea')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runEvaluation({ showAlerts: userHasCheckedErrors }), 250);
    }
  }

  async function handleFieldChange(e) {
    const target = e.target;
    if (target.type === 'file') {
      if (target.files && target.files[0]) {
        currentFile = target.files[0];
        Logger.info('ContentScript', `File selected: ${target.files[0].name} (${target.files[0].size} bytes)`);
        // Pass the file input element so we can scrape the correct parent form
        activeAiPromise = processUploadedFile(currentFile, target).finally(() => {
          activeAiPromise = null;
        });
        await activeAiPromise;
      } else {
        currentFile = null;
        extractedDocData = null;
        activeAiFieldMap = null;
        uploadedDocsState.delete(target);
        Overlay.hideWrongDocBanner();
        await runEvaluation({ showAlerts: userHasCheckedErrors });
      }
    } else if (target.matches('input, select, textarea')) {
      await runEvaluation({ showAlerts: userHasCheckedErrors });
    }
  }

  /**
   * Scrapes the form that contains the given file input element.
   * Falls back to the largest form on the page if no parent form is found.
   * Returns a JSON array of field descriptors for Gemini to map against.
   */
  function scrapeTargetForm(fileInputEl) {
    // Strategy 1: walk up to the closest <form> from the file input
    let formEl = fileInputEl ? fileInputEl.closest('form') : null;

    // Strategy 2: pick the form with the most fillable fields
    if (!formEl) {
      const allForms = Array.from(document.querySelectorAll('form'));
      if (allForms.length === 1) {
        formEl = allForms[0];
      } else if (allForms.length > 1) {
        formEl = allForms.reduce((best, f) => {
          const count = f.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').length;
          const bestCount = best ? best.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').length : 0;
          return count > bestCount ? f : best;
        }, null);
      }
    }

    // Strategy 3: scan entire document if still nothing found
    const container = formEl || document.body;
    const inputs = container.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),' +
      'select, textarea'
    );

    const fields = [];
    let posIndex = 0;

    for (const el of inputs) {
      // Skip file inputs themselves (no text value to fill)
      if (el.type === 'file') continue;
      // Skip checkboxes/radios for now (handled separately by existing validator)
      if (el.type === 'checkbox' || el.type === 'radio') continue;

      // Derive a stable fieldKey: prefer id, then name, then positional fallback
      const fieldKey = el.id || el.name || `field_${posIndex++}`;

      // Find the associated label text
      let label = '';
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.innerText.replace(/\*/g, '').trim();
      }
      if (!label) {
        // Look for a label wrapping or immediately preceding the input
        const parentLabel = el.closest('label');
        if (parentLabel) label = parentLabel.innerText.replace(/\*/g, '').trim();
      }
      if (!label) {
        // Check nearest sibling/parent label within a form-group div
        const group = el.closest('div, li, td, .form-group, .field');
        if (group) {
          const siblingLabel = group.querySelector('label');
          if (siblingLabel) label = siblingLabel.innerText.replace(/\*/g, '').trim();
        }
      }

      fields.push({
        fieldKey,
        id: el.id || null,
        name: el.name || null,
        type: el.type || el.tagName.toLowerCase(),
        label: label || el.placeholder || fieldKey,
        placeholder: el.placeholder || null,
        currentValue: el.value || null
      });
    }

    Logger.info('ContentScript', `Form scraped: ${fields.length} fillable fields found`, fields.map(f => f.fieldKey));
    return fields;
  }

  /**
   * Identifies what document type a file upload input is expecting.
   * Inspects input ID, name, associated label, and parent upload block headers.
   */
  function detectExpectedDocType(fileInputEl) {
    if (!fileInputEl) return null;

    const tokens = [];
    // 1. Input id/name are the most reliable signals
    if (fileInputEl.id) tokens.push(fileInputEl.id);
    if (fileInputEl.name) tokens.push(fileInputEl.name);

    // 2. The label that explicitly targets this input via `for` attribute
    if (fileInputEl.id) {
      const lbl = document.querySelector(`label[for="${fileInputEl.id}"]`);
      if (lbl) tokens.push(lbl.innerText);
    }
    const parentLbl = fileInputEl.closest('label');
    if (parentLbl) tokens.push(parentLbl.innerText);

    // 3. Scan only the IMMEDIATE named container — deliberately exclude generic 'div'
    //    to prevent sibling upload-slot labels (e.g. PAN slot) from leaking into this slot's tokens
    const block = fileInputEl.closest('.doc-upload-block, .form-group, .upload-container, .upload-dropzone');
    if (block) {
      const headers = block.querySelectorAll('h1, h2, h3, h4, h5, h6, .doc-label, .doc-badge, label, strong, p');
      headers.forEach(h => tokens.push(h.innerText));
    }

    const combined = tokens.join(' ').toLowerCase();

    // 4. Combined slot: if the label says BOTH "income" AND "caste/community" it accepts either type
    //    e.g. "Upload Original Income / Caste Certificate" → CERTIFICATE (accepts both)
    if (/income/i.test(combined) && /caste|community/i.test(combined)) {
      return 'CERTIFICATE';
    }

    // 5. Check specific types in order of distinctiveness
    // PAN first — very distinctive keywords
    if (/\bpan\b|pan_file|panupload|permanent\s*account\s*number/i.test(combined)) {
      return 'PAN';
    }

    // Aadhaar
    if (/aadha?ar|uidai/i.test(combined)) {
      return 'AADHAAR';
    }

    // Caste Certificate (standalone — not combined with income, handled above)
    if (/caste|community/i.test(combined)) {
      return 'CASTE_CERTIFICATE';
    }

    // Income Certificate (standalone)
    if (/income/i.test(combined)) {
      return 'INCOME_CERTIFICATE';
    }

    // Marksheet / Transcript
    if (/marksheet|marks\s*memo|transcript|10th\s*(ssc|standard)|intermediate/i.test(combined)) {
      return 'MARKSHEET';
    }

    // Generic certificate
    if (/certificate|cert_file|certupload/i.test(combined)) {
      return 'CERTIFICATE';
    }

    return null;
  }


  /**
   * Determines the actual document type of the uploaded file using AI result,
   * OCR text, extracted values, and file name.
   */
  function detectActualDocType({ backendDocType, aiFieldMap, docData, rawText, fileName }) {
    const text = (rawText || (docData && docData.raw) || '').toUpperCase();
    const fName = (fileName || '').toUpperCase();

    // 1. Strong PAN signals
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
    const hasPanFormat = (aiFieldMap && aiFieldMap.panNumber && panRegex.test(aiFieldMap.panNumber)) ||
                         (docData && docData.certificateNo && panRegex.test(docData.certificateNo)) ||
                         panRegex.test(text);

    const hasPanKeywords = text.includes('PERMANENT ACCOUNT NUMBER') ||
                           text.includes('INCOME TAX DEPARTMENT') ||
                           (text.includes('GOVT. OF INDIA') && text.includes('INCOME TAX'));

    if (hasPanKeywords || (hasPanFormat && !text.includes('UNIQUE IDENTIFICATION') && !text.includes('MERA AADHAAR'))) {
      return 'PAN';
    }

    // 2. Strong Aadhaar signals
    const hasAadhaarKeywords = text.includes('UNIQUE IDENTIFICATION') ||
                               text.includes('UIDAI') ||
                               text.includes('MERA AADHAAR') ||
                               text.includes('MERI PEHCHAN') ||
                               (text.includes('GOVERNMENT OF INDIA') && text.includes('AADHAAR')) ||
                               text.includes('HELP@UIDAI.GOV.IN') ||
                               text.includes('WWW.UIDAI.GOV.IN');

    const hasAadhaarNumber = (aiFieldMap && aiFieldMap.aadhaarNumber && !hasPanKeywords) ||
                             (/\b\d{4}\s\d{4}\s\d{4}\b/.test(text) && !hasPanKeywords);

    if (hasAadhaarKeywords || hasAadhaarNumber) {
      return 'AADHAAR';
    }

    // 3. Marksheet signals
    if (text.includes('MARKS MEMORANDUM') || text.includes('SECONDARY SCHOOL CERTIFICATE') ||
        text.includes('BOARD OF INTERMEDIATE') || text.includes('HALL TICKET') || text.includes('PASS CERTIFICATE')) {
      return 'MARKSHEET';
    }

    // 4. Caste Certificate signals
    if (text.includes('COMMUNITY, NATIVITY') || text.includes('CASTE CERTIFICATE') ||
        text.includes('SCHEDULED CASTE') || text.includes('BACKWARD CLASS')) {
      return 'CASTE_CERTIFICATE';
    }

    // 5. Income Certificate signals
    if (text.includes('INCOME CERTIFICATE') || text.includes('ANNUAL INCOME')) {
      return 'INCOME_CERTIFICATE';
    }

    // 6. Gemini classification
    if (backendDocType && backendDocType !== 'OTHER' && backendDocType !== 'UNKNOWN') {
      return backendDocType;
    }

    // 7. Filename hints
    if (fName.includes('PAN')) return 'PAN';
    if (fName.includes('AADHAR') || fName.includes('AADHAAR') || fName.includes('UIDAI')) return 'AADHAAR';
    if (fName.includes('CASTE')) return 'CASTE_CERTIFICATE';
    if (fName.includes('INCOME')) return 'INCOME_CERTIFICATE';
    if (fName.includes('MARKSHEET') || fName.includes('MEMO')) return 'MARKSHEET';

    return (docData && docData.docType) || backendDocType || 'DOCUMENT';
  }

  /**
   * Checks if actual document type is incompatible with expected document type.
   */
  function isDocTypeMismatch(expectedType, actualType) {
    if (!expectedType || !actualType || actualType === 'DOCUMENT') return false;
    if (expectedType === actualType) return false;

    // Certificates can satisfy generic or specific certificate slots
    if (expectedType === 'CERTIFICATE' && (actualType === 'CASTE_CERTIFICATE' || actualType === 'INCOME_CERTIFICATE' || actualType === 'CERTIFICATE')) {
      return false;
    }
    if (expectedType === 'CASTE_CERTIFICATE' && (actualType === 'CASTE_CERTIFICATE' || actualType === 'CERTIFICATE')) {
      return false;
    }
    if (expectedType === 'INCOME_CERTIFICATE' && (actualType === 'INCOME_CERTIFICATE' || actualType === 'CERTIFICATE')) {
      return false;
    }

    return true;
  }

  function formatDocTypeName(type) {
    switch (type) {
      case 'AADHAAR': return 'Aadhaar Card';
      case 'PAN': return 'PAN Card';
      case 'CASTE_CERTIFICATE': return 'Caste Certificate';
      case 'INCOME_CERTIFICATE': return 'Income Certificate';
      case 'CERTIFICATE': return 'Official Certificate';
      case 'MARKSHEET': return 'Marksheet / Academic Memo';
      default: return type ? type.replace(/_/g, ' ') : 'Required Document';
    }
  }

  async function processUploadedFile(file, fileInputEl) {
    try {
      const fileRules = RuleEngine.getFileRules();

    // 1. Fast File Validation (Size, MIME, Extension)
    const fileIssues = FileValidator.validate(file, fileRules);

    // 2. Image Quality & Blur Checks (Canvas API)
    const qualityIssues = await ImageQuality.analyze(file, fileRules);

    // Helper: Reject blurry document immediately
    const rejectBlurryDocument = async (blurIssue) => {
      Logger.warn('ContentScript', 'Blurry document rejected:', blurIssue);
      blurIssue.element = fileInputEl;
      blurIssue.elementId = fileInputEl && fileInputEl.id;

      Overlay.hideAutoFillBanner();
      Overlay.hideWrongDocBanner();
      Overlay.clearAiLoading();

      // Reject file: do not accept blurry document into portal
      if (fileInputEl) {
        fileInputEl.value = '';
        const preview = fileInputEl.id === 'aadhaarUpload' ? document.getElementById('filePreviewAadhaar') :
                        fileInputEl.id === 'panUpload' ? document.getElementById('filePreviewPan') :
                        fileInputEl.closest('.doc-upload-block')?.querySelector('.file-preview');
        if (preview) preview.classList.add('hidden');

        const dropzone = fileInputEl.closest('.upload-dropzone');
        if (dropzone) {
          dropzone.classList.add('eg-field-error', 'eg-dropzone-rejected');
        }
      }

      // Show prominent rejection banner instructing user to upload a clear document
      Overlay.showBlurRejectedBanner({
        fileInputEl,
        fileName: file.name,
        message: blurIssue.message,
        onReplace: () => fileInputEl && fileInputEl.click()
      });

      uploadedDocsState.set(fileInputEl, {
        file,
        fileInputEl,
        isBlurred: true,
        isRejected: true,
        fileIssues,
        qualityIssues: [blurIssue]
      });

      userHasCheckedErrors = true;
      await runEvaluation({
        showAlerts: true,
        openDrawer: false,
        cachedFileIssues: fileIssues,
        cachedQualityIssues: [blurIssue]
      });
    };

    const immediateBlur = qualityIssues.find(q => q.code === 'DOCUMENT_BLURRED');
    if (immediateBlur) {
      await rejectBlurryDocument(immediateBlur);
      return;
    }

    // 3. Scrape the target form schema for AI-driven field mapping
    const formSchema = scrapeTargetForm(fileInputEl);
    console.log('[ErrorGuard] Form schema scraped for AI mapping:', formSchema);

    // 4. Asynchronous OCR & AI Pipeline
    Overlay.setAiProgress(10, 'Analyzing document in background...');
    let ocrResult = { text: '', confidence: 0 };
    let aiFieldMap = null; // Direct { fieldKey: value } map from Gemini
    let backendDocType = null;

    try {
      // ── Try the form-aware AI mapping endpoint first ──
      let backendUrl = 'http://localhost:5001';
      let healthCheck = await fetch(`${backendUrl}/api/health`).catch(() => null);
      if (!healthCheck || !healthCheck.ok) {
        backendUrl = 'http://localhost:5000';
        healthCheck = await fetch(`${backendUrl}/api/health`).catch(() => null);
      }

      if (healthCheck && healthCheck.ok && formSchema.length > 0) {
        Overlay.setAiProgress(20, 'Reading form fields & document together...');
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        Overlay.setAiProgress(45, 'Gemini AI mapping document to form fields...');
        const mapRes = await fetch(`${backendUrl}/api/map-form-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: file.type || 'image/png',
            fileName: file.name,
            formSchema
          })
        });

        if (mapRes.ok) {
          const mapData = await mapRes.json();
          if (mapData.success) {
            if (mapData.isBlurred) {
              const aiBlurIssue = {
                code: 'DOCUMENT_BLURRED',
                severity: 'BLOCKING',
                field: (fileInputEl && fileInputEl.name) || (fileInputEl && fileInputEl.id) || 'file_upload',
                elementId: fileInputEl && fileInputEl.id,
                element: fileInputEl,
                message: mapData.blurReason || 'Uploaded document is blurry or unreadable. It cannot be accepted for official verification.',
                fix: 'Please upload a clear, sharp, well-lit document scan.'
              };
              await rejectBlurryDocument(aiBlurIssue);
              return;
            }

            if (mapData.fieldMap) {
              aiFieldMap = mapData.fieldMap;
              backendDocType = mapData.documentType || null;
              Overlay.setAiProgress(100, 'AI Field Mapping Complete ✓');
              console.log('[ErrorGuard] AI Field Map received & stored:', aiFieldMap, 'documentType:', backendDocType);
              Logger.info('ContentScript', 'AI form-mapping succeeded', { aiFieldMap, backendDocType });
            }
          }
        }
      }
    } catch (mapErr) {
      Logger.warn('ContentScript', 'Form-mapping backend error, falling back to OCR', mapErr);
    }

    // ── Fallback: standard OCR + document parser (if AI mapping not available) ──
    if (!aiFieldMap) {
      try {
        ocrResult = await OcrEngine.extractText(file, (percent, msg) => {
          Overlay.setAiProgress(percent, msg);
        });
      } catch (err) {
        Logger.warn('ContentScript', 'OCR extraction issue', err);
      }
    }

    // 5. Structured Document Parsing & Classification
    if (aiFieldMap) {
      const docName = aiFieldMap.fullName || aiFieldMap.full_name || aiFieldMap.name || null;
      const docDob = aiFieldMap.dob || aiFieldMap.dateOfBirth || null;
      const docAadhaar = aiFieldMap.aadhaarNumber || aiFieldMap.aadhaar_no || null;
      const docPan = aiFieldMap.panNumber || aiFieldMap.pan_no || null;
      const docCert = aiFieldMap.certificateNo || aiFieldMap.certificate_no || docAadhaar || docPan || null;
      const docGender = aiFieldMap.gender || null;
      const docFather = aiFieldMap.fatherName || aiFieldMap.father_name || null;

      extractedDocData = {
        name: docName,
        dob: docDob,
        certificateNo: docCert,
        aadhaarNo: docAadhaar,
        panNo: docPan,
        gender: docGender,
        fatherName: docFather,
        lines: Object.values(aiFieldMap).filter(v => typeof v === 'string'),
        raw: Object.values(aiFieldMap).filter(v => typeof v === 'string').join(' '),
        ocrConfidence: 0.99,
        fieldMap: aiFieldMap
      };
    } else {
      extractedDocData = DocumentParser.parse(ocrResult.text, ocrResult.aiData);
      extractedDocData.ocrConfidence = ocrResult.confidence;
      if (ocrResult.aiData) {
        backendDocType = ocrResult.aiData.docType || null;
        aiFieldMap = {
          fullName: ocrResult.aiData.name || null,
          dob: ocrResult.aiData.dob || null,
          certificateNo: ocrResult.aiData.certificateNo || null,
          gender: ocrResult.aiData.gender || null,
          fatherName: ocrResult.aiData.fatherName || null,
          aadhaarNumber: ocrResult.aiData.docType === 'AADHAAR' ? ocrResult.aiData.certificateNo : null,
          panNumber: ocrResult.aiData.docType === 'PAN' ? ocrResult.aiData.certificateNo : null
        };
      }
    }

    // 5b. Document Type Conformance Check (Slot vs. Uploaded Document)
    const expectedType = detectExpectedDocType(fileInputEl);
    const actualType = detectActualDocType({
      backendDocType,
      aiFieldMap,
      docData: extractedDocData,
      rawText: ocrResult.text,
      fileName: file.name
    });

    if (extractedDocData) {
      extractedDocData.docType = actualType;
      Overlay.setAiReady(extractedDocData);
    }

    const isMismatch = isDocTypeMismatch(expectedType, actualType);

    Logger.info('ContentScript', 'Document type evaluation:', {
      slot: fileInputEl ? (fileInputEl.id || fileInputEl.name) : 'unknown',
      expectedType,
      actualType,
      isMismatch
    });

    // Save slot state in uploadedDocsState map
    uploadedDocsState.set(fileInputEl, {
      file,
      fileInputEl,
      expectedType,
      actualType,
      isMismatch,
      extractedDocData,
      aiFieldMap,
      fileIssues,
      qualityIssues
    });

    // Only merge into activeAiFieldMap if document conforms to the expected slot
    if (!isMismatch && aiFieldMap) {
      activeAiFieldMap = { ...(activeAiFieldMap || {}), ...aiFieldMap };
    }

    console.log('================== [ErrorGuard OCR/AI] DATA START ==================');
    console.log('[ErrorGuard] Active AI Field Map:', activeAiFieldMap);
    console.log('[ErrorGuard] Parsed Document Structure:', extractedDocData);
    console.log('[ErrorGuard] Document Type Check:', { expectedType, actualType, isMismatch });
    console.log('================== [ErrorGuard OCR/AI] DATA END ====================');

    // 6. Show Banner: Wrong Document Alert OR Auto-Fill Suggestion
    if (isMismatch) {
      if (aiAutoFillMode) {
        // AI mode: show the full on-screen wrong-doc banner
        Overlay.hideAutoFillBanner();
        Overlay.showWrongDocBanner({
          expectedType,
          actualType,
          fileInputEl,
          fileName: file.name,
          onReplace: () => fileInputEl.click()
        });
      }
      // Manual mode: no on-screen banner — issue will appear in sidebar on "Check for Errors"
    } else {
      Overlay.hideWrongDocBanner();

      if (aiAutoFillMode && aiFieldMap) {
        // AI Auto-Fill mode: show the auto-fill banner
        const bannerDocData = {
          name: extractedDocData?.name || null,
          dob: extractedDocData?.dob || null,
          certificateNo: extractedDocData?.certificateNo || null,
          docType: actualType
        };

        const previewFieldMap = {};
        for (const [key, value] of Object.entries(aiFieldMap)) {
          if (!value) continue;
          const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
          if (el && el.value && el.value.trim() !== '') continue;
          previewFieldMap[key] = value;
        }

        const hasAnyData = bannerDocData.name || bannerDocData.dob || bannerDocData.certificateNo;
        const hasNewFields = Object.keys(previewFieldMap).length > 0;
        if (hasAnyData && hasNewFields) {
          Overlay.showAutoFillBanner(bannerDocData, () => applyFieldMap(aiFieldMap), previewFieldMap);
        }
      } else if (aiAutoFillMode) {
        // AI mode fallback — legacy OCR path
        const currentScan = Detector.scan();
        const hasBlanks = currentScan.fields.some(f =>
          f.semantic &&
          (f.semantic.type === 'FULL_NAME' || f.semantic.type === 'DOB' || f.semantic.type === 'CERTIFICATE_NUMBER') &&
          !f.value
        );
        if (hasBlanks && (extractedDocData?.name || extractedDocData?.dob || extractedDocData?.certificateNo)) {
          Overlay.showAutoFillBanner(extractedDocData, () => applyAutoFill(extractedDocData));
        }
      }
      // Manual Guard mode: no banners at all — silent processing
    }

    // 7. Complete evaluation with newly extracted document data
    // If there is a mismatch AND we're in AI mode, activate alerts immediately
    if (isMismatch && aiAutoFillMode) {
      userHasCheckedErrors = true;
    }
      await runEvaluation({
        showAlerts: userHasCheckedErrors || (isMismatch && aiAutoFillMode),
        cachedFileIssues: fileIssues,
        cachedQualityIssues: qualityIssues
      });
    } catch (procErr) {
      Logger.error('ContentScript', 'Failed during processUploadedFile', procErr);
      Overlay.clearAiLoading();
    }
  }

  /**
   * NEW: Apply AI-generated field map directly by element id/name.
   * Zero regex. Zero semantic guessing. Gemini told us exactly which field gets what.
   * @param {Object} fieldMap - { fieldKey: value } from /api/map-form-fields
   */
  function applyFieldMap(fieldMap) {
    if (!fieldMap) return;
    let filledCount = 0;

    for (const [fieldKey, value] of Object.entries(fieldMap)) {
      if (value === null || value === undefined || value === '') continue;

      // Try getElementById first (most reliable), then name
      let el = document.getElementById(fieldKey);
      if (!el) el = document.querySelector(`[name="${fieldKey}"]`);
      if (!el) continue;

      // Don't overwrite a field the user has already filled
      if (el.value && el.value.trim() !== '') continue;

      if (el.tagName.toLowerCase() === 'select') {
        const strVal = String(value).trim().toLowerCase();
        const matchedOption = Array.from(el.options).find(opt =>
          opt.value.toLowerCase() === strVal ||
          opt.text.toLowerCase() === strVal
        );
        if (matchedOption) {
          el.value = matchedOption.value;
        } else {
          el.value = String(value);
        }
      } else if (el.type === 'date') {
        const iso = Normalize.date(String(value));
        el.value = iso || String(value);
      } else {
        el.value = String(value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filledCount++;
    }

    Logger.info('ContentScript', `AI field map applied: ${filledCount} fields filled`);
    console.log(`[ErrorGuard] applyFieldMap: filled ${filledCount} fields from AI mapping`);
    runEvaluation({ showAlerts: userHasCheckedErrors });
  }

  function applyAutoFill(data) {
    if (!data) return;
    const scanResult = Detector.scan();
    for (const item of scanResult.fields) {
      if (!item.semantic) continue;
      const sType = item.semantic.type;

      // FULL_NAME: fill applicant name only — never touch FATHER_NAME fields
      if (sType === 'FULL_NAME' && data.name) {
        item.field.value = data.name;
        item.field.dispatchEvent(new Event('input', { bubbles: true }));
        item.field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // FATHER_NAME / MOTHER_NAME: skip auto-fill — Aadhaar/PAN does not
      // contain parent names in a reliably extractable structured form.
      if (sType === 'FATHER_NAME' || sType === 'MOTHER_NAME') continue;

      if (sType === 'DOB' && data.dob) {
        const iso = Normalize.date(data.dob);
        item.field.value = item.field.type === 'date' ? (iso || data.dob) : data.dob;
        item.field.dispatchEvent(new Event('input', { bubbles: true }));
        item.field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // CERTIFICATE_NUMBER: only fill when the document is genuinely a
      // certificate — never when it is an Aadhaar or PAN card.
      const isCertDoc = data.docType && !['AADHAAR', 'PAN'].includes(data.docType.toUpperCase());
      if (sType === 'CERTIFICATE_NUMBER' && data.certificateNo && isCertDoc) {
        item.field.value = data.certificateNo;
        item.field.dispatchEvent(new Event('input', { bubbles: true }));
        item.field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (sType === 'AADHAAR_NUMBER' && (data.aadhaarNo || (data.docType === 'AADHAAR' && data.certificateNo))) {
        item.field.value = data.aadhaarNo || data.certificateNo;
        item.field.dispatchEvent(new Event('input', { bubbles: true }));
        item.field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (sType === 'PAN_NUMBER' && (data.panNo || (data.docType === 'PAN' && data.certificateNo))) {
        item.field.value = data.panNo || data.certificateNo;
        item.field.dispatchEvent(new Event('input', { bubbles: true }));
        item.field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    runEvaluation({ showAlerts: userHasCheckedErrors });
  }

  // Expose global re-evaluation trigger for manual refresh & on-demand inspection
  window.ErrorGuard.reEvaluate = async function(opts = {}) {
    const showAlerts = (opts && opts.showAlerts !== undefined) ? opts.showAlerts : true;
    if (showAlerts) userHasCheckedErrors = true;
    const openDrawer = opts && opts.openDrawer;
    Logger.info('ContentScript', 'Manual re-scan triggered by user.', { showAlerts, openDrawer });

    // If system is waiting for AI data (e.g. user clicked Check while AI is analyzing in background)
    if (activeAiPromise) {
      Overlay.showDrawerLoading(
        'Verifying Form & Document with AI...',
        'Gemini AI is currently analyzing your uploaded document. Final verification will display immediately once complete.'
      );
      try {
        await activeAiPromise;
      } catch (err) {
        Logger.warn('ContentScript', 'Error while awaiting active AI promise', err);
      }
    }

    return await runEvaluation({ showAlerts, openDrawer });
  };

  async function runEvaluation(options = {}) {
    let cachedFileIssues = null;
    let cachedQualityIssues = null;
    let showAlerts = userHasCheckedErrors;
    let openDrawer = false;

    if (Array.isArray(options)) {
      cachedFileIssues = options;
      cachedQualityIssues = arguments[1] || null;
    } else if (typeof options === 'object' && options !== null) {
      if (options.showAlerts !== undefined) showAlerts = options.showAlerts;
      if (options.openDrawer !== undefined) openDrawer = options.openDrawer;
      cachedFileIssues = options.cachedFileIssues || null;
      cachedQualityIssues = options.cachedQualityIssues || null;
    }

    const scanResult = Detector.scan();
    const hasForm = isFormPresent(scanResult);

    // If no form detected on this webpage, show safe standby state instead of unexpected data
    if (!hasForm) {
      latestReport = {
        hasForm: false,
        status: 'STANDBY',
        isReady: null,
        healthScore: null,
        issues: { all: [], blocking: [], warnings: [], info: [] },
        checklist: {
          form: { valid: null },
          document: { uploaded: false, formatValid: null, sizeValid: null, qualityPass: null },
          verification: { nameMatch: null, dobMatch: null, certNoMatch: null }
        },
        message: 'No active application form detected on this webpage.'
      };

      Overlay.update(latestReport, { showAlerts: false, openDrawer });
      return latestReport;
    }

    const profile = RuleEngine.getProfile();
    const fileRules = RuleEngine.getFileRules();

    // Extract Form Key-Value Map
    const formData = {};
    let hasFileInput = false;
    for (const item of scanResult.fields) {
      if (item.semantic) {
        if (item.semantic.type === 'FULL_NAME') formData.full_name = item.value;
        if (item.semantic.type === 'FATHER_NAME') formData.father_name = item.value;
        if (item.semantic.type === 'MOTHER_NAME') formData.mother_name = item.value;
        if (item.semantic.type === 'DOB') formData.dob = item.value;
        if (item.semantic.type === 'GENDER') formData.gender = item.value;
        if (item.semantic.type === 'CERTIFICATE_NUMBER') formData.certificate_no = item.value;
        if (item.semantic.type === 'AADHAAR_NUMBER') formData.aadhaar_no = item.value;
        if (item.semantic.type === 'PAN_NUMBER') formData.pan_no = item.value;
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
      fileIssues = cachedFileIssues ? [...cachedFileIssues] : FileValidator.validate(currentFile, fileRules);
      qualityIssues = cachedQualityIssues ? [...cachedQualityIssues] : await ImageQuality.analyze(currentFile, fileRules);
    }

    // Check all uploaded slots for document type conformance
    for (const [inputEl, docState] of uploadedDocsState.entries()) {
      if (docState.isMismatch) {
        const expName = formatDocTypeName(docState.expectedType);
        const actName = formatDocTypeName(docState.actualType);
        fileIssues.push({
          code: 'WRONG_DOCUMENT_TYPE',
          severity: 'BLOCKING',
          field: (inputEl && inputEl.name) || (inputEl && inputEl.id) || 'file_upload',
          elementId: inputEl && inputEl.id,
          element: inputEl,
          message: `This slot requires a ${expName}, but an ${actName} was uploaded.`,
          fix: `Please upload your ${expName} in this slot.`
        });
      }
    }

    // 3. Form <-> Document Cross Verification (checks current form field values against Gemini API response)
    const crossCheckIssues = [];
    if (extractedDocData || activeAiFieldMap || currentFile) {
      const crossChecks = RuleEngine.getCrossChecks();
      const rawText = (extractedDocData && extractedDocData.raw) || '';
      const hasRecognizedText = rawText.trim().length >= 10;
      const checkedFieldKeys = new Set();

      // ── Step 3A: Direct AI Field Map Verification (Gemini API Response Ground Truth) ──
      if (activeAiFieldMap && Object.keys(activeAiFieldMap).length > 0) {
        for (const [fieldKey, rawDocVal] of Object.entries(activeAiFieldMap)) {
          if (rawDocVal === null || rawDocVal === undefined) continue;
          const docVal = String(rawDocVal).trim();
          if (!docVal) continue;

          // Skip non-verifiable fields like captcha, passwords, etc.
          const lowerKey = fieldKey.toLowerCase();
          if (lowerKey.includes('captcha') || lowerKey.includes('password')) continue;

          // Resolve DOM element corresponding to this field
          const el = document.getElementById(fieldKey) ||
                     document.querySelector(`[name="${fieldKey}"]`) ||
                     (fieldKey === 'fullName' ? document.querySelector('[name="full_name"]') : null) ||
                     (fieldKey === 'fatherName' ? document.querySelector('[name="father_name"]') : null) ||
                     (fieldKey === 'motherName' ? document.querySelector('[name="mother_name"]') : null) ||
                     (fieldKey === 'aadhaarNumber' ? document.querySelector('[name="aadhaar_no"], [name="aadhaar_number"]') : null) ||
                     (fieldKey === 'panNumber' ? document.querySelector('[name="pan_no"], [name="pan_number"]') : null) ||
                     (fieldKey === 'dob' ? document.querySelector('[name="dob"], [name="date_of_birth"]') : null);

          if (!el) continue;
          checkedFieldKeys.add(fieldKey);
          if (el.id) checkedFieldKeys.add(el.id);
          if (el.name) checkedFieldKeys.add(el.name);

          const currentVal = (el.value || '').trim();
          // Only check when the user has entered a value. Empty fields are already caught by FormValidator.
          if (!currentVal) continue;

          // 1. Applicant Full Name
          if (lowerKey === 'fullname' || lowerKey === 'full_name' || (lowerKey.includes('name') && !lowerKey.includes('father') && !lowerKey.includes('mother') && !lowerKey.includes('guardian'))) {
            const nameComp = Matcher.compareNames(currentVal, docVal);
            if (!nameComp.match) {
              const isReview = nameComp.decision === 'REVIEW';
              crossCheckIssues.push({
                code: 'NAME_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: isReview ? 'WARNING' : 'BLOCKING',
                message: isReview
                  ? `Possible name spelling difference: Form says "${currentVal}", document shows "${docVal}".`
                  : `Name mismatch: Form specifies "${currentVal}", but verified document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                score: nameComp.score,
                fix: 'Ensure your entered name matches the spelling on your verified document exactly.'
              });
            }
          }
          // 2. Father / Guardian Name
          else if (lowerKey.includes('father') || lowerKey.includes('guardian')) {
            const nameComp = Matcher.compareNames(currentVal, docVal);
            if (!nameComp.match) {
              const isReview = nameComp.decision === 'REVIEW';
              crossCheckIssues.push({
                code: 'NAME_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: isReview ? 'WARNING' : 'BLOCKING',
                message: isReview
                  ? `Possible father's name spelling difference: Form says "${currentVal}", document shows "${docVal}".`
                  : `Father's name mismatch: Form specifies "${currentVal}", but verified document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                score: nameComp.score,
                fix: "Ensure father's/guardian's name matches your verified document."
              });
            }
          }
          // 3. Mother Name
          else if (lowerKey.includes('mother')) {
            const nameComp = Matcher.compareNames(currentVal, docVal);
            if (!nameComp.match) {
              const isReview = nameComp.decision === 'REVIEW';
              crossCheckIssues.push({
                code: 'NAME_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: isReview ? 'WARNING' : 'BLOCKING',
                message: isReview
                  ? `Possible mother's name spelling difference: Form says "${currentVal}", document shows "${docVal}".`
                  : `Mother's name mismatch: Form specifies "${currentVal}", but verified document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                score: nameComp.score,
                fix: "Ensure mother's name matches your verified document."
              });
            }
          }
          // 4. Date of Birth
          else if (lowerKey.includes('dob') || lowerKey.includes('birth') || el.type === 'date') {
            const dobComp = Matcher.compareDob(currentVal, docVal);
            if (!dobComp.match) {
              crossCheckIssues.push({
                code: 'DOB_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'BLOCKING',
                message: dobComp.reason || `DOB mismatch: Form specifies "${currentVal}", but verified document states "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Check the date of birth on your original certificate/ID card and correct the form.'
              });
            }
          }
          // 5. Gender
          else if (lowerKey.includes('gender')) {
            if (currentVal.toLowerCase() !== docVal.toLowerCase()) {
              crossCheckIssues.push({
                code: 'GENDER_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'BLOCKING',
                message: `Gender mismatch: Form specifies "${currentVal}", but verified document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Select the gender corresponding to your uploaded document.'
              });
            }
          }
          // 6. Aadhaar Number
          else if (lowerKey.includes('aadhaar') || lowerKey.includes('uid')) {
            const normCurrent = Normalize.identifier(currentVal);
            const normDoc = Normalize.identifier(docVal);
            if (normDoc.includes('X')) {
              // Masked Aadhaar: check if unmasked trailing digits match
              const docTrailing = normDoc.replace(/[^0-9]/g, '');
              const curTrailing = normCurrent.replace(/[^0-9]/g, '').slice(-docTrailing.length);
              if (docTrailing && curTrailing !== docTrailing) {
                crossCheckIssues.push({
                  code: 'IDENTIFIER_MISMATCH',
                  field: el.name || fieldKey,
                  elementId: el.id || fieldKey,
                  element: el,
                  severity: 'BLOCKING',
                  message: `Aadhaar Number mismatch: Form specifies "${currentVal}", but verified Aadhaar document ends with "${docTrailing}".`,
                  formValue: currentVal,
                  documentValue: docVal,
                  fix: 'Enter the 12-digit Aadhaar number matching your uploaded Aadhaar card.'
                });
              }
            } else if (normCurrent !== normDoc) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'BLOCKING',
                message: `Aadhaar Number mismatch: Form specifies "${currentVal}", but verified Aadhaar document has "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Enter the 12-digit Aadhaar number matching your uploaded Aadhaar card.'
              });
            }
          }
          // 7. PAN Number
          else if (lowerKey.includes('pan')) {
            const normCurrent = Normalize.identifier(currentVal);
            const normDoc = Normalize.identifier(docVal);
            if (normCurrent !== normDoc) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'BLOCKING',
                message: `PAN mismatch: Form specifies "${currentVal}", but verified PAN document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Enter the 10-character PAN number matching your uploaded PAN card.'
              });
            }
          }
          // 8. Certificate Number
          else if (lowerKey.includes('cert')) {
            const normCurrent = Normalize.identifier(currentVal);
            const normDoc = Normalize.identifier(docVal);
            if (normCurrent !== normDoc) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'BLOCKING',
                message: `Certificate number mismatch: Form has "${currentVal}", but document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Double check the certificate or ID number on the document.'
              });
            }
          }
          // 9. Phone Number
          else if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
            const numCurrent = currentVal.replace(/[^0-9]/g, '');
            const numDoc = docVal.replace(/[^0-9]/g, '');
            if (numCurrent && numDoc && numCurrent.slice(-10) !== numDoc.slice(-10)) {
              crossCheckIssues.push({
                code: 'VALUE_MISMATCH',
                field: el.name || fieldKey,
                elementId: el.id || fieldKey,
                element: el,
                severity: 'WARNING',
                message: `Mobile number mismatch: Form specifies "${currentVal}", but document shows "${docVal}".`,
                formValue: currentVal,
                documentValue: docVal,
                fix: 'Check the mobile number entered in the form.'
              });
            }
          }
        }
      }

      // ── Step 3B: Fallback Semantic Cross-Checks (if not already verified above) ──
      if (extractedDocData) {
        // Check A: Full Name Cross Check
        const nameField = scanResult.fields.find(f => f.semantic?.type === 'FULL_NAME');
        const nameFieldKey = nameField?.field?.id || nameField?.field?.name || 'FULL_NAME';
        if (!checkedFieldKeys.has(nameFieldKey) && crossChecks.verifyName && formData.full_name) {
          if (extractedDocData.name) {
            const nameComparison = Matcher.compareNames(formData.full_name, extractedDocData.name);
            if (!nameComparison.match) {
              const fullTextSearch = Matcher.searchNameInDocument(formData.full_name, rawText, extractedDocData.lines);
              if (!fullTextSearch.match) {
                const isReview = nameComparison.decision === 'REVIEW' || fullTextSearch.decision === 'REVIEW';
                crossCheckIssues.push({
                  code: 'NAME_MISMATCH',
                  field: nameField?.field?.name || 'FULL_NAME',
                  elementId: nameField?.field?.id || null,
                  element: nameField?.field || null,
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
            const fullTextSearch = Matcher.searchNameInDocument(formData.full_name, rawText, extractedDocData.lines);
            if (!fullTextSearch.match) {
              const isReview = fullTextSearch.decision === 'REVIEW';
              crossCheckIssues.push({
                code: 'NAME_MISMATCH',
                field: nameField?.field?.name || 'FULL_NAME',
                elementId: nameField?.field?.id || null,
                element: nameField?.field || null,
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
        const dobField = scanResult.fields.find(f => f.semantic?.type === 'DOB');
        const dobFieldKey = dobField?.field?.id || dobField?.field?.name || 'DOB';
        if (!checkedFieldKeys.has(dobFieldKey) && crossChecks.verifyDob && formData.dob) {
          if (extractedDocData.dob) {
            const dobComparison = Matcher.compareDob(formData.dob, extractedDocData.dob);
            if (!dobComparison.match) {
              const dobSearch = Matcher.searchDobInDocument(formData.dob, rawText);
              if (!dobSearch.match) {
                crossCheckIssues.push({
                  code: 'DOB_MISMATCH',
                  field: dobField?.field?.name || 'DOB',
                  elementId: dobField?.field?.id || null,
                  element: dobField?.field || null,
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
                field: dobField?.field?.name || 'DOB',
                elementId: dobField?.field?.id || null,
                element: dobField?.field || null,
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
        const certField = scanResult.fields.find(f => f.semantic?.type === 'CERTIFICATE_NUMBER');
        const certFieldKey = certField?.field?.id || certField?.field?.name || 'CERTIFICATE_NUMBER';
        if (!checkedFieldKeys.has(certFieldKey) && crossChecks.verifyCertificateNo && formData.certificate_no) {
          const docId = extractedDocData.certificateNo || extractedDocData.aadhaarNo || extractedDocData.panNo;
          if (docId) {
            const certComp = Matcher.compareIdentifier(formData.certificate_no, docId);
            if (!certComp.match) {
              const normFormId = Normalize.identifier(formData.certificate_no);
              const normRaw = Normalize.identifier(rawText);
              if (!normRaw.includes(normFormId)) {
                crossCheckIssues.push({
                  code: 'IDENTIFIER_MISMATCH',
                  field: certField?.field?.name || 'CERTIFICATE_NUMBER',
                  elementId: certField?.field?.id || null,
                  element: certField?.field || null,
                  severity: 'BLOCKING',
                  message: `Identifier mismatch: Form has "${formData.certificate_no}", document shows "${docId}".`,
                  formValue: formData.certificate_no,
                  documentValue: docId,
                  fix: 'Double check the certificate or ID number on the document.'
                });
              }
            }
          }
        }

        // Check C1: Aadhaar Number Cross-Check
        const aadhaarField = scanResult.fields.find(f => f.semantic?.type === 'AADHAAR_NUMBER');
        const aadhaarFieldKey = aadhaarField?.field?.id || aadhaarField?.field?.name || 'AADHAAR_NUMBER';
        if (!checkedFieldKeys.has(aadhaarFieldKey) && formData.aadhaar_no) {
          const docAadhaar = extractedDocData.aadhaarNo || (extractedDocData.docType === 'AADHAAR' ? extractedDocData.certificateNo : null);
          if (docAadhaar) {
            const certComp = Matcher.compareIdentifier(formData.aadhaar_no, docAadhaar);
            if (!certComp.match) {
              const normAadhaar = Normalize.identifier(formData.aadhaar_no);
              const normDocAadhaar = Normalize.identifier(docAadhaar);
              if (normAadhaar !== normDocAadhaar) {
                crossCheckIssues.push({
                  code: 'IDENTIFIER_MISMATCH',
                  field: aadhaarField?.field?.name || 'AADHAAR_NUMBER',
                  elementId: aadhaarField?.field?.id || null,
                  element: aadhaarField?.field || null,
                  severity: 'BLOCKING',
                  message: `Aadhaar Number mismatch: Form specifies "${formData.aadhaar_no}", but verified Aadhaar document has "${docAadhaar}".`,
                  formValue: formData.aadhaar_no,
                  documentValue: docAadhaar,
                  fix: 'Enter the 12-digit Aadhaar number matching your uploaded Aadhaar card.'
                });
              }
            }
          }
        }

        // Check C2: PAN Card Number Cross-Check
        const panField = scanResult.fields.find(f => f.semantic?.type === 'PAN_NUMBER');
        const panFieldKey = panField?.field?.id || panField?.field?.name || 'PAN_NUMBER';
        if (!checkedFieldKeys.has(panFieldKey) && formData.pan_no) {
          const docPan = extractedDocData.panNo || (extractedDocData.docType === 'PAN' ? extractedDocData.certificateNo : null);
          if (docPan) {
            const certComp = Matcher.compareIdentifier(formData.pan_no, docPan);
            if (!certComp.match) {
              const normPan = Normalize.identifier(formData.pan_no);
              const normDocPan = Normalize.identifier(docPan);
              if (normPan !== normDocPan) {
                crossCheckIssues.push({
                  code: 'IDENTIFIER_MISMATCH',
                  field: panField?.field?.name || 'PAN_NUMBER',
                  elementId: panField?.field?.id || null,
                  element: panField?.field || null,
                  severity: 'BLOCKING',
                  message: `PAN mismatch: Form specifies "${formData.pan_no}", but verified PAN document shows "${docPan}".`,
                  formValue: formData.pan_no,
                  documentValue: docPan,
                  fix: 'Enter the 10-character PAN number matching your uploaded PAN card.'
                });
              }
            }
          }
        }
      }

      // Check D: Unreadable Document Check
      if (currentFile && currentFile.type && currentFile.type.startsWith('image/') && rawText.trim().length < 5 && (!activeAiFieldMap || Object.keys(activeAiFieldMap).length === 0)) {
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
    // highlightFields: only paint red borders in AI Auto-Fill mode
    Overlay.update(latestReport, { showAlerts, openDrawer, highlightFields: showAlerts && aiAutoFillMode });

    // 5b. Show 1-Click Auto-Correct Chips — only in AI Auto-Fill mode
    if (!showAlerts || !aiAutoFillMode) {
      Overlay.clearAutoCorrectChips();
    } else {
      const activeChipParents = new Set();
      for (const issue of crossCheckIssues) {
        if (!issue.documentValue) continue;
        // Skip masked values like "XXXX XXXX 3859"
        if (typeof issue.documentValue === 'string' && issue.documentValue.includes('XXXX')) continue;

        let targetEl = issue.element || null;
        if (!targetEl && issue.elementId) targetEl = document.getElementById(issue.elementId);
        if (!targetEl && issue.field) {
          targetEl = document.getElementById(issue.field) || document.querySelector(`[name="${issue.field}"]`);
        }
        if (!targetEl) {
          const matchedScan = scanResult.fields.find(f => f.semantic?.type === issue.field);
          targetEl = matchedScan?.field || null;
        }

        if (targetEl) {
          const parent = targetEl.parentElement || targetEl.closest('.form-group') || targetEl;
          activeChipParents.add(parent);

          let correctVal = issue.documentValue;
          if (targetEl.type === 'date') {
            correctVal = Normalize.date(correctVal) || correctVal;
          }
          Overlay.showAutoCorrectChip(targetEl, correctVal, () => {
            if (targetEl.tagName.toLowerCase() === 'select') {
              const opt = Array.from(targetEl.options).find(o =>
                o.value.toLowerCase() === correctVal.toLowerCase() ||
                o.text.toLowerCase() === correctVal.toLowerCase()
              );
              targetEl.value = opt ? opt.value : correctVal;
            } else {
              targetEl.value = correctVal;
            }
            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            targetEl.dispatchEvent(new Event('change', { bubbles: true }));
            runEvaluation({ showAlerts: true });
          });
        }
      }

      // Remove chips for any elements that are no longer mismatched
      document.querySelectorAll('.eg-autocorrect-chip').forEach(chip => {
        if (!activeChipParents.has(chip.parentElement)) {
          chip.remove();
        }
      });
    }

    // 6. Persist to Chrome Storage for Popup
    await Storage.set('ACTIVE_GUARD_REPORT', latestReport);

    return latestReport;
  }

  // Pre-Submission Interceptor
  async function handleFormSubmit(e) {
    if (bypassSubmissionGuard) {
      bypassSubmissionGuard = false;
      Logger.info('SubmissionGuard', 'Form submission permitted via user override.');
      return true;
    }

    pendingSubmissionTarget.form = e.target;
    userHasCheckedErrors = true;
    // Run evaluation right before submitting with visual alerts active
    const report = await runEvaluation({ showAlerts: true });

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
    if (bypassSubmissionGuard) {
      Logger.info('SubmissionGuard', 'Submit button click permitted via user override.');
      setTimeout(() => { bypassSubmissionGuard = false; }, 250);
      return;
    }

    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;

    const btnText = (btn.textContent || btn.value || '').toLowerCase();
    if (btn.type === 'submit' || btnText.includes('submit') || btnText.includes('apply')) {
      pendingSubmissionTarget.submitBtn = btn;
      pendingSubmissionTarget.form = btn.closest('form') || document.querySelector('form');

      userHasCheckedErrors = true;
      const report = await runEvaluation({ showAlerts: true });
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
