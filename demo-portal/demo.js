/**
 * JnanaBhumi - Post-Matric Scholarship & Fee Reimbursement Portal Controller
 * Manages form interactions, multi-document file uploads, preview handling,
 * input formatting (Aadhaar & PAN), security captcha, accessibility controls,
 * and official government submission simulation.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scholarshipForm');
  const statusAlert = document.getElementById('statusAlert');

  // Input Fields
  const fullName = document.getElementById('fullName');
  const fatherName = document.getElementById('fatherName');
  const dob = document.getElementById('dob');
  const gender = document.getElementById('gender');
  const category = document.getElementById('category');
  const certNo = document.getElementById('certificateNo');
  const phone = document.getElementById('phone');
  const email = document.getElementById('email');
  const aadhaarNumber = document.getElementById('aadhaarNumber');
  const panNumber = document.getElementById('panNumber');
  const aadhaarConsent = document.getElementById('aadhaarConsent');
  const declaration = document.getElementById('declaration');

  // File Upload Elements
  const aadhaarUpload = document.getElementById('aadhaarUpload');
  const filePreviewAadhaar = document.getElementById('filePreviewAadhaar');
  const previewNameAadhaar = document.getElementById('previewNameAadhaar');
  const previewSizeAadhaar = document.getElementById('previewSizeAadhaar');
  const removeAadhaarBtn = document.getElementById('removeAadhaarBtn');

  const panUpload = document.getElementById('panUpload');
  const filePreviewPan = document.getElementById('filePreviewPan');
  const previewNamePan = document.getElementById('previewNamePan');
  const previewSizePan = document.getElementById('previewSizePan');
  const removePanBtn = document.getElementById('removePanBtn');

  const certUpload = document.getElementById('certificateUpload');
  const filePreviewCert = document.getElementById('filePreviewCert');
  const previewNameCert = document.getElementById('previewNameCert');
  const previewSizeCert = document.getElementById('previewSizeCert');
  const removeCertBtn = document.getElementById('removeCertBtn');

  const resetFormBtn = document.getElementById('resetFormBtn');

  // Accessibility Controls (A- / A / A+)
  const fontDecBtn = document.getElementById('fontDecBtn');
  const fontNormalBtn = document.getElementById('fontNormalBtn');
  const fontIncBtn = document.getElementById('fontIncBtn');

  let currentFontSize = 100;
  if (fontDecBtn) {
    fontDecBtn.addEventListener('click', () => {
      if (currentFontSize > 85) {
        currentFontSize -= 5;
        document.body.style.fontSize = currentFontSize + '%';
      }
    });
  }
  if (fontNormalBtn) {
    fontNormalBtn.addEventListener('click', () => {
      currentFontSize = 100;
      document.body.style.fontSize = '100%';
    });
  }
  if (fontIncBtn) {
    fontIncBtn.addEventListener('click', () => {
      if (currentFontSize < 125) {
        currentFontSize += 5;
        document.body.style.fontSize = currentFontSize + '%';
      }
    });
  }

  // Security Captcha Generator
  const captchaTextEl = document.getElementById('captchaText');
  const captchaRefreshBtn = document.getElementById('captchaRefreshBtn');
  const captchaAudioBtn = document.getElementById('captchaAudioBtn');
  const captchaInput = document.getElementById('captchaInput');

  let currentCaptcha = '7BX9K';

  function generateCaptcha() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentCaptcha = code;
    if (captchaTextEl) {
      captchaTextEl.textContent = code.split('').join(' ');
    }
  }

  if (captchaRefreshBtn) {
    captchaRefreshBtn.addEventListener('click', () => {
      generateCaptcha();
      if (captchaInput) captchaInput.value = '';
    });
  }

  if (captchaAudioBtn) {
    captchaAudioBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(currentCaptcha.split('').join(' '));
        utter.rate = 0.8;
        window.speechSynthesis.speak(utter);
      } else {
        alert('Audio Captcha: ' + currentCaptcha.split('').join(' '));
      }
    });
  }

  // Initialize fresh captcha
  generateCaptcha();

  // Helper to format bytes
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Setup file preview and remove listener for an upload control
  function setupFileUpload(fileInput, previewEl, nameEl, sizeEl, removeBtn) {
    if (!fileInput) return;

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = formatBytes(file.size);
        if (previewEl) previewEl.classList.remove('hidden');
      } else {
        if (previewEl) previewEl.classList.add('hidden');
      }
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        fileInput.value = '';
        if (previewEl) previewEl.classList.add('hidden');
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }

  setupFileUpload(aadhaarUpload, filePreviewAadhaar, previewNameAadhaar, previewSizeAadhaar, removeAadhaarBtn);
  setupFileUpload(panUpload, filePreviewPan, previewNamePan, previewSizePan, removePanBtn);
  setupFileUpload(certUpload, filePreviewCert, previewNameCert, previewSizeCert, removeCertBtn);

  // Auto-format Aadhaar Number into 4-digit groups (XXXX XXXX XXXX)
  if (aadhaarNumber) {
    aadhaarNumber.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 12);
      let formatted = '';
      for (let i = 0; i < val.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += val[i];
      }
      e.target.value = formatted;
    });
  }

  // Auto-uppercase PAN Number (ABCDE1234F)
  if (panNumber) {
    panNumber.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    });
  }

  // Reset Button Handler
  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all form entries?')) {
        form.reset();
        generateCaptcha();
        [filePreviewAadhaar, filePreviewPan, filePreviewCert].forEach(p => p?.classList.add('hidden'));
        if (statusAlert) statusAlert.classList.add('hidden');

        // Dispatch input/change events to clear any extension errors
        form.querySelectorAll('input, select').forEach(el => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    });
  }

  function showAlert(message, type = 'success') {
    if (!statusAlert) return;
    statusAlert.innerHTML = message;
    statusAlert.className = `status-alert ${type}`;
    statusAlert.classList.remove('hidden');
    statusAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Form Submission Handler
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Check basic HTML5 validation
      if (!form.checkValidity()) {
        showAlert('⚠️ <strong>Incomplete Submission:</strong> Please fill in all mandatory fields and attach required identity documents before submitting.', 'error');
        return;
      }

      // Check Captcha
      if (captchaInput && captchaInput.value.trim().toUpperCase() !== currentCaptcha.toUpperCase()) {
        showAlert('⚠️ <strong>Security Captcha Error:</strong> The entered security code does not match the captcha shown above. Please try again.', 'error');
        generateCaptcha();
        captchaInput.value = '';
        captchaInput.focus();
        return;
      }

      // Check declaration & consent
      if (!declaration.checked || (aadhaarConsent && !aadhaarConsent.checked)) {
        showAlert('⚠️ <strong>Statutory Consent Required:</strong> You must check the Aadhaar authentication consent and solemn affirmation boxes to submit.', 'error');
        return;
      }

      // Simulate official government registration
      const refId = 'AP-JVD-2026-' + Math.floor(100000 + Math.random() * 900000);
      const submitTime = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      showAlert(`
        🎉 <strong>APPLICATION SUBMITTED SUCCESSFULLY!</strong><br>
        Acknowledgement Reference Number: <strong>${refId}</strong><br>
        Scheme Name: <strong>Post-Matric Scholarship & Fee Reimbursement (JVD)</strong><br>
        Submission Timestamp: ${submitTime} IST<br>
        A formal acknowledgement receipt and SMS confirmation have been dispatched to <strong>${phone.value}</strong>.
      `, 'success');
    });
  }

  // Save Application Draft
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', () => {
      const draftId = 'DRAFT-JVD-' + Math.floor(10000 + Math.random() * 90000);
      showAlert(`💾 <strong>Draft Saved:</strong> Application draft saved locally under Reference #${draftId}. You can resume completion anytime within 15 days.`, 'success');
    });
  }
});
