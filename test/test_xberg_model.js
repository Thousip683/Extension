/**
 * Standalone Test Script for Xberg Machine Learning & OCR Model
 * Tests:
 *  1. Document Ingestion & High-Speed OCR
 *  2. Zero-Shot Machine Learning Named Entity Recognition (GLiNER ONNX)
 *  3. Automated Field Extraction (Name, DOB, Certificate No, Organization)
 *
 * Usage:
 *   node test/test_xberg_model.js [optional_document_path]
 */

const fs = require('fs');
const path = require('path');
const { extract, ExtractInputKind, NerBackendKind, EntityCategory } = require('@xberg-io/xberg');

// Colors for terminal formatting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

async function testDocument(docPath) {
  const fileName = path.basename(docPath);
  console.log(`\n${c.cyan}===============================================================${c.reset}`);
  console.log(`${c.bold}🧪 Testing File: ${fileName}${c.reset}`);
  console.log(`${c.gray}Path: ${docPath}${c.reset}`);
  console.log(`${c.cyan}===============================================================${c.reset}`);

  if (!fs.existsSync(docPath)) {
    console.error(`${c.red}❌ File does not exist: ${docPath}${c.reset}`);
    return;
  }

  const fileSize = (fs.statSync(docPath).size / 1024).toFixed(1);
  console.log(`📦 Size: ${fileSize} KB`);

  console.log(`\n⚙️  ${c.yellow}Step 1: Running Xberg OCR & Layout Analysis...${c.reset}`);
  const t0 = Date.now();

  try {
    const ocrOutput = await extract({
      kind: ExtractInputKind.Uri,
      uri: docPath
    }, {
      ocr: {
        backend: 'tesseract',
        language: ['eng']
      }
    });

    const ocrTime = Date.now() - t0;
    const docResult = ocrOutput.results?.[0];
    const rawText = docResult?.content || '';

    console.log(`✅ OCR Completed in ${c.green}${ocrTime} ms${c.reset}`);
    console.log(`📄 Detected MIME: ${c.bold}${docResult?.mimeType || 'unknown'}${c.reset}`);
    console.log(`\n${c.bold}--- Extracted Raw Text Preview ---${c.reset}`);
    const previewLines = rawText.trim().split('\n').filter(l => l.trim()).slice(0, 10);
    previewLines.forEach(line => console.log(`${c.gray}  | ${line}${c.reset}`));
    if (rawText.split('\n').length > 10) {
      console.log(`${c.gray}  | ... (${rawText.split('\n').length - 10} more lines)${c.reset}`);
    }

    console.log(`\n⚙️  ${c.yellow}Step 2: Running ML Entity Extraction (GLiNER ONNX Model)...${c.reset}`);
    const tNer = Date.now();

    const nerOutput = await extract({
      kind: ExtractInputKind.Uri,
      uri: docPath
    }, {
      ocr: {
        backend: 'tesseract',
        language: ['eng']
      },
      ner: {
        backend: NerBackendKind.Onnx,
        categories: [
          EntityCategory.Person,
          EntityCategory.Organization,
          EntityCategory.Location
        ],
        customLabels: ['DateOfBirth', 'CertificateNumber']
      }
    });

    const nerTime = Date.now() - tNer;
    const entities = nerOutput.results?.[0]?.entities || [];
    console.log(`✅ ML Inference Completed in ${c.green}${nerTime} ms${c.reset}`);

    console.log(`\n${c.bold}--- ML Detected Entities (${entities.length} detected) ---${c.reset}`);
    const extractedFields = {
      name: null,
      dob: null,
      certificateNo: null,
      organization: null
    };

    entities.forEach(ent => {
      const conf = (ent.confidence * 100).toFixed(1);
      const confColor = ent.confidence > 0.8 ? c.green : ent.confidence > 0.5 ? c.yellow : c.red;
      console.log(`  • ${c.magenta}[${ent.category.toUpperCase()}]${c.reset} "${c.bold}${ent.text.replace(/\n+/g, ' ')}${c.reset}" (confidence: ${confColor}${conf}%${c.reset})`);

      if (ent.category === 'person' && !extractedFields.name) {
        extractedFields.name = ent.text.replace(/\n+/g, ' ').trim();
      }
      if (ent.category === 'custom' && ent.text.includes('/') && !extractedFields.dob) {
        extractedFields.dob = ent.text.trim();
      }
      if (ent.category === 'custom' && /^[A-Z0-9]+$/i.test(ent.text.trim()) && !extractedFields.certificateNo) {
        extractedFields.certificateNo = ent.text.trim();
      }
      if (ent.category === 'organization' && !extractedFields.organization) {
        extractedFields.organization = ent.text.replace(/\n+/g, ' ').trim();
      }
    });

    console.log(`\n${c.bold}--- Canonical Form Fields for Chrome Extension ---${c.reset}`);
    console.log(`  👤 Applicant Name:    ${extractedFields.name ? c.green + extractedFields.name : c.yellow + 'Not detected'}${c.reset}`);
    console.log(`  📅 Date of Birth:     ${extractedFields.dob ? c.green + extractedFields.dob : c.yellow + 'Not detected'}${c.reset}`);
    console.log(`  🆔 Certificate No:    ${extractedFields.certificateNo ? c.green + extractedFields.certificateNo : c.yellow + 'Not detected'}${c.reset}`);
    console.log(`  🏛️  Issuing Org:       ${extractedFields.organization ? c.green + extractedFields.organization : c.yellow + 'Not detected'}${c.reset}`);

    console.log(`\n⏱️  ${c.bold}Total Pipeline Latency: ${c.green}${ocrTime + nerTime} ms${c.reset}`);

  } catch (err) {
    console.error(`${c.red}❌ Test failed:${c.reset}`, err);
  }
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}===============================================================${c.reset}`);
  console.log(`${c.bold}${c.magenta}   🛡️  XBERG MACHINE LEARNING & OCR MODEL TEST HARNESS          ${c.reset}`);
  console.log(`${c.bold}${c.magenta}===============================================================${c.reset}`);

  const cliArg = process.argv[2];
  if (cliArg) {
    const target = path.isAbsolute(cliArg) ? cliArg : path.join(process.cwd(), cliArg);
    await testDocument(target);
    return;
  }

  // Default test set
  const defaultDocs = [
    path.join(__dirname, '../demo-portal/test-docs/valid_certificate.png'),
    path.join(__dirname, '../demo-portal/test-docs/dob_mismatch.png')
  ];

  for (const doc of defaultDocs) {
    await testDocument(doc);
  }

  console.log(`\n${c.green}✅ Standalone ML model evaluation complete!${c.reset}\n`);
}

main();
