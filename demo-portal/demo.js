/**
 * Demo Portal Controller
 * Manages form interactions, scenario auto-loading, synthetic file population,
 * and simulated submission handling.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scholarshipForm');
  const fileInput = document.getElementById('certificateUpload');
  const filePreview = document.getElementById('filePreview');
  const previewName = document.getElementById('previewName');
  const previewSize = document.getElementById('previewSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const statusAlert = document.getElementById('statusAlert');

  // Input Fields
  const fullName = document.getElementById('fullName');
  const dob = document.getElementById('dob');
  const certNo = document.getElementById('certificateNo');
  const category = document.getElementById('category');
  const email = document.getElementById('email');
  const phone = document.getElementById('phone');
  const declaration = document.getElementById('declaration');

  // Helper to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Handle file selection
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      previewName.textContent = file.name;
      previewSize.textContent = formatBytes(file.size);
      filePreview.classList.remove('hidden');
    } else {
      filePreview.classList.add('hidden');
    }
  });

  // Remove file
  removeFileBtn.addEventListener('click', () => {
    fileInput.value = '';
    filePreview.classList.add('hidden');
    // Dispatch change event to notify guard extension
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Helper to attach a synthetic test file to the file input programmatically
  async function attachTestDoc(docPath, fileName, mimeType = 'image/png') {
    try {
      const response = await fetch(docPath);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      previewName.textContent = file.name;
      previewSize.textContent = formatBytes(file.size);
      filePreview.classList.remove('hidden');

      // Dispatch change event so the Pre-Submission Error Guard content script detects the new file
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
      console.warn('Could not auto-attach file from path:', docPath, err);
    }
  }

  function setFormFields({ name, birthDate, certificateNum, cat, mail, tel, dec }) {
    fullName.value = name || '';
    dob.value = birthDate || '';
    certNo.value = certificateNum || '';
    category.value = cat || '';
    email.value = mail || '';
    phone.value = tel || '';
    declaration.checked = !!dec;

    // Dispatch input events so the extension observer picks up values
    [fullName, dob, certNo, category, email, phone].forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    declaration.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Scenario 1: Perfect Match
  document.getElementById('loadScenarioValid').addEventListener('click', () => {
    setFormFields({
      name: 'Siva Kumar',
      birthDate: '2005-05-12', // 12/05/2005
      certificateNum: 'AP123456',
      cat: 'BC-A',
      mail: 'siva.kumar@example.com',
      tel: '9876543210',
      dec: true
    });
    attachTestDoc('test-docs/valid_certificate.png', 'valid_certificate.png');
    showAlert('Loaded Scenario 1: Perfect Application (all fields & valid certificate).', 'success');
  });

  // Scenario 2: Name Typo Mismatch
  document.getElementById('loadScenarioNameMismatch').addEventListener('click', () => {
    setFormFields({
      name: 'Siva Kumar', // Form says Siva Kumar
      birthDate: '2005-05-12',
      certificateNum: 'AP123456',
      cat: 'BC-A',
      mail: 'siva.kumar@example.com',
      tel: '9876543210',
      dec: true
    });
    // Document says Siva Kumarr
    attachTestDoc('test-docs/name_mismatch.png', 'name_mismatch.png');
    showAlert('Loaded Scenario 2: Name Mismatch (Form has "Siva Kumar", Certificate has "Siva Kumarr").', 'error');
  });

  // Scenario 3: DOB Mismatch
  document.getElementById('loadScenarioDobMismatch').addEventListener('click', () => {
    setFormFields({
      name: 'Siva Kumar',
      birthDate: '2005-05-12', // Form has 12/05/2005
      certificateNum: 'AP123456',
      cat: 'BC-A',
      mail: 'siva.kumar@example.com',
      tel: '9876543210',
      dec: true
    });
    // Document has 18/09/2004
    attachTestDoc('test-docs/dob_mismatch.png', 'dob_mismatch.png');
    showAlert('Loaded Scenario 3: DOB Mismatch (Form has 12/05/2005, Certificate has 18/09/2004).', 'error');
  });

  // Scenario 4: Oversized Document
  document.getElementById('loadScenarioOversized').addEventListener('click', () => {
    setFormFields({
      name: 'Siva Kumar',
      birthDate: '2005-05-12',
      certificateNum: 'AP123456',
      cat: 'BC-A',
      mail: 'siva.kumar@example.com',
      tel: '9876543210',
      dec: true
    });
    attachTestDoc('test-docs/oversized_doc.png', 'oversized_doc.png');
    showAlert('Loaded Scenario 4: Oversized Document (> 2MB).', 'error');
  });

  // Scenario 5: Blurry Document
  document.getElementById('loadScenarioBlurry').addEventListener('click', () => {
    setFormFields({
      name: 'Siva Kumar',
      birthDate: '2005-05-12',
      certNo: 'AP123456',
      cat: 'BC-A',
      mail: 'siva.kumar@example.com',
      tel: '9876543210',
      dec: true
    });
    attachTestDoc('test-docs/blurry_cert.png', 'blurry_cert.png');
    showAlert('Loaded Scenario 5: Blurry Scan (Document readability warning).', 'error');
  });

  // Scenario 6: Missing Fields
  document.getElementById('loadScenarioMissing').addEventListener('click', () => {
    setFormFields({
      name: '',
      birthDate: '',
      certNo: '',
      cat: '',
      mail: '',
      tel: '',
      dec: false
    });
    fileInput.value = '';
    filePreview.classList.add('hidden');
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    showAlert('Loaded Scenario 6: Incomplete form with missing mandatory fields.', 'error');
  });

  // Reset
  document.getElementById('resetFormBtn').addEventListener('click', () => {
    form.reset();
    filePreview.classList.add('hidden');
    statusAlert.classList.add('hidden');
    // Dispatch reset event
    form.querySelectorAll('input, select').forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  function showAlert(message, type = 'success') {
    statusAlert.textContent = message;
    statusAlert.className = `status-alert ${type}`;
    statusAlert.classList.remove('hidden');
    setTimeout(() => {
      // Keep it visible for 6 seconds
    }, 6000);
  }

  // Handle Form Submission (Normal fallback if extension guard allows)
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Check basic HTML validation
    if (!form.checkValidity()) {
      showAlert('⚠️ Portal validation error: Please fill all required fields correctly before submitting.', 'error');
      return;
    }

    // Success simulation
    const refId = 'AP-SCH-' + Math.floor(100000 + Math.random() * 900000);
    showAlert(`🎉 APPLICATION SUBMITTED SUCCESSFULLY! Reference ID: ${refId}. An SMS confirmation has been sent to ${phone.value}.`, 'success');
  });
});
