# 🛡️ Pre-Submission Error Guard for Official Forms
### InnovX-26 | Problem Statement 2 — Hackathon Project

> **Product Promise:** Prevent avoidable application rejection, costly rework, and clerical mistakes by validating form inputs and uploaded supporting documents **before** the applicant clicks Submit.

---

## 🚀 Quick Start (Under 2 Minutes)

### 1. Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked**.
4. Select the directory:
   ```text
   c:\Users\karth\Desktop\Hackthon\pre-submission-error-guard\extension
   ```
5. Pin the **Pre-Submission Error Guard** (🛡️) icon to your Chrome toolbar.

### 2. Launch the Demo Portal
Run the demo portal using Python or Node:
```powershell
# Using Python
python -m http.server 3000 --directory pre-submission-error-guard/demo-portal

# OR using Node
cd pre-submission-error-guard
npm start
```
Open **`http://localhost:3000`** in Chrome.

---

## 🎯 3-Minute Hackathon Live Demo Script

The top of the demo portal features the **⚡ Hackathon Live Demo Panel** with one-click scenario loaders:

| Scenario | Button | What Happens | Result |
| :--- | :--- | :--- | :--- |
| **1. Perfect Application** | `✅ 1. Perfect Match` | Loads valid details + certificate for **Siva Kumar** (DOB: 12/05/2005). | **READY TO SUBMIT (100%)** • Submission succeeds. |
| **2. Name Typo Mismatch** | `⚠️ 2. Name Typo Mismatch` | Form has *Siva Kumar*, but uploaded certificate has *Siva Kumarr*. | **NAME_MISMATCH Warning** • Highlights discrepancy. |
| **3. DOB Mismatch** | `❌ 3. DOB Mismatch` | Form has *12/05/2005*, but certificate has *18/09/2004*. | **🛑 BLOCKING DOB Mismatch** • Submissions intercepted. |
| **4. Oversized File** | `📁 4. Oversized File` | Uploads 23 MB document exceeding the 2 MB portal limit. | **🛑 FILE_TOO_LARGE** • Explains allowed limit. |
| **5. Blurry Document** | `👁️ 5. Blurry Document` | Uploads an out-of-focus, low-contrast certificate. | **DOCUMENT_LOW_QUALITY Warning** • Advises re-scan. |
| **6. Missing Fields** | `📝 6. Missing Fields` | Form fields left blank. | **REQUIRED_FIELD_MISSING** • Guides applicant. |

### Testing Submission Blocking
1. Click any error scenario (e.g. **DOB Mismatch**).
2. Click the blue **"Submit Application"** button at the bottom.
3. Notice that the form **shakes** and the **Pre-Submission Blocking Dialog** immediately pops up to prevent the user from losing their application fee or facing official rejection.

---

## 🏗️ System Architecture

```text
pre-submission-error-guard/
├── demo-portal/                     # Official Scholarship Demo Application Portal
│   ├── index.html                   # Realistic government form with one-click test bar
│   ├── style.css                    # Professional portal design
│   ├── demo.js                      # Form logic, test file injector & simulation
│   └── test-docs/                   # Synthetic official certificates (PNG)
│       ├── generate_test_docs.py    # Python Pillow certificate generator
│       ├── valid_certificate.png    # Siva Kumar • 12/05/2005 • AP123456
│       ├── name_mismatch.png        # Siva Kumarr (typo)
│       ├── dob_mismatch.png         # 18/09/2004 (date discrepancy)
│       ├── oversized_doc.png        # 23 MB (exceeds 2 MB rule)
│       └── blurry_cert.png          # Blurry low-contrast scan
│
├── extension/                       # Chromium Manifest V3 Extension
│   ├── manifest.json                # MV3 configuration
│   ├── background/
│   │   └── service-worker.js        # Extension lifecycle & tab messaging broker
│   ├── content/
│   │   ├── content.js               # Content orchestrator & submit interceptor
│   │   ├── detector.js              # Semantic form field & submit button detector
│   │   ├── overlay.js               # Floating shield badge, field outlines & modal
│   │   └── content.css              # In-page UI styling
│   ├── popup/
│   │   ├── popup.html               # Health score gauge & checklist dashboard
│   │   ├── popup.css                # Modern dark-mode styling
│   │   └── popup.js                 # Dashboard controller
│   ├── modules/
│   │   ├── field-mapper.js          # Canonical field classification
│   │   ├── form-validator.js        # Mandatory fields & format rules
│   │   ├── file-validator.js        # File size, MIME type & extension checks
│   │   ├── image-quality.js         # Canvas brightness, contrast, dimensions & blur
│   │   ├── ocr-engine.js            # Client-side OCR pipeline with progress
│   │   ├── document-parser.js       # Pattern-based extraction (Name, DOB, ID)
│   │   ├── matcher.js               # Levenshtein distance & canonical date matcher
│   │   ├── rule-engine.js           # Portal profile loader & schema fallback
│   │   └── error-engine.js          # Aggregator, error taxonomy & Readiness engine
│   ├── rules/
│   │   ├── demo-portal.json         # AP Scholarship Portal rules configuration
│   │   └── schemas.js               # Default generic rules fallback
│   ├── utils/
│   │   ├── normalize.js             # String, date (DD/MM/YYYY vs ISO), ID cleaners
│   │   ├── logger.js                # Privacy-safe logger (masks PII)
│   │   └── storage.js               # chrome.storage.local wrapper
│   └── assets/                      # Extension icons (16px, 48px, 128px)
├── test/
│   └── runner.js                    # Automated unit tests (12 tests)
├── package.json
└── README.md
```

---

## 📊 Error Taxonomy Matrix

| Error Code | Meaning | Severity | User Guidance |
| :--- | :--- | :--- | :--- |
| `REQUIRED_FIELD_MISSING` | Mandatory form input is blank | **BLOCKING** | Enter required value before proceeding. |
| `INVALID_DATE` | Date cannot be parsed | **BLOCKING** | Enter valid date (DD/MM/YYYY). |
| `FILE_TYPE_NOT_ALLOWED` | Uploaded format unsupported | **BLOCKING** | Upload PNG, JPG, or PDF. |
| `FILE_TOO_LARGE` | File exceeds portal limit (2 MB) | **BLOCKING** | Compress file to under 2 MB. |
| `IMAGE_TOO_SMALL` | Resolution below 400x300 px | **WARNING** | Upload higher resolution copy. |
| `DOCUMENT_LOW_QUALITY` | Scan appears blurry or unreadable | **WARNING** | Upload clearer, in-focus scan. |
| `NAME_MISMATCH` | Form name differs from certificate | **BLOCKING / REVIEW** | Verify spelling against certificate. |
| `DOB_MISMATCH` | Form DOB differs from document | **BLOCKING** | Correct DOB to match original. |
| `IDENTIFIER_MISMATCH` | Certificate number does not match | **BLOCKING** | Verify certificate number. |

---

## 🔒 Privacy & Security by Design

* **Local-First Processing:** Document analysis, Canvas quality checks, and OCR run directly inside the browser.
* **Zero Cloud Storage:** Raw certificates and applicant PII are **never** uploaded to an external server.
* **Privacy-Safe Logging:** Console logs automatically mask sensitive personal details (e.g. `S*** K***`, `AP****56`).

---

## 🧪 Running Automated Unit Tests
```powershell
node pre-submission-error-guard/test/runner.js
```
Validates normalization, date handling, Levenshtein distance calculations, file size boundaries, and error aggregation.
