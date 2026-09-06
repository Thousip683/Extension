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

const PORT = parseInt(process.env.PORT || '5000', 10);


function getApiKey() {
  return (process.env.GEMINI_API_KEY || '').trim();
}

// ── 2. Specialized Gemini Vision Prompt for Unlabelled Indian IDs & Certificates ──
const GEMINI_PROMPT = `You are an expert AI document inspector specializing in Indian government identification cards, academic transcripts, and official certificates.

Analyze this uploaded document image or PDF carefully.
Note that many Indian documents DO NOT have explicit labels:
- On Aadhaar cards: The applicant name is typically printed directly above the Date of Birth and below "Government of India" / regional language script without a "Name:" prefix. The Aadhaar number is a 12-digit number (XXXX XXXX XXXX).
- On PAN cards: The applicant name is printed directly below "Permanent Account Number Card", with Father's name on line 2, DOB on line 3, and a 10-character alphanumeric PAN (e.g. ABCDE1234F).
- On Caste/Income/Residence Certificates: "This is to certify that Sri/Kumari [Name]..." with an issuing certificate number (e.g. AP123456, W/O, S/O).
- On Academic Marks Memos: Candidate name is in a header block or table alongside Hall Ticket/Registration Number.

Extract all details and return strictly valid JSON (no markdown formatting, no code blocks):
{
  "document_type": "AADHAAR | PAN | CASTE_CERTIFICATE | INCOME_CERTIFICATE | MARKSHEET | OTHER",
  "fields": {
    "full_name": "Applicant Full Name",
    "dob": "DD/MM/YYYY or YYYY-MM-DD",
    "certificate_no": "Aadhaar, PAN, or Certificate Registration Number",
    "gender": "Male | Female | Other | null",
    "father_name": "Father / Husband Name if present, else null",
    "issuing_authority": "Issuing Authority or Board"
  },
  "confidence": 0.98,
  "clarity": "HIGH | MEDIUM | LOW",
  "notes": "Brief notes on document authenticity and layout",
  "raw_text": "Complete transcript of visible text"
}`;

// ── 3. Call Gemini Vision API ──
// Ordered list of models to try (newest first, fallback on failure)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
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

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🛡️  Pre-Submission Error Guard - AI Vision Backend Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key Status: ${getApiKey() ? '✅ Configured' : '⚠️ Missing (set in backend/.env)'}`);
  console.log(`=============================================================\n`);
});
