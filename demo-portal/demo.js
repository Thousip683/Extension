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
  if (certUpload) setupFileUpload(certUpload, filePreviewCert, previewNameCert, previewSizeCert, removeCertBtn);

  // Auto-format Aadhaar Number into 4-digit groups (XXXX XXXX XXXX) & live validation hint
  if (aadhaarNumber) {
    const aadhaarHint = aadhaarNumber.parentElement ? aadhaarNumber.parentElement.querySelector('.field-hint') : null;
    const updateAadhaarHint = () => {
      const digits = aadhaarNumber.value.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 12) {
        aadhaarNumber.setCustomValidity(`Aadhaar number must be exactly 12 digits (currently ${digits.length} entered).`);
        if (aadhaarHint) {
          aadhaarHint.textContent = `⚠️ Incomplete Aadhaar: exactly 12 digits required (${digits.length}/12 entered).`;
          aadhaarHint.style.color = '#dc2626';
          aadhaarHint.style.fontWeight = '600';
        }
      } else {
        aadhaarNumber.setCustomValidity('');
        if (aadhaarHint) {
          aadhaarHint.textContent = '12-digit Unique Identification Number printed on Aadhaar card.';
          aadhaarHint.style.color = '';
          aadhaarHint.style.fontWeight = '';
        }
      }
    };

    aadhaarNumber.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 12);
      let formatted = '';
      for (let i = 0; i < val.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += val[i];
      }
      e.target.value = formatted;
      updateAadhaarHint();
    });

    aadhaarNumber.addEventListener('blur', updateAadhaarHint);
  }

  // Auto-uppercase PAN Number (ABCDE1234F) & live validation hint
  if (panNumber) {
    const panHint = panNumber.parentElement ? panNumber.parentElement.querySelector('.field-hint') : null;
    const updatePanHint = () => {
      const val = panNumber.value.trim().toUpperCase();
      if (val.length > 0 && (val.length < 10 || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val))) {
        panNumber.setCustomValidity('PAN must be 10 characters (5 letters, 4 digits, 1 letter, e.g. ABCDE1234F).');
        if (panHint) {
          panHint.textContent = `⚠️ Incomplete/Invalid PAN: 10 alphanumeric characters required (e.g. ABCDE1234F). Currently ${val.length}/10.`;
          panHint.style.color = '#dc2626';
          panHint.style.fontWeight = '600';
        }
      } else {
        panNumber.setCustomValidity('');
        if (panHint) {
          panHint.textContent = '10-character alphanumeric PAN issued by Income Tax Department.';
          panHint.style.color = '';
          panHint.style.fontWeight = '';
        }
      }
    };

    panNumber.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      updatePanHint();
    });

    panNumber.addEventListener('blur', updatePanHint);
  }

  // Live Mobile Number Validation (must start with 6-9 range and be 10 digits)
  function setupPhoneValidation(phoneInput) {
    if (!phoneInput) return;
    const phoneHint = phoneInput.parentElement ? phoneInput.parentElement.querySelector('.field-hint') : null;
    const defaultHint = phoneHint ? phoneHint.textContent : '';

    const updatePhoneHint = () => {
      let val = phoneInput.value.trim().replace(/[\s\-]/g, '');
      if (val.startsWith('+91')) val = val.slice(3);
      if (!val) {
        phoneInput.setCustomValidity('');
        if (phoneHint) {
          phoneHint.textContent = defaultHint;
          phoneHint.style.color = '';
          phoneHint.style.fontWeight = '';
        }
        return;
      }

      if (!/^[6-9]/.test(val)) {
        phoneInput.setCustomValidity('Mobile number must begin with a digit between 6 and 9 (6, 7, 8, or 9).');
        if (phoneHint) {
          phoneHint.textContent = `⚠️ Invalid Mobile Number: must start with 6, 7, 8, or 9 (starts with "${val[0]}").`;
          phoneHint.style.color = '#dc2626';
          phoneHint.style.fontWeight = '600';
        }
      } else if (val.length < 10) {
        phoneInput.setCustomValidity(`Mobile number must be exactly 10 digits (${val.length}/10 entered).`);
        if (phoneHint) {
          phoneHint.textContent = `⚠️ Incomplete Mobile Number: exactly 10 digits required (${val.length}/10 entered).`;
          phoneHint.style.color = '#dc2626';
          phoneHint.style.fontWeight = '600';
        }
      } else {
        phoneInput.setCustomValidity('');
        if (phoneHint) {
          phoneHint.textContent = '✅ Valid 10-digit mobile number format.';
          phoneHint.style.color = '#15803d';
          phoneHint.style.fontWeight = '600';
        }
      }
    };

    phoneInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      updatePhoneHint();
    });

    phoneInput.addEventListener('blur', updatePhoneHint);
  }

  setupPhoneValidation(phone);
  setupPhoneValidation(document.getElementById('alternatePhone'));

  // Live Bank Account Number Validation (9 to 18 digits)
  const bankAccountNo = document.getElementById('bankAccountNo');
  if (bankAccountNo) {
    const bankHint = bankAccountNo.parentElement ? bankAccountNo.parentElement.querySelector('.field-hint') : null;
    const defaultHint = bankHint ? bankHint.textContent : '';

    const updateBankHint = () => {
      const val = bankAccountNo.value.trim().replace(/[\s\-]/g, '');
      if (!val) {
        bankAccountNo.setCustomValidity('');
        if (bankHint) {
          bankHint.textContent = defaultHint;
          bankHint.style.color = '';
          bankHint.style.fontWeight = '';
        }
        return;
      }

      if (val.length < 9) {
        bankAccountNo.setCustomValidity(`Bank Account Number must be at least 9 digits (${val.length} entered).`);
        if (bankHint) {
          bankHint.textContent = `⚠️ Incomplete Account Number: 9 to 18 digits required (${val.length}/9 minimum entered).`;
          bankHint.style.color = '#dc2626';
          bankHint.style.fontWeight = '600';
        }
      } else if (val.length > 18) {
        bankAccountNo.setCustomValidity(`Bank Account Number cannot exceed 18 digits (${val.length} entered).`);
        if (bankHint) {
          bankHint.textContent = `⚠️ Too many digits: maximum 18 digits allowed (${val.length}/18 entered).`;
          bankHint.style.color = '#dc2626';
          bankHint.style.fontWeight = '600';
        }
      } else {
        bankAccountNo.setCustomValidity('');
        if (bankHint) {
          bankHint.textContent = `✅ Valid bank account number length (${val.length} digits).`;
          bankHint.style.color = '#15803d';
          bankHint.style.fontWeight = '600';
        }
      }
    };

    bankAccountNo.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 18);
      updateBankHint();
    });

    bankAccountNo.addEventListener('blur', updateBankHint);
  }

  // Live Bank IFSC Code Validation (11 characters: 4 letters, 0, 6 branch characters)
  const ifscCode = document.getElementById('ifscCode');
  if (ifscCode) {
    const ifscHint = ifscCode.parentElement ? ifscCode.parentElement.querySelector('.field-hint') : null;
    const defaultHint = ifscHint ? ifscHint.textContent : '';

    const updateIfscHint = () => {
      const val = ifscCode.value.trim().toUpperCase().replace(/[\s\-]/g, '');
      if (!val) {
        ifscCode.setCustomValidity('');
        if (ifscHint) {
          ifscHint.textContent = defaultHint;
          ifscHint.style.color = '';
          ifscHint.style.fontWeight = '';
        }
        return;
      }

      if (val.length < 11) {
        ifscCode.setCustomValidity(`IFSC Code must be exactly 11 characters (${val.length}/11 entered).`);
        if (ifscHint) {
          ifscHint.textContent = `⚠️ Incomplete IFSC: exactly 11 characters required (${val.length}/11 entered).`;
          ifscHint.style.color = '#dc2626';
          ifscHint.style.fontWeight = '600';
        }
      } else if (val[4] === 'O') {
        ifscCode.setCustomValidity('The 5th character of IFSC must be the digit zero (0), not the letter "O".');
        if (ifscHint) {
          ifscHint.textContent = '⚠️ Invalid IFSC: 5th character must be number 0, not letter "O" (e.g. SBIN0... not SBINO...).';
          ifscHint.style.color = '#dc2626';
          ifscHint.style.fontWeight = '600';
        }
      } else if (!/^[A-Z]{4}/.test(val)) {
        ifscCode.setCustomValidity('First 4 characters of IFSC must be alphabetic bank letters.');
        if (ifscHint) {
          ifscHint.textContent = '⚠️ Invalid Bank Code: first 4 characters must be letters (e.g. SBIN, HDFC, ICIC).';
          ifscHint.style.color = '#dc2626';
          ifscHint.style.fontWeight = '600';
        }
      } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(val)) {
        ifscCode.setCustomValidity('Invalid IFSC Code format (e.g. SBIN0001234).');
        if (ifscHint) {
          ifscHint.textContent = '⚠️ Invalid IFSC format: 4 letters, digit 0, followed by 6 alphanumeric branch characters.';
          ifscHint.style.color = '#dc2626';
          ifscHint.style.fontWeight = '600';
        }
      } else {
        ifscCode.setCustomValidity('');
        if (ifscHint) {
          ifscHint.textContent = `✅ Valid IFSC Code format (${val.slice(0, 4)} branch).`;
          ifscHint.style.color = '#15803d';
          ifscHint.style.fontWeight = '600';
        }
      }
    };

    ifscCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
      updateIfscHint();
    });

    ifscCode.addEventListener('blur', updateIfscHint);
  }

  // Live PIN Code Validation (6 digits, cannot start with 0)
  const pincodeInput = document.getElementById('pincode');
  if (pincodeInput) {
    const pinHint = pincodeInput.parentElement ? pincodeInput.parentElement.querySelector('.field-hint') : null;
    const defaultHint = pinHint ? pinHint.textContent : '';

    const updatePinHint = () => {
      const val = pincodeInput.value.trim().replace(/\D/g, '');
      if (!val) {
        pincodeInput.setCustomValidity('');
        if (pinHint) {
          pinHint.textContent = defaultHint;
          pinHint.style.color = '';
          pinHint.style.fontWeight = '';
        }
        return;
      }

      if (val.startsWith('0')) {
        pincodeInput.setCustomValidity('PIN Code cannot start with zero.');
        if (pinHint) {
          pinHint.textContent = '⚠️ Invalid PIN Code: Indian postal codes cannot start with 0.';
          pinHint.style.color = '#dc2626';
          pinHint.style.fontWeight = '600';
        }
      } else if (val.length < 6) {
        pincodeInput.setCustomValidity(`PIN Code must be exactly 6 digits (${val.length}/6 entered).`);
        if (pinHint) {
          pinHint.textContent = `⚠️ Incomplete PIN Code: exactly 6 digits required (${val.length}/6 entered).`;
          pinHint.style.color = '#dc2626';
          pinHint.style.fontWeight = '600';
        }
      } else {
        pincodeInput.setCustomValidity('');
        if (pinHint) {
          pinHint.textContent = '✅ Valid 6-digit PIN code format.';
          pinHint.style.color = '#15803d';
          pinHint.style.fontWeight = '600';
        }
      }
    };

    pincodeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      updatePinHint();
    });

    pincodeInput.addEventListener('blur', updatePinHint);
  }

  // Live Name Validation (letters, dots and spaces only; rejects symbols & digits)
  function setupNameValidation(inputEl) {
    if (!inputEl) return;
    const hint = inputEl.parentElement ? inputEl.parentElement.querySelector('.field-hint') : null;
    const defaultHint = hint ? hint.textContent : '';

    const updateNameHint = () => {
      const val = inputEl.value.trim();
      if (!val) {
        inputEl.setCustomValidity('');
        if (hint) {
          hint.textContent = defaultHint;
          hint.style.color = '';
          hint.style.fontWeight = '';
        }
        return;
      }

      if (/\d/.test(val)) {
        inputEl.setCustomValidity('Name cannot contain numeric digits.');
        if (hint) {
          hint.textContent = '⚠️ Invalid Name: numbers are not allowed in name fields.';
          hint.style.color = '#dc2626';
          hint.style.fontWeight = '600';
        }
      } else if (/[^a-zA-Z\s\.]/.test(val)) {
        const invalidChars = val.match(/[^a-zA-Z\s\.]/g) || [];
        const uniqueChars = [...new Set(invalidChars)].join(' ');
        inputEl.setCustomValidity('Name cannot contain special symbols.');
        if (hint) {
          hint.textContent = `⚠️ Invalid Name: special symbols (${uniqueChars}) are not allowed. Enter letters only.`;
          hint.style.color = '#dc2626';
          hint.style.fontWeight = '600';
        }
      } else if ((val.match(/[a-zA-Z]/g) || []).length < 2) {
        inputEl.setCustomValidity('Name must contain at least 2 letters.');
        if (hint) {
          hint.textContent = '⚠️ Incomplete Name: at least 2 alphabetic letters required.';
          hint.style.color = '#dc2626';
          hint.style.fontWeight = '600';
        }
      } else {
        inputEl.setCustomValidity('');
        if (hint) {
          hint.textContent = '✅ Valid name format.';
          hint.style.color = '#15803d';
          hint.style.fontWeight = '600';
        }
      }
    };

    inputEl.addEventListener('input', updateNameHint);
    inputEl.addEventListener('blur', updateNameHint);
  }

  setupNameValidation(document.getElementById('fullName'));
  setupNameValidation(document.getElementById('fatherName'));
  setupNameValidation(document.getElementById('motherName'));

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
