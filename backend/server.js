/**
 * Pre-Submission Error Guard - AI Document Vision Backend Server
 *
 * Uses Node.js native HTTP + fetch (zero external dependencies).
 * Securely uses GEMINI_API_KEY from .env without exposing it to the browser.
 * Natively analyzes PDFs, Aadhaar cards, PAN cards, and certificates without labels.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── 1. Load .env Configuration ──
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env')
  ];

  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {}
    }
  }
}

loadEnv();

const PORT = parseInt(process.env.PORT || '5001', 10);


function getApiKey() {
  return (process.env.GEMINI_API_KEY || '').trim();
}

// ── 2. Specialized Gemini Vision Prompt for Unlabelled Indian IDs & Certificates ──
const GEMINI_PROMPT = `You are an expert AI document inspector specializing in Indian government identification cards, academic transcripts, and official certificates.\n\nAnalyze this uploaded document image or PDF carefully.\nNote that many Indian documents DO NOT have explicit labels:\n- On Aadhaar cards: The applicant name is typically printed directly above the Date of Birth and below \"Government of India\" / regional language script without a \"Name:\" prefix. The Aadhaar number is a 12-digit number (XXXX XXXX XXXX).\n- On PAN cards: The applicant name is printed directly below \"Permanent Account Number Card\", with Father's name on line 2, DOB on line 3, and a 10-character alphanumeric PAN (e.g. ABCDE1234F).\n- On Caste/Income/Residence Certificates: \"This is to certify that Sri/Kumari [Name]...\" with an issuing certificate number (e.g. AP123456, W/O, S/O).\n- On Academic Marks Memos: Candidate name is in a header block or table alongside Hall Ticket/Registration Number.\n\nExtract all details and return strictly valid JSON (no markdown formatting, no code blocks):\n{\n  \"document_type\": \"AADHAAR | PAN | CASTE_CERTIFICATE | INCOME_CERTIFICATE | MARKSHEET | OTHER\",\n  \"fields\": {\n    \"full_name\": \"Applicant Full Name\",\n    \"dob\": \"DD/MM/YYYY or YYYY-MM-DD\",\n    \"certificate_no\": \"Aadhaar, PAN, or Certificate Registration Number\",\n    \"gender\": \"Male | Female | Other | null\",\n    \"father_name\": \"Father / Husband Name if present, else null\",\n    \"issuing_authority\": \"Issuing Authority or Board\"\n  },\n  \"confidence\": 0.98,\n  \"clarity\": \"HIGH | MEDIUM | LOW\",\n  \"notes\": \"Brief notes on document authenticity and layout\",\n  \"raw_text\": \"Complete transcript of visible text\"\n}`;

// ── Form-Aware Field Mapping Prompt ──
// Used by /api/map-form-fields — receives both the document and the form schema
function buildFormMappingPrompt(formSchema) {
  return `You are an AI assistant helping inspect and auto-fill a government web form from an uploaded identity document.

Here is the web form's field schema (JSON array). Each entry describes one form field:
${JSON.stringify(formSchema, null, 2)}

Your task:
1. Analyze the uploaded document (image or PDF) carefully.
2. Check image clarity and readability:
   - Determine if the document is BLURRY, out of focus, motion-blurred, degraded, or too low quality to read names, dates, or ID numbers accurately.
   - If blurry or illegible, set "_isBlurred": true, and set "_blurReason": "Uploaded document is blurry or unreadable. Please upload a clear document."
   - If the document is sharp, clear, and legible, set "_isBlurred": false, and "_blurReason": null.
3. Classify the EXACT type of document as one of:
   - "AADHAAR" (Aadhaar Card / e-Aadhaar)
   - "PAN" (Permanent Account Number Card / e-PAN)
   - "CASTE_CERTIFICATE" (Caste / Community Certificate)
   - "INCOME_CERTIFICATE" (Income Certificate)
   - "CERTIFICATE" (General Government Certificate)
   - "MARKSHEET" (Marks memo / Academic Transcript / 10th SSC)
   - "OTHER" (Any other document)
4. Extract all readable information from the document. If the document is blurred or unreadable, leave field values as null.
5. Map the extracted values to the correct form fields based on the field's label, id, name, and type.
6. Return ONLY a JSON object where:
   - Key "_documentType": string ("AADHAAR" | "PAN" | "CASTE_CERTIFICATE" | "INCOME_CERTIFICATE" | "CERTIFICATE" | "MARKSHEET" | "OTHER")
   - Key "_isBlurred": boolean (true if image is blurry/out of focus/illegible, false if clear)
   - Key "_blurReason": string or null
   - Each other key is the field's "fieldKey" (from the schema) and the value is what should be filled in.
   - Set a field's value to null if the document does not contain information for that field or is unreadable.
7. For date fields (type="date"), always return the value in YYYY-MM-DD format.
8. For Aadhaar number fields, format as "XXXX XXXX XXXX".
9. For PAN number fields, use uppercase (e.g. ABCDE1234F).
10. Never fill a field labeled "father" or "guardian" with the applicant's own name.
11. Never put an Aadhaar/PAN number into a caste/income certificate number field.

IMPORTANT: Return ONLY valid JSON — no markdown, no explanation, no code blocks.
Example output format:
{
  "_documentType": "AADHAAR",
  "_isBlurred": false,
  "_blurReason": null,
  "fullName": "Siva Kumar",
  "dob": "2005-05-12",
  "aadhaarNumber": "1234 5678 9012",
  "fatherName": null,
  "certificateNo": null
}`;
}

// ── 3. Call Gemini Vision API ──
// Ordered list of models to try (newest first, fallback on failure)
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest'
];

async function callGeminiModel(modelName, payload, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    return await response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error(`Gemini model "${modelName}" timed out after 30 seconds`);
    }
    throw e;
  }
}

async function analyzeWithGemini(base64Data, mimeType) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend/.env');
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };

  let lastError = null;
  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`[AI Backend] Trying model: ${modelName}...`);
      const result = await callGeminiModel(modelName, payload, apiKey);
      const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();

      // Try to find JSON in the response
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleanJson;

      console.log(`[AI Backend] ✅ Model ${modelName} succeeded`);
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        return {
          document_type: 'UNKNOWN',
          fields: {},
          raw_text: textOutput,
          confidence: 0.5
        };
      }
    } catch (err) {
      console.warn(`[AI Backend] ⚠️ Model ${modelName} failed: ${err.message}`);
      lastError = err;
      // Continue to next model
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

// ── 4. Create HTTP Server ──
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health Endpoint
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const hasKey = !!getApiKey();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Pre-Submission Error Guard AI Vision Backend',
      ai_configured: hasKey,
      port: PORT
    }));
    return;
  }

  // Document Analysis Endpoint
  if (req.method === 'POST' && url.pathname === '/api/analyze-document') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { fileData, mimeType, fileName } = payload;

        if (!fileData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'fileData (base64) is required.' }));
          return;
        }

        console.log(`[AI Backend] Received document: ${fileName || 'unnamed'} (${mimeType}, base64 len: ${fileData.length})`);

        const aiResult = await analyzeWithGemini(fileData, mimeType);

        console.log(`[AI Backend] Document parsed successfully:`, aiResult.fields);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ...aiResult
        }));
      } catch (err) {
        console.error('[AI Backend Error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: err.message
        }));
      }
    });
    return;
  }

  // ── Form-Aware AI Field Mapping Endpoint ──
  // Receives: { fileData (base64), mimeType, fileName, formSchema (array) }
  // Returns:  { success: true, fieldMap: { fieldKey: value, ... } }
  if (req.method === 'POST' && url.pathname === '/api/map-form-fields') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { fileData, mimeType, fileName, formSchema } = payload;

        if (!fileData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'fileData (base64) is required.' }));
          return;
        }
        if (!formSchema || !Array.isArray(formSchema) || formSchema.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'formSchema (array) is required.' }));
          return;
        }

        const apiKey = getApiKey();
        if (!apiKey) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured.' }));
          return;
        }

        console.log(`[AI Backend] Form-mapping request: ${fileName || 'unnamed'} | ${formSchema.length} fields`);

        const prompt = buildFormMappingPrompt(formSchema);
        const geminiPayload = {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: fileData } }
            ]
          }],
          generationConfig: { temperature: 0.1 }
        };

        let fieldMap = null;
        let lastError = null;
        for (const modelName of GEMINI_MODELS) {
          try {
            console.log(`[AI Backend] Form-mapping via model: ${modelName}...`);
            const result = await callGeminiModel(modelName, geminiPayload, apiKey);
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            fieldMap = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
            console.log(`[AI Backend] ✅ Form-mapping succeeded via ${modelName}:`, fieldMap);
            break;
          } catch (err) {
            console.warn(`[AI Backend] ⚠️ Form-mapping model ${modelName} failed: ${err.message}`);
            lastError = err;
          }
        }

        if (!fieldMap) throw lastError || new Error('All Gemini models failed for form mapping');

        let documentType = fieldMap._documentType || null;
        let isBlurred = fieldMap._isBlurred === true;
        let blurReason = fieldMap._blurReason || null;
        delete fieldMap._documentType;
        delete fieldMap._isBlurred;
        delete fieldMap._blurReason;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, fieldMap, documentType, isBlurred, blurReason }));

      } catch (err) {
        console.error('[AI Backend Form-Mapping Error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

function startServer(portToUse) {
  server.listen(portToUse, () => {
    console.log(`\n=============================================================`);
    console.log(`🛡️  Pre-Submission Error Guard - AI Vision Backend Running!`);
    console.log(`📡 URL: http://localhost:${portToUse}`);
    console.log(`🔑 Gemini API Key Status: ${getApiKey() ? '✅ Configured' : '⚠️ Missing (set in backend/.env)'}`);
    console.log(`=============================================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && PORT === 5000) {
    console.warn(`[AI Backend] ⚠️ Port 5000 is in use (macOS AirPlay Receiver). Switching to port 5001 automatically...`);
    startServer(5001);
  } else {
    console.error(`[AI Backend] Server listen error:`, err);
    process.exit(1);
  }
});

startServer(PORT);
