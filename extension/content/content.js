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
  let userHasCheckedErrors = false;

  async function init() {
    Logger.info('ContentScript', 'Pre-Submission Error Guard initializing on page...');

    // 1. Initialize Portal Profile
    const profile = await RuleEngine.init();
    Logger.info('ContentScript', `Loaded rules profile: ${profile.name}`);

    // 2. Initialize In-Page UI Overlay
    Overlay.init();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['EG_AI_AUTOFILL_MODE'], (res) => {
        if (res && typeof res.EG_AI_AUTOFILL_MODE !== 'undefined') {
          Overlay.setMode(res.EG_AI_AUTOFILL_MODE);
        }
      });
    }

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
          if (typeof Overlay !== 'undefined' && Overlay.setMode) {
            Overlay.setMode(request.aiAutoFillMode);
          }
          sendResponse({ success: true, aiAutoFillMode: request.aiAutoFillMode });
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
      debounceTimer = setTimeout(() => runEvaluation({ showAlerts: userHasCheckedErrors }), 300);
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
        await processUploadedFile(currentFile, target);
      } else {
        currentFile = null;
        extractedDocData = null;
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

  async function processUploadedFile(file, fileInputEl) {
    const fileRules = RuleEngine.getFileRules();

    // 1. Fast File Validation (Size, MIME, Extension)
    const fileIssues = FileValidator.validate(file, fileRules);

    // 2. Image Quality & Blur Checks (Canvas API)
    const qualityIssues = await ImageQuality.analyze(file, fileRules);

    // 3. Scrape the target form schema for AI-driven field mapping
    const formSchema = scrapeTargetForm(fileInputEl);
    console.log('[ErrorGuard] Form schema scraped for AI mapping:', formSchema);

    // 4. Asynchronous OCR & AI Pipeline
    Overlay.setAiProgress(10, 'Analyzing document in background...');
    let ocrResult = { text: '', confidence: 0 };
    let aiFieldMap = null; // Direct { fieldKey: value } map from Gemini

    try {
      // ── Try the new form-aware AI mapping endpoint first ──
      const bFetch = window.ErrorGuard.backendFetch || fetch;
      let backendUrl = 'http://localhost:5001';
      let healthCheck = await bFetch(`${backendUrl}/api/health`).catch(() => null);
      if (!healthCheck || !healthCheck.ok) {
        backendUrl = 'http://localhost:5000';
        healthCheck = await bFetch(`${backendUrl}/api/health`).catch(() => null);
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
        const detectedMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
        const mapRes = await bFetch(`${backendUrl}/api/map-form-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: detectedMime,
            fileName: file.name,
            formSchema
          })
        });

        if (mapRes && mapRes.ok) {
          const mapData = await mapRes.json();
          if (mapData.success && mapData.fieldMap) {
            aiFieldMap = mapData.fieldMap;
            Overlay.setAiProgress(100, 'AI Field Mapping Complete ✓');
            console.log('[ErrorGuard] AI Field Map received:', aiFieldMap);
            Logger.info('ContentScript', 'AI form-mapping succeeded', aiFieldMap);

            extractedDocData = {
              name: aiFieldMap.fullName || aiFieldMap.name || null,
              dob: aiFieldMap.dob || null,
              aadhaarNo: aiFieldMap.aadhaarNumber || null,
              panNo: aiFieldMap.panNumber || null,
              certificateNo: aiFieldMap.certificateNo || null,
              docType: aiFieldMap.aadhaarNumber ? 'AADHAAR' : (aiFieldMap.panNumber ? 'PAN' : 'CERTIFICATE'),
              raw: JSON.stringify(aiFieldMap),
              ocrConfidence: 0.98
            };
            Overlay.setAiReady(extractedDocData);
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

    // 5. Structured Document Parsing (only if not already parsed by Gemini)
    if (!extractedDocData) {
      extractedDocData = DocumentParser.parse(ocrResult.text, ocrResult.aiData);
      extractedDocData.ocrConfidence = ocrResult.confidence;
      Overlay.setAiReady(extractedDocData);
    }

    console.log('================== [ErrorGuard OCR] RAW TEXT START ==================');
    console.log(extractedDocData?.raw || ocrResult.text || '(No text extracted)');
    console.log('================== [ErrorGuard OCR] RAW TEXT END ====================');
    console.log('[ErrorGuard] Parsed Document Structure:', extractedDocData);

    // 6. Show Auto-Fill Banner
    if (aiFieldMap) {
      // Build a synthetic docData from the AI field map so the banner's
      // guard check (docData.name / docData.dob / docData.certificateNo) passes.
      // The banner needs at least one non-null value to render.
      const bannerDocData = {
        name: aiFieldMap.fullName || extractedDocData.name || null,
        dob: aiFieldMap.dob || extractedDocData.dob || null,
        certificateNo: aiFieldMap.aadhaarNumber || aiFieldMap.panNumber || aiFieldMap.certificateNo || extractedDocData.certificateNo || null,
        docType: extractedDocData.docType || 'DOCUMENT'
      };

      const hasAnyData = bannerDocData.name || bannerDocData.dob || bannerDocData.certificateNo;
      if (hasAnyData) {
        Overlay.showAutoFillBanner(bannerDocData, () => applyFieldMap(aiFieldMap));
      }
    } else {
      // Legacy fallback path: use parsed doc data + semantic matching
      const currentScan = Detector.scan();
      const hasBlanks = currentScan.fields.some(f =>
        f.semantic &&
        (f.semantic.type === 'FULL_NAME' || f.semantic.type === 'DOB' || f.semantic.type === 'CERTIFICATE_NUMBER') &&
        !f.value
      );
      if (hasBlanks && (extractedDocData.name || extractedDocData.dob || extractedDocData.certificateNo)) {
        Overlay.showAutoFillBanner(extractedDocData, () => applyAutoFill(extractedDocData));
      }
    }

    // 7. Complete evaluation with newly extracted document data
    await runEvaluation({
      showAlerts: userHasCheckedErrors,
      cachedFileIssues: fileIssues,
      cachedQualityIssues: qualityIssues
    });
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

      el.value = String(value);
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
  window.ErrorGuard.reEvaluate = async function (opts = {}) {
    const showAlerts = (opts && opts.showAlerts !== undefined) ? opts.showAlerts : true;
    if (showAlerts) userHasCheckedErrors = true;
    Logger.info('ContentScript', 'Manual re-scan triggered by user.', { showAlerts });
    return await runEvaluation({ showAlerts, openDrawer: opts && opts.openDrawer });
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
    const profile = RuleEngine.getProfile();
    const fileRules = RuleEngine.getFileRules();

    // Extract Form Key-Value Map
    const formData = {};
    let hasFileInput = false;
    for (const item of scanResult.fields) {
      const val = item.value;
      if (item.semantic) {
        if (item.semantic.type === 'FULL_NAME') formData.full_name = val;
        if (item.semantic.type === 'DOB') formData.dob = val;
        if (item.semantic.type === 'CERTIFICATE_NUMBER') formData.certificate_no = val;
        if (item.semantic.type === 'AADHAAR_NUMBER') formData.aadhaar_no = val;
        if (item.semantic.type === 'PAN_NUMBER') formData.pan_no = val;
        if (item.semantic.type === 'EMAIL') formData.email = val;
        if (item.semantic.type === 'PHONE') formData.phone = val;
        if (item.semantic.type === 'DECLARATION') formData.declaration = item.field.checked;
        if (item.semantic.type === 'FILE_UPLOAD' || (item.field.getAttribute && item.field.getAttribute('type') === 'file')) {
          hasFileInput = true;
          if (item.field.files && item.field.files[0]) {
            currentFile = item.field.files[0];
          }
        }
      }
      if (item.field.id && val) formData[item.field.id] = val;
      else if (item.field.name && val) formData[item.field.name] = val;
    }
    formData.hasFile = !!currentFile;
    formData.hasFileInput = hasFileInput;

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

      // Check C1: Aadhaar Number Cross-Check
      if (formData.aadhaar_no) {
        const docAadhaar = extractedDocData.aadhaarNo || (extractedDocData.docType === 'AADHAAR' ? extractedDocData.certificateNo : null);
        if (docAadhaar) {
          const certComp = Matcher.compareIdentifier(formData.aadhaar_no, docAadhaar);
          if (!certComp.match) {
            const normAadhaar = Normalize.identifier(formData.aadhaar_no);
            const normDocAadhaar = Normalize.identifier(docAadhaar);
            if (normAadhaar !== normDocAadhaar) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: 'AADHAAR_NUMBER',
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
      if (formData.pan_no) {
        const docPan = extractedDocData.panNo || (extractedDocData.docType === 'PAN' ? extractedDocData.certificateNo : null);
        if (docPan) {
          const certComp = Matcher.compareIdentifier(formData.pan_no, docPan);
          if (!certComp.match) {
            const normPan = Normalize.identifier(formData.pan_no);
            const normDocPan = Normalize.identifier(docPan);
            if (normPan !== normDocPan) {
              crossCheckIssues.push({
                code: 'IDENTIFIER_MISMATCH',
                field: 'PAN_NUMBER',
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
    Overlay.update(latestReport, { showAlerts, openDrawer });

    // 5b. Show 1-Click Auto-Correct Chips for Mismatches (only when error alerts are requested)
    Overlay.clearAutoCorrectChips();
    if (showAlerts && extractedDocData) {
      for (const issue of crossCheckIssues) {
        if (issue.code === 'NAME_MISMATCH' && extractedDocData.name) {
          const nameField = scanResult.fields.find(f => f.semantic?.type === 'FULL_NAME');
          if (nameField && nameField.field) {
            Overlay.showAutoCorrectChip(nameField.field, extractedDocData.name, () => {
              nameField.field.value = extractedDocData.name;
              nameField.field.dispatchEvent(new Event('input', { bubbles: true }));
              nameField.field.dispatchEvent(new Event('change', { bubbles: true }));
              runEvaluation({ showAlerts: true });
            });
          }
        }
        if (issue.code === 'DOB_MISMATCH' && extractedDocData.dob) {
          const dobField = scanResult.fields.find(f => f.semantic?.type === 'DOB');
          if (dobField && dobField.field) {
            const iso = Normalize.date(extractedDocData.dob);
            const targetVal = dobField.field.type === 'date' ? (iso || extractedDocData.dob) : extractedDocData.dob;
            Overlay.showAutoCorrectChip(dobField.field, targetVal, () => {
              dobField.field.value = targetVal;
              dobField.field.dispatchEvent(new Event('input', { bubbles: true }));
              dobField.field.dispatchEvent(new Event('change', { bubbles: true }));
              runEvaluation({ showAlerts: true });
            });
          }
        }
      }
    }

    // 6. Persist to Chrome Storage for Popup
    await Storage.set('ACTIVE_GUARD_REPORT', latestReport);

    return latestReport;
  }

  // Pre-Submission Interceptor
  async function handleFormSubmit(e) {
    // Completely ignore any form events originating inside Error Guard's UI
    if (e.target && e.target.closest && e.target.closest('#error-guard-drawer, #error-guard-badge, #error-guard-modal, #eg-autofill-banner, #eg-wrongdoc-banner, #eg-blur-banner, [class*="eg-"], [id*="eg"]')) {
      return;
    }

    userHasCheckedErrors = true;
    // Run evaluation right before submitting with visual alerts active
    const report = await runEvaluation({ showAlerts: true });

    if (report.issues.blocking.length > 0) {
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
    // 1. Completely ignore clicks originating from any Error Guard UI overlay, drawer, badge, or toolbar
    if (e.target && e.target.closest && e.target.closest('#error-guard-drawer, #error-guard-badge, #error-guard-modal, #eg-autofill-banner, #eg-wrongdoc-banner, #eg-blur-banner, [class*="eg-"], [id*="eg"]')) {
      return;
    }

    const btn = e.target.closest('button, input[type="submit"], [role="button"], a.btn, a.button');
    if (!btn) return;

    if (btn.closest('#error-guard-drawer, #error-guard-badge, #error-guard-modal, #eg-autofill-banner, #eg-wrongdoc-banner, #eg-blur-banner, [class*="eg-"], [id*="eg"]')) {
      return;
    }

    const btnText = (btn.textContent || btn.value || '').toLowerCase().trim();
    const isSubmitOrLogin = btn.type === 'submit' ||
      btnText.includes('submit') || btnText.includes('apply') || btnText.includes('proceed') ||
      btnText.includes('log in') || btnText.includes('login') || btnText.includes('sign in') ||
      btnText.includes('signin') || btnText.includes('continue');

    if (isSubmitOrLogin) {
      userHasCheckedErrors = true;
      const report = await runEvaluation({ showAlerts: true });
      if (report.issues.blocking.length > 0) {
        Logger.warn('SubmissionGuard', 'Blocked submit/login button click', report.issues.blocking);
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