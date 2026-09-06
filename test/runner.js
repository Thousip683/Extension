/**
 * Automated Unit Test Suite for Pre-Submission Error Guard
 * Tests normalization, fuzzy matching, file validation, and error engine.
 */

const assert = require('assert');

// Mock browser window.ErrorGuard environment
global.window = { ErrorGuard: {} };

// Load modules
require('../extension/utils/normalize.js');
require('../extension/modules/matcher.js');
require('../extension/modules/document-parser.js');
require('../extension/modules/file-validator.js');
require('../extension/modules/error-engine.js');

const { Normalize, Matcher, DocumentParser, FileValidator, ErrorEngine } = global.window.ErrorGuard;

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error('    ', err.message);
    failed++;
  }
}

console.log('\n--- Running Pre-Submission Error Guard Test Suite ---\n');

// 1. Normalization Tests
console.log('1. Normalization Utilities:');
it('normalizes string whitespace and casing', () => {
  assert.strictEqual(Normalize.text('  Siva   Kumar  '), 'siva kumar');
  assert.strictEqual(Normalize.text('SÍVA KÜMAR'), 'siva kumar');
});

it('normalizes Indian date formats (DD/MM/YYYY) to canonical ISO', () => {
  assert.strictEqual(Normalize.date('12/05/2005'), '2005-05-12');
  assert.strictEqual(Normalize.date('12-05-2005'), '2005-05-12');
  assert.strictEqual(Normalize.date('2005-05-12'), '2005-05-12');
});

it('normalizes alphanumeric certificate identifiers', () => {
  assert.strictEqual(Normalize.identifier(' ap-123456 '), 'AP123456');
  assert.strictEqual(Normalize.identifier('AP/123/456'), 'AP123456');
});

// 2. Document Parser Tests (Official Certs & Aadhaar IDs)
console.log('\n2. Document Parser (Aadhaar, PAN, Certificates):');
it('parses structured government certificates', () => {
  const ocrSample = `GOVERNMENT OF ANDHRA PRADESH\nREVENUE DEPARTMENT\nFull Name: Siva Kumar\nDate of Birth: 12/05/2005\nCertificate Number: AP123456`;
  const res = DocumentParser.parse(ocrSample);
  assert.strictEqual(res.name, 'Siva Kumar');
  assert.strictEqual(res.dob, '12/05/2005');
  assert.strictEqual(res.certificateNo, 'AP123456');
  assert.strictEqual(res.docType, 'CERTIFICATE');
});

it('parses Aadhaar card with unlabelled name and bilingual DOB', () => {
  const aadhaarSample = `Government of India\nUnique Identification Authority of India\nRahul Sharma\nजन्म तारीख / DOB: 15/08/1998\nMale / पुरुष\n9876 5432 1098`;
  const res = DocumentParser.parse(aadhaarSample);
  assert.strictEqual(res.name, 'Rahul Sharma');
  assert.strictEqual(res.dob, '15/08/1998');
  assert.strictEqual(res.aadhaarNo, '9876 5432 1098');
  assert.strictEqual(res.docType, 'AADHAAR');
});

// 3. Fuzzy Matcher Tests
console.log('\n3. Cross-Verification Matcher:');
it('identifies exact name matches', () => {
  const res = Matcher.compareNames('Siva Kumar', 'Siva Kumar');
  assert.strictEqual(res.match, true);
  assert.strictEqual(res.decision, 'MATCH');
  assert.strictEqual(res.score, 1.0);
});

it('flags small name spelling differences for review', () => {
  const res = Matcher.compareNames('Siva Kumar', 'Siva Kumarr');
  assert.strictEqual(res.match, false);
  assert.strictEqual(res.decision, 'REVIEW');
  assert.ok(res.score >= 0.88, `Score was ${res.score}`);
});

it('flags major name discrepancies as mismatch', () => {
  const res = Matcher.compareNames('Siva Kumar', 'Karthik Rao');
  assert.strictEqual(res.match, false);
  assert.strictEqual(res.decision, 'MISMATCH');
  assert.ok(res.score < 0.60, `Score was ${res.score}`);
});

it('matches equivalent DOB representations canonically', () => {
  const res = Matcher.compareDob('2005-05-12', '12/05/2005');
  assert.strictEqual(res.match, true);
  assert.strictEqual(res.decision, 'MATCH');
});

it('detects mismatched dates of birth', () => {
  const res = Matcher.compareDob('2005-05-12', '18/09/2004');
  assert.strictEqual(res.match, false);
  assert.strictEqual(res.decision, 'MISMATCH');
});

it('searches for applicant name across full document text', () => {
  const docText = `Government of India\nUnique Identification Authority\nRahul Sharma\nDOB: 15/08/1998\n1234 5678 9012`;
  const matchRes = Matcher.searchNameInDocument('Rahul Sharma', docText);
  assert.strictEqual(matchRes.match, true);

  const mismatchRes = Matcher.searchNameInDocument('Siva Kumar', docText);
  assert.strictEqual(mismatchRes.match, false);
  assert.strictEqual(mismatchRes.decision, 'MISMATCH');
});

// 4. File Validator Tests
console.log('\n4. File Validation Rules:');
it('flags files exceeding maximum allowed size', () => {
  const mockFile = { name: 'cert.png', size: 3000000, type: 'image/png' };
  const issues = FileValidator.validate(mockFile, { maxSizeBytes: 2097152 });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].code, 'FILE_TOO_LARGE');
  assert.strictEqual(issues[0].severity, 'BLOCKING');
});

it('flags disallowed file types and extensions', () => {
  const mockFile = { name: 'malicious.exe', size: 50000, type: 'application/x-msdownload' };
  const issues = FileValidator.validate(mockFile, {
    maxSizeBytes: 2097152,
    acceptedExtensions: ['.png', '.jpg', '.pdf'],
    acceptedMimeTypes: ['image/png', 'image/jpeg', 'application/pdf']
  });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].code, 'FILE_TYPE_NOT_ALLOWED');
  assert.strictEqual(issues[0].severity, 'BLOCKING');
});

// 5. Error Engine Aggregation Tests
console.log('\n5. Error Engine & Readiness Calculation:');
it('yields READY TO SUBMIT when 0 blocking issues exist', () => {
  const report = ErrorEngine.aggregate({
    formIssues: [],
    fileIssues: [],
    qualityIssues: [],
    crossCheckIssues: [],
    formData: { full_name: 'Siva Kumar', dob: '2005-05-12', certificate_no: 'AP123456', hasFile: true }
  });
  assert.strictEqual(report.isReady, true);
  assert.strictEqual(report.status, 'READY TO SUBMIT');
  assert.strictEqual(report.healthScore, 100);
});

it('yields NOT READY TO SUBMIT when blocking issues are present', () => {
  const report = ErrorEngine.aggregate({
    formIssues: [],
    fileIssues: [{ code: 'FILE_TOO_LARGE', severity: 'BLOCKING', message: 'Too big' }],
    qualityIssues: [],
    crossCheckIssues: [{ code: 'NAME_MISMATCH', severity: 'BLOCKING', message: 'Name mismatch' }],
    formData: {}
  });
  assert.strictEqual(report.isReady, false);
  assert.strictEqual(report.status, 'NOT READY TO SUBMIT');
  assert.strictEqual(report.issues.blocking.length, 2);
  assert.strictEqual(report.healthScore, 50); // 100 - 25*2
});

// 5. Google Gemini Vision AI & PDF Tests
console.log('\n5. Google Gemini Vision AI & PDF Tests:');

it('parses structured JSON returned by Google Gemini Vision from a PDF', () => {
  const geminiAiData = {
    name: 'Siva Kumar',
    dob: '12/05/2005',
    certificateNo: 'AP-SCHOLAR-9988',
    docType: 'CASTE_CERTIFICATE',
    authority: 'Government of Andhra Pradesh',
    notes: 'Official high-resolution PDF certificate'
  };

  const parsed = DocumentParser.parse('Full PDF Text...', geminiAiData);
  assert.strictEqual(parsed.isAi, true);
  assert.strictEqual(parsed.name, 'Siva Kumar');
  assert.strictEqual(parsed.dob, '12/05/2005');
  assert.strictEqual(parsed.certificateNo, 'AP-SCHOLAR-9988');
  assert.strictEqual(parsed.docType, 'CASTE_CERTIFICATE');
});

it('correctly matches Gemini AI extracted identity against form inputs', () => {
  const geminiAiData = {
    name: 'Siva Kumar',
    dob: '12/05/2005',
    certificateNo: 'AP123456'
  };

  const nameMatch = Matcher.compareNames('Siva Kumar', geminiAiData.name);
  assert.strictEqual(nameMatch.match, true);
  assert.strictEqual(nameMatch.decision, 'MATCH');

  const dobMatch = Matcher.compareDob('2005-05-12', geminiAiData.dob);
  assert.strictEqual(dobMatch.match, true);
  assert.strictEqual(dobMatch.decision, 'MATCH');
});

it('flags identity mismatch when Gemini Vision extracts a different person from an uploaded Aadhaar PDF', () => {
  const geminiAiData = {
    name: 'Ramesh Babu',
    dob: '01/01/1990',
    certificateNo: '998877665544',
    docType: 'AADHAAR'
  };

  const nameMatch = Matcher.compareNames('suva kumar', geminiAiData.name);
  assert.strictEqual(nameMatch.match, false);
  assert.strictEqual(nameMatch.decision, 'MISMATCH');

  const dobMatch = Matcher.compareDob('2005-05-12', geminiAiData.dob);
  assert.strictEqual(dobMatch.match, false);
  assert.strictEqual(dobMatch.decision, 'MISMATCH');
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);

