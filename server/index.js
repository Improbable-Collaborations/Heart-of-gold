/**
 * Small server for marv-ui:
 * - GET /api/planning-briefing — returns latest Planning-Sprint briefing text (for TTS)
 * - POST /api/speak — body: { text }, proxies to ElevenLabs TTS, returns audio (keeps API key server-side)
 *
 * Run: node server/index.js  (from Hitchhikers/marv-ui, or set ELEVENLABS_API_KEY in .env there)
 * Requires: ELEVENLABS_API_KEY (optional; without it, /api/speak returns 503)
 */
const path = require('path');

// Load .env from marv-ui folder (same folder as package.json)
const dotenvPath = path.join(__dirname, '..', '.env');
try {
  require('dotenv').config({ path: dotenvPath });
} catch (_) {
  // dotenv not installed; rely on process.env from shell
}

const http = require('http');
const { assemblePlanningBriefingData } = require('./planning-briefing');
const { maybeSynthesizeNarration } = require('./briefing-synthesize');
const { generateWorld, pollWorld, createAvatar, askMarvin } = require('./onboard');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
/** Marvin / default narrator — deep, flat */
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // Daniel
/** Eddie (Heart of Gold) — upbeat American; override with Voice Library “cheerful robot” etc. */
const ELEVENLABS_VOICE_ID_EDDIE =
  process.env.ELEVENLABS_VOICE_ID_EDDIE || 'cgSgspJ2msm6clMCkdW9'; // Jessica — American, expressive (swap in .env)
const PORT = parseInt(process.env.PORT || '3334', 10);

const VOICE_PRESETS = {
  marvin: {
    voiceId: ELEVENLABS_VOICE_ID,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.88, similarity_boost: 0.55 },
  },
  eddie: {
    voiceId: ELEVENLABS_VOICE_ID_EDDIE,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.52,
      similarity_boost: 0.78,
      style: 0.42,
      use_speaker_boost: true,
    },
  },
};

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function handleSpeak(text, narrator = 'marvin') {
  if (!ELEVENLABS_API_KEY) {
    return { status: 503, body: 'ElevenLabs API key not set (ELEVENLABS_API_KEY)', contentType: 'text/plain' };
  }
  if (!text || typeof text !== 'string') {
    return { status: 400, body: 'Missing or invalid "text" in body', contentType: 'text/plain' };
  }
  const limited = text.slice(0, 4500);
  const preset = narrator === 'eddie' ? VOICE_PRESETS.eddie : VOICE_PRESETS.marvin;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${preset.voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: limited,
      model_id: preset.model_id,
      voice_settings: preset.voice_settings,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { status: res.status, body: err || 'ElevenLabs error', contentType: 'text/plain' };
  }

  const audio = await res.arrayBuffer();
  return { status: 200, body: Buffer.from(audio), contentType: 'audio/mpeg' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const method = req.method;

  // CORS for local dev (marv-ui on 3333, server on 3334)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/planning-briefing' && method === 'GET') {
    try {
      const base = assemblePlanningBriefingData();
      const { text, narrativeSynthesized } = await maybeSynthesizeNarration(base);
      const baseUrl = process.env.PLANNING_SPRINT_BASE_URL || process.env.DOCUMENT_BASE_URL || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          text,
          structured: base.structured,
          narrativeSynthesized,
          baseUrl: baseUrl || null,
          changeLogPath: base.changeLogPath || null,
        })
      );
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/speak' && method === 'POST') {
    const body = await parseJsonBody(req);
    const narrator = body.narrator === 'eddie' ? 'eddie' : 'marvin';
    const result = await handleSpeak(body.text, narrator);
    res.writeHead(result.status, { 'Content-Type': result.contentType });
    res.end(result.body);
    return;
  }

  // ── Onboarding: generate world (Blockade Labs) ──────────────────────────────
  if (url.pathname === '/api/onboard/world' && method === 'POST') {
    const body = await parseJsonBody(req);
    try {
      const result = await generateWorld(
        body.location || 'Earth',
        body.skills || [],
        body.guide || ''
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[onboard/world]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Onboarding: poll world status ──────────────────────────────────────────
  if (url.pathname.startsWith('/api/onboard/world/') && method === 'GET') {
    const requestId = url.pathname.split('/api/onboard/world/')[1];
    try {
      const result = await pollWorld(requestId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[onboard/world/poll]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Onboarding: create avatar ───────────────────────────────────────────────
  if (url.pathname === '/api/onboard/avatar' && method === 'POST') {
    const body = await parseJsonBody(req);
    try {
      const avatar = await createAvatar(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(avatar));
    } catch (err) {
      console.error('[onboard/avatar]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Onboarding: Marvin AI conversation ─────────────────────────────────────
  if (url.pathname === '/api/onboard/ask' && method === 'POST') {
    const body = await parseJsonBody(req);
    try {
      const result = await askMarvin(body.messages || [], body.profile || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[onboard/ask]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`marv-ui server: http://localhost:${PORT}`);
  console.log('  GET  /api/planning-briefing  — latest Planning-Sprint text');
  console.log('  POST /api/speak              — body: { text, narrator?: "eddie"|"marvin" }');
  if (ELEVENLABS_API_KEY) {
    console.log('  ELEVENLABS_API_KEY: set (TTS will work)');
  } else {
    console.log('  ELEVENLABS_API_KEY: not set — add it to marv-ui/.env and restart the server');
    console.log('  (Tried loading .env from: ' + path.join(__dirname, '..', '.env') + ')');
  }
});
