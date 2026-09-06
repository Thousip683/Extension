# Pre-Submission Error Guard
## Phase-by-Phase Implementation & Build Guide

**Hackathon Project — Chrome/Chromium Extension**

> **Goal:** Detect common form and document mistakes before an official application is submitted.

---

# 1. Project Overview

Pre-Submission Error Guard is a browser extension that acts as a safety layer for official online forms.

It:

1. Detects form fields.
2. Monitors uploaded documents.
3. Validates file constraints.
4. Performs OCR on supported documents.
5. Extracts values such as name and date of birth.
6. Compares document values with information entered into the form.
7. Applies portal-specific rules.
8. Shows clear correction guidance.
9. Produces a final **READY TO SUBMIT** or **NOT READY** status.

## Core Workflow

```text
Official webpage
      ↓
Form detection
      ↓
User enters information + uploads documents
      ↓
File validation + document quality checks
      ↓
OCR / data extraction
      ↓
Form ↔ document cross-verification
      ↓
Portal-specific rules
      ↓
Error report / correction guidance
      ↓
READY TO SUBMIT or NOT READY
```

---

# 2. Product Boundary

## In Scope for MVP

- Chrome/Chromium extension
- HTML form field detection
- Name and DOB verification
- Image/PDF upload validation
- OCR for selected documents
- Basic readability checks
- Portal rule profiles
- Review / ready-to-submit status

## Not Required for MVP

- Native mobile app
- Support for every government website
- Full identity verification against government databases
- Digital-signature cryptography
- Perfect OCR for every language/document
- Advanced forensic document authenticity
- Automatic discovery of every portal rule
- Autonomous submission without user confirmation

---

# 3. Recommended MVP

Build the first version around these capabilities:

1. Detect text inputs, date fields, selects, textareas and file-upload controls.
2. Identify semantic fields such as full name, date of birth and certificate number.
3. Read configured portal requirements such as accepted file type and maximum size.
4. Validate uploaded image/PDF type, size and basic dimensions/page count.
5. Run OCR on supported images and PDF pages.
6. Extract Name and DOB using document-specific or generic patterns.
7. Compare those values with form values using normalization and fuzzy matching.
8. Display inline warnings and a final **READY TO SUBMIT / NOT READY** state.

---

# 4. Target Technical Architecture

```text
src/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── content.js
│   ├── detector.js
│   ├── overlay.js
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── modules/
│   ├── field-mapper.js
│   ├── form-validator.js
│   ├── file-validator.js
│   ├── image-quality.js
│   ├── pdf-analyzer.js
│   ├── ocr-engine.js
│   ├── document-parser.js
│   ├── matcher.js
│   ├── rule-engine.js
│   └── error-engine.js
├── rules/
│   ├── demo-portal.json
│   └── schemas.js
├── utils/
│   ├── normalize.js
│   ├── logger.js
│   └── storage.js
└── assets/
```

---

# 5. Technology Stack

| Layer | Recommended technology | Purpose |
|---|---|---|
| Extension | Chrome Manifest V3 | Extension lifecycle and permissions |
| Frontend | HTML + CSS + JavaScript | Fast hackathon implementation |
| Page integration | Content Scripts | Read/interact with webpage DOM |
| OCR | Tesseract.js initially | Text extraction from images |
| PDF | PDF.js | Render/read PDF pages for OCR |
| Image analysis | Canvas API | Dimensions, brightness, contrast and basic quality |
| Matching | Custom normalization + Levenshtein/fuzzy score | Compare form and document values |
| Rules | JSON configuration | Portal-specific constraints |
| Storage | `chrome.storage.local` | Local preferences and rule/cache data |
| Optional backend | Node.js + Express | Only where a server is genuinely required |

---

# 6. Important Design Principle

Use existing open-source projects as references, not as a code base to copy.

Useful reference categories:

- **Form Troubleshooter** → form-analysis ideas and extension structure
- **Government-form/OCR projects** → document extraction ideas
- **Browser form assistants** → semantic field mapping and UI ideas

The differentiating layer should be our own:

- validation logic
- cross-verification
- error explanation
- correction guidance
- pre-submission workflow

---

# 7. Phase 0 — Requirements Freeze & Team Setup

## Goal

Decide exactly what will be demonstrated.

## Tasks

- Freeze MVP to Name, DOB, document upload, file validation, OCR, matching and final status.
- Choose one fake/demo scholarship or application portal for the primary demonstration.
- Choose one or two document types.
- Prefer synthetic/test documents created specifically for the demo.
- Assign team roles.
- Create Git repository.
- Create issue board and branch strategy.

## Deliverable

One-page scope, repository, issue list and demo scenario.

## Exit Criteria

Every team member can explain the exact MVP and what is intentionally excluded.

---

# 8. Phase 1 — Development Environment & Extension Skeleton

## Goal

Load a minimal working extension.

## Tasks

- Install Node.js/npm if using a package workflow.
- Create project folders.
- Create Manifest V3 configuration.
- Create popup.
- Create content script.
- Create background service worker.
- Load the unpacked extension in `chrome://extensions`.
- Enable Developer mode.
- Verify content script runs on the local demo page.
- Add a simple extension icon and version.

## Deliverable

A blank but functioning extension that can inspect the demo webpage.

## Exit Criteria

Extension loads without errors and popup/content script communication works.

---

# 9. Phase 2 — Build the Demo Official-Form Website

## Goal

Create a predictable test environment before targeting real portals.

## Suggested form

```text
┌──────────────────────────────────────────┐
│       Government Scholarship Portal      │
├──────────────────────────────────────────┤
│ Full Name                                │
│ [ Siva Kumar                         ]   │
│                                          │
│ Date of Birth                            │
│ [ 12/05/2005                         ]   │
│                                          │
│ Certificate Number                       │
│ [ AP123456                           ]   │
│                                          │
│ Upload Certificate                       │
│ [ Choose File ]                          │
│                                          │
│         [ SUBMIT APPLICATION ]           │
└──────────────────────────────────────────┘
```

## Tasks

- Create Full Name field.
- Create DOB field.
- Add category/other fields.
- Add document upload.
- Add upload requirements.
- Add submit button.
- Build deliberate error states.

## Test States

- Correct application
- Name mismatch
- DOB mismatch
- Oversized file
- Wrong file type
- Low-resolution image
- Missing required field

## Deliverable

Standalone test portal with controlled errors.

## Exit Criteria

Every planned error can be reproduced on demand.

---

# 10. Phase 3 — Form Field Detection

## Goal

Make the extension understand the webpage.

## Tasks

Scan:

- `<input>`
- `<select>`
- `<textarea>`
- file inputs

Read:

- `label`
- `placeholder`
- `name`
- `id`
- `aria-label`
- nearby text

Create semantic field categories:

```text
FULL_NAME
DOB
CERTIFICATE_NUMBER
EMAIL
PHONE
FILE_UPLOAD
```

## Example

```javascript
{
  type: "FULL_NAME",
  elementId: "fullName",
  confidence: 0.96
}
```

## Field Name Normalization

These may all represent the same concept:

```text
full_name
fullname
applicant_name
candidateName
name
```

Map them to:

```text
FULL_NAME
```

## Exit Criteria

The extension correctly identifies the important fields on the demo portal.

---

# 11. Phase 4 — Portal Rule Engine

## Goal

Make validation depend on portal requirements rather than hard-coded logic.

## Tasks

- Create JSON rule profiles.
- Define required fields.
- Define accepted MIME types.
- Define maximum size.
- Define minimum dimensions.
- Define allowed extensions.
- Define expected document category.
- Associate rules with a demo hostname/portal identifier.
- Add generic fallback rules.
- Never guess unknown requirements.

## Example

```json
{
  "document": "income_certificate",
  "acceptedTypes": [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ],
  "maxSizeBytes": 2097152,
  "minWidth": 800,
  "minHeight": 600
}
```

## Exit Criteria

Changing the JSON rule changes validation behavior without rewriting core code.

---

# 12. Phase 5 — File Validation

## Goal

Catch simple upload mistakes immediately.

## Checks

- File name
- MIME type
- Extension
- File size
- Image width
- Image height
- PDF page count where feasible

## Example Result

```json
{
  "status": "ERROR",
  "code": "FILE_TOO_LARGE",
  "message": "File is 450 KB; maximum allowed is 200 KB."
}
```

## Exit Criteria

The system detects:

- wrong type
- oversized file
- obviously undersized image

---

# 13. Phase 6 — Document Quality Analysis

## Goal

Warn when a document may be difficult to read.

## Tasks

- Load image into Canvas.
- Check dimensions.
- Estimate brightness.
- Estimate contrast.
- Add a basic blur/sharpness heuristic if time permits.
- Classify quality:
  - GOOD
  - WARNING
  - POOR

## Important Wording

Use:

> “Document appears blurry.”

or:

> “Document may be difficult to read.”

Do **not** claim:

> “Document is fake.”

or:

> “Document is definitely invalid.”

## Exit Criteria

A deliberately low-quality test image produces a useful warning.

---

# 14. Phase 7 — OCR Pipeline

## Goal

Convert supported documents into searchable text.

## Recommended Tools

- Tesseract.js for image OCR
- PDF.js for PDF rendering
- Canvas for preprocessing

## Pipeline

```text
File
 ↓
Type check
 ↓
Image/PDF decode
 ↓
Optional preprocessing
 ↓
OCR
 ↓
Raw text
 ↓
Parser
```

## Tasks

- Integrate Tesseract.js.
- Integrate PDF.js.
- Run OCR after basic validation.
- Show OCR progress.
- Handle OCR failure gracefully.
- Avoid permanent storage of raw document data by default.

## Example UI

```text
Reading document...
████████████████░░░░ 80%
```

## Exit Criteria

A clean sample document produces sufficiently accurate text for Name and DOB extraction.

---

# 15. Phase 8 — Document Field Extraction

## Goal

Turn OCR text into structured values.

## Tasks

- Normalize whitespace.
- Normalize punctuation.
- Normalize case.
- Build patterns for Name.
- Build patterns for DOB.
- Build patterns for certificate number.
- Support alternate labels.

## Example OCR Text

```text
Name: Siva Kumar
Date of Birth: 12/05/2005
```

## Structured Result

```json
{
  "name": "Siva Kumar",
  "dob": "12/05/2005"
}
```

## Recommended Labels

For Name:

```text
Name
Full Name
Applicant Name
Candidate Name
```

For DOB:

```text
DOB
Date of Birth
Birth Date
```

## Exit Criteria

The parser extracts target fields from all planned demo documents.

---

# 16. Phase 9 — Data Normalization & Matching Engine

## Goal

Compare form and document values robustly.

## Normalization

Examples:

```text
"Siva Kumar"
"siva kumar"
"Siva   Kumar"
```

should normalize consistently.

## Date Normalization

Convert dates to a canonical representation.

Example:

```text
12/05/2005
2005-05-12
12-05-2005
```

should map to the same internal date when the intended format is unambiguous.

## Matching Strategy

1. Exact comparison first.
2. Fuzzy comparison for suitable text fields such as names.
3. Exact comparison for dates.
4. Exact comparison for critical numeric identifiers.

## Suggested Name Scoring

```text
100%        → Match
90–99%      → Possible mismatch / review
<90%        → Mismatch
```

These are starting points only. Tune thresholds using test data.

## Important Rule

Do not treat a near-match of a critical ID number as a verified match.

## Exit Criteria

- Correct data passes.
- Obvious mismatches fail.
- OCR typos generate a review warning rather than blind acceptance.

---

# 17. Phase 10 — Validation & Error Engine

## Goal

Combine all checks into one application status.

## Severity

```text
INFO
WARNING
ERROR
BLOCKING
```

## Example

```json
{
  "code": "NAME_MISMATCH",
  "severity": "BLOCKING",
  "field": "FULL_NAME",
  "formValue": "Siva Kumar",
  "documentValue": "Siva Kumarr",
  "action": "Verify the name against the original document."
}
```

## Responsibilities

- Combine field completeness.
- Combine file validation.
- Combine document quality.
- Combine OCR extraction.
- Combine cross-verification.
- Generate human-readable messages.
- Generate machine-readable error objects.
- Optionally calculate a health score.

## Exit Criteria

The system produces a deterministic final status from all check results.

---

# 18. Phase 11 — In-Page UX & Popup Dashboard

## Goal

Make results understandable in seconds.

## Suggested UI

```text
🛡️ PRE-SUBMISSION ERROR GUARD

Application Health
━━━━━━━━━━━━━━━━━━
████████████░░░░ 82%

FORM
✅ Name entered
✅ DOB entered

DOCUMENT
✅ File format
✅ File size
⚠️ Image quality

VERIFICATION
❌ Name mismatch
✅ DOB matches

──────────────────

❌ NOT READY TO SUBMIT

1 issue requires attention.

[Review Issue]
```

## Tasks

- Inject an unobtrusive guard badge.
- Highlight problematic fields.
- Show issue cards.
- Show severity.
- Show reason.
- Show fix.
- Create popup summary.
- Show OCR progress.
- Add re-scan button.
- Show READY TO SUBMIT only when blocking issues are cleared.

## Exit Criteria

A first-time user can identify and fix an issue without reading technical logs.

---

# 19. Phase 12 — Submission Guard

## Goal

Perform final validation before submission.

## Flow

```text
User clicks Submit
       ↓
Final validation
       ↓
Blocking issues?
    /       \
  YES        NO
   ↓          ↓
Review UI   Continue
```

## Tasks

- Observe form submit events where appropriate.
- Detect submit-button click.
- Run final validation.
- Prevent simulated submission when blocking errors remain.
- Never silently alter user-entered values.
- Allow override only if product rules intentionally support it.
- Explain override behavior clearly.

## Exit Criteria

The demo cannot proceed while a blocking mismatch remains.

---

# 20. Phase 13 — Privacy & Security

## Goal

Protect sensitive application data.

## Rules

- Prefer on-device OCR for MVP.
- Avoid sending documents to a server unless necessary.
- Do not store raw documents by default.
- Do not log full names, ID numbers or document contents in production mode.
- Request only required browser permissions.
- Restrict host permissions to supported portals where possible.
- Add a privacy notice.

## Recommended Privacy Flow

```text
User document
      ↓
Browser / Local processing
      ↓
OCR
      ↓
Extracted fields
      ↓
Validation
```

## Exit Criteria

The team can clearly explain:

- what data is processed
- where it is processed
- what is stored
- why it does not need to leave the device in the MVP

---

# 21. Phase 14 — Testing

## Goal

Prove the system works beyond one happy path.

## Test Areas

- Unit testing
- Integration testing
- UI testing
- OCR failure
- Dynamic forms
- Multiple uploads
- Refresh/navigation
- Large files
- Multi-page PDFs
- Permission problems
- Browser extension reload

## Test Philosophy

Record:

- false positives
- false negatives
- OCR mistakes
- portal-specific failures

Use those results to tune the rules.

## Exit Criteria

All critical test cases pass and known limitations are documented.

---

# 22. Phase 15 — Performance & Reliability

## Goal

Make the prototype feel fast.

## Optimization Rules

- Run lightweight checks immediately.
- Run OCR asynchronously.
- Show progress.
- Avoid repeated OCR on unchanged documents.
- Cache only when useful and privacy-safe.
- Keep the page responsive.

## Target Behavior

Simple checks should feel near-instant.

OCR should:

- show progress
- not freeze the page
- complete within an acceptable time for demo documents

## Exit Criteria

The extension remains usable during OCR and validation.

---

# 23. Phase 16 — Real-Portal Pilot

## Goal

Move from a controlled demo to one real portal only if permitted and technically safe.

## Tasks

- Choose one publicly accessible portal appropriate for testing.
- Map fields manually.
- Map upload requirements manually.
- Create a dedicated rule profile.
- Use synthetic/test data.
- Avoid submitting real personal documents.
- Record limitations.

## Possible Technical Problems

- iframes
- dynamic forms
- custom upload widgets
- fields generated after page load
- shadow DOM

## Exit Criteria

One real-world form can be inspected without compromising user data or relying on unsupported assumptions.

---

# 24. Phase 17 — Hackathon Demo Packaging

## Goal

Produce a polished, repeatable demonstration.

## Tasks

- Freeze working build.
- Prepare:
  - correct document
  - name mismatch document
  - oversized/wrong format document
  - low-quality document
- Add reset function to demo portal.
- Create a 2–3 minute live demo.
- Prepare architecture slide.
- Prepare before/after comparison.
- Explain novelty versus existing form-fillers.
- Record a backup demo video.

## Exit Criteria

The team can reset the demo and reproduce every key result in under five minutes.

---

# 25. Validation Matrix

| Check | Input | Result | Severity | User action |
|---|---|---|---|---|
| Required field | Form field | Empty/non-empty | Blocking | Enter value |
| Date format | DOB field | Canonical date | Blocking | Correct date |
| File type | Uploaded file | MIME/extension | Blocking | Upload supported type |
| File size | Uploaded file | Bytes vs rule | Blocking | Compress/re-upload |
| Image dimensions | Image | Width/height | Warning/Blocking | Upload clearer image |
| Readability | Image/PDF page | Quality heuristic | Warning | Upload clearer scan |
| OCR extraction | Document | Name/DOB/etc. | Warning/Blocking | Upload clearer document |
| Name comparison | Form + OCR | Exact/fuzzy score | Blocking/Review | Verify/correct name |
| DOB comparison | Form + OCR | Canonical equality | Blocking | Correct DOB |
| Certificate number | Form + OCR | Exact equality | Blocking | Verify identifier |
| Document category | Upload + field | Expected type | Blocking | Upload correct document |

---

# 26. Data Flow

```text
1. User opens supported form.
2. Content script detects fields and upload controls.
3. Rule engine loads the portal profile.
4. User enters data.
5. User selects a document.
6. File validator checks type/size/basic properties.
7. Document analyzer checks quality.
8. OCR extracts text when required.
9. Parser extracts Name/DOB/other supported fields.
10. Matcher compares form values with document values.
11. Error engine aggregates results.
12. UI highlights problems and explains fixes.
13. User corrects issues.
14. User requests re-scan.
15. Final guard runs before simulated/allowed submission.
16. If no blocking issues remain, show READY TO SUBMIT.
```

---

# 27. Error Taxonomy

| Code | Meaning | Severity |
|---|---|---|
| `REQUIRED_FIELD_MISSING` | Required form field is empty | BLOCKING |
| `INVALID_DATE` | Date cannot be parsed or violates a rule | BLOCKING |
| `FILE_TYPE_NOT_ALLOWED` | Uploaded format is unsupported | BLOCKING |
| `FILE_TOO_LARGE` | File exceeds portal limit | BLOCKING |
| `IMAGE_TOO_SMALL` | Image dimensions are below rule | WARNING/BLOCKING |
| `DOCUMENT_LOW_QUALITY` | Document appears difficult to read | WARNING |
| `OCR_FAILED` | Text could not be reliably extracted | WARNING/BLOCKING |
| `NAME_MISMATCH` | Form name differs from document | BLOCKING/REVIEW |
| `DOB_MISMATCH` | Form DOB differs from document | BLOCKING |
| `IDENTIFIER_MISMATCH` | Critical number differs | BLOCKING |
| `DOCUMENT_TYPE_MISMATCH` | Uploaded document does not match expected category | BLOCKING |
| `UNKNOWN_RULE` | Portal requirement is not configured | INFO |

---

# 28. Implementation Details by Component

## 28.1 Content Script

Responsibilities:

- inspect DOM
- detect forms
- detect fields
- detect file inputs
- attach listeners
- inject UI
- communicate with background service worker

Do not modify user-entered values silently.

---

## 28.2 Background Service Worker

Responsibilities:

- extension-level messaging
- storage
- rule retrieval/caching if required
- background coordination

Avoid using it as a place to permanently store sensitive document content.

---

## 28.3 OCR Engine

Recommended first implementation:

```text
Tesseract.js
```

Consider preprocessing:

- grayscale
- resize
- contrast enhancement
- crop

OCR is not infallible. Treat OCR output as evidence for validation, not as absolute truth.

---

## 28.4 Matching Engine

Return:

```text
score
reason
decision
```

instead of only:

```text
true / false
```

Example:

```json
{
  "score": 0.95,
  "decision": "REVIEW",
  "reason": "Small spelling difference detected"
}
```

---

## 28.5 Rule Engine

Business rules should be separated from code.

Features:

- versioned rule sets
- portal-specific overrides
- generic defaults
- unknown-rule handling

---

# 29. Recommended Coding Order

1. Create demo HTML form.
2. Create Manifest V3 extension.
3. Make `content.js` detect fields.
4. Add popup showing detected fields.
5. Detect file uploads.
6. Implement file type and size checks.
7. Implement image dimension checks.
8. Add in-page warning component.
9. Add rule JSON and rule loader.
10. Integrate OCR.
11. Build Name/DOB parser.
12. Build normalization utilities.
13. Build matching engine.
14. Build validation aggregator.
15. Add final submission guard.
16. Add tests.
17. Polish UI and demo.

---

# 30. Git Workflow

```text
main
 ├── develop
 │    ├── feature/form-detector
 │    ├── feature/file-validator
 │    ├── feature/ocr
 │    ├── feature/matcher
 │    ├── feature/rule-engine
 │    └── feature/ui
 └── release/hackathon-demo
```

## Git Rules

- Commit one logical change at a time.
- Use pull requests.
- Do not commit real personal documents.
- Do not commit API keys or secrets.
- Use synthetic/sample documents in the repository.

---

# 31. Test Plan

| Test ID | Scenario | Expected result |
|---|---|---|
| T01 | All correct | READY TO SUBMIT |
| T02 | Name differs by obvious typo | Name mismatch/review warning |
| T03 | DOB differs | Blocking DOB mismatch |
| T04 | Wrong file extension/type | Blocking file-type error |
| T05 | File exceeds configured size | Blocking size error |
| T06 | Low-resolution image | Quality warning |
| T07 | Blurry image | Readability warning or OCR failure |
| T08 | Missing required field | Blocking missing-field error |
| T09 | OCR cannot read document | OCR warning/failure guidance |
| T10 | Unknown portal | Generic checks only; no invented portal rules |
| T11 | Multiple file inputs | Each upload is validated separately |
| T12 | User fixes error | Re-scan clears resolved issue |

---

# 32. Non-Functional Requirements

## Usability

Users should understand every warning without technical knowledge.

## Performance

Lightweight checks should be immediate.

OCR should be asynchronous.

## Privacy

Minimize collection.

Avoid transmitting documents by default.

## Reliability

One OCR failure must not crash the extension or the webpage.

## Security

- Least-privilege permissions
- No secrets in source control
- Minimal storage

## Accessibility

- keyboard-accessible controls
- readable text
- visible focus states
- meaningful ARIA labels
- adequate contrast

## Maintainability

Keep:

- rules
- parsers
- validators
- matching
- UI

modular.

## Explainability

Every warning should answer:

1. What was checked?
2. What was found?
3. Why might it matter?
4. What should the user do?

---

# 33. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OCR errors | High | Preprocessing, confidence/review state, careful wording |
| Portal DOM changes | High | Semantic mapping + portal profiles + heuristics |
| Unknown portal rules | High | Never guess; show unknown-rule status |
| False mismatch | High | Exact checks for critical fields; fuzzy names only with review |
| Slow OCR | Medium | Async processing, progress UI, small demo documents |
| Privacy concerns | High | On-device processing, minimal storage, synthetic demo data |
| Complex PDFs | Medium | Support common PDFs first and document limitations |
| Extension permission concerns | Medium | Least privilege and supported-host list |
| Demo failure | High | Local demo portal + prepared test data + backup recording |

---

# 34. Success Metrics for the Hackathon

The prototype should be able to demonstrate:

- Correct detection of planned fields.
- Reliable detection of at least four high-value error scenarios.
- Name and DOB cross-verification.
- Clear error explanations.
- Correction and re-scan workflow.
- READY TO SUBMIT after issues are fixed.
- A repeatable live demonstration.
- Clear privacy explanation.
- Clear differentiation from basic form autofill.

---

# 35. Recommended Live Demo Script

1. Open the demo scholarship/application portal.
2. Show the extension detecting Full Name, DOB and document upload.
3. Enter a name and DOB.
4. Upload a deliberately mismatched certificate.
5. Let file validation and OCR run.
6. Show:
   - Name mismatch
   - DOB matches
7. Click Submit.
8. Show pre-submission guard preventing the demo submission.
9. Correct the value or upload the correct document.
10. Re-scan.
11. Show all checks passing.
12. Demonstrate one quick second error such as oversized file or blurry image.

---

# 36. Presentation Story

```text
Problem
Official forms often fail because users submit incorrect,
inconsistent or non-compliant information.

Current gap
Most form tools focus on filling forms or checking website implementation.

Solution
A pre-submission safety layer that checks both the form
and supporting documents before submission.

Technology
Browser extension
+ field detection
+ rules
+ OCR
+ document analysis
+ cross-verification

Innovation
Form data and document data are checked together before submission.

Outcome
Fewer avoidable submission errors and clearer correction guidance.
```

---

# 37. How We Differ From Form Troubleshooter

| Capability | Form Troubleshooter | Our Error Guard |
|---|---|---|
| Form/DOM analysis | Primary feature | Foundation |
| Accessibility/implementation checks | Yes | Optional |
| User data validation | Not the core | Core |
| Uploaded document analysis | Not the core | Core |
| OCR | No | Core |
| Form ↔ document comparison | No | Core |
| Portal-specific upload rules | Not the core | Core |
| Pre-submission readiness | No | Core |

## Key Differentiator

Form Troubleshooter mainly asks:

> Is the website form implemented correctly?

Our product asks:

> Is the user's application ready to submit?

---

# 38. Definition of Done — MVP

The MVP is complete when all of the following are true:

- [ ] Extension loads in Chrome/Chromium.
- [ ] No manifest errors.
- [ ] Demo portal fields are detected.
- [ ] Fields are semantically classified.
- [ ] Upload rules come from JSON.
- [ ] Wrong file type is detected.
- [ ] Oversized file is detected.
- [ ] Basic image quality check works.
- [ ] OCR works on sample document.
- [ ] Name extraction works.
- [ ] DOB extraction works.
- [ ] Form/document comparison works.
- [ ] Blocking errors are shown clearly.
- [ ] Submission guard works.
- [ ] Corrected data can be rescanned.
- [ ] No real personal documents are required.
- [ ] README is complete.

---

# 39. Post-Hackathon Roadmap

Future versions can include:

- More document types.
- More Indian-language OCR.
- Better PDF layout extraction.
- Better semantic field classification.
- More sophisticated quality analysis.
- Rule-management dashboard.
- More portal profiles.
- Optional secure backend where genuinely required.
- Privacy-preserving aggregate analytics.
- Better multilingual UI.
- Improved accessibility.

---

# 40. Team Task Breakdown

| Role | Primary ownership | Secondary ownership |
|---|---|---|
| Extension developer | Manifest, content script, field detection | Submission guard |
| AI/OCR developer | OCR, preprocessing, extraction | Matching |
| Frontend/UI developer | Popup, overlay, error cards | Accessibility |
| Rules/QA developer | Portal rules, test matrix, edge cases | Integration |
| All members | Demo, documentation, presentation | Code review |

---

# 41. Final Build Checklist

- [ ] Repository created
- [ ] Manifest V3 working
- [ ] Demo portal working
- [ ] Form detector working
- [ ] File validator working
- [ ] Rule engine working
- [ ] Image quality check working
- [ ] OCR working
- [ ] Field extraction working
- [ ] Matching working
- [ ] Error engine working
- [ ] In-page UI working
- [ ] Submission guard working
- [ ] Test cases passing
- [ ] Privacy explanation ready
- [ ] README completed
- [ ] Demo documents prepared
- [ ] Backup recording prepared
- [ ] Presentation completed

---

# 42. Final Recommendation

Build incrementally.

Do **not** start with OCR or AI.

The safest development order is:

```text
FORM
  ↓
FILE
  ↓
RULES
  ↓
QUALITY
  ↓
OCR
  ↓
EXTRACTION
  ↓
MATCHING
  ↓
ERRORS
  ↓
UI
  ↓
SUBMISSION GUARD
```

This order reduces debugging complexity and guarantees that a usable MVP exists even if advanced OCR features take longer than expected.

---

## Final Product Vision

```text
                  OFFICIAL WEBSITE
                         │
                         ▼
               ┌───────────────────┐
               │ Chrome Extension  │
               └─────────┬─────────┘
                         │
             ┌───────────┴────────────┐
             ▼                        ▼
      FORM ANALYZER             FILE ANALYZER
             │                        │
             │                 ┌──────┴──────┐
             │                 │             │
             │                 ▼             ▼
             │               Image         PDF
             │                 │             │
             │                 └──────┬──────┘
             │                        │
             │                        ▼
             │                       OCR
             │                        │
             ▼                        ▼
        FORM DATA  ◄──────────── DOCUMENT DATA
             │                        │
             └──────────┬─────────────┘
                        ▼
                 VALIDATION ENGINE
                        │
             ┌──────────┼───────────┐
             ▼          ▼           ▼
           RULES       OCR        MATCHING
             │          │           │
             └──────────┼───────────┘
                        ▼
                  ERROR GUARD
                        │
               ┌────────┴────────┐
               ▼                 ▼
              ❌                  ✅
        Fix errors        READY TO SUBMIT
```

**Core principle:**

> **Form + Document + OCR + Cross-verification + Rules → Pre-submission Error Prevention**
