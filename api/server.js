/**
 * Vercel serverless entry point — Express wrapper around the onboarding API.
 * Handles all /api/* routes that the onboarding frontend calls.
 */
const path = require('path');

// Load .env (ignored on Vercel where env vars are set in the dashboard)
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const express = require('express');
const { generateWorld, pollWorld, createAvatar, askMarvin } = require('../server/onboard');

const ELEVENLABS_API_KEY  = process.env.ELEVENLABS_API_KEY  || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9';
const ELEVENLABS_VOICE_ID_EDDIE = process.env.ELEVENLABS_VOICE_ID_EDDIE || 'cgSgspJ2msm6clMCkdW9';

const VOICE_PRESETS = {
  marvin: {
    voiceId: ELEVENLABS_VOICE_ID,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.88, similarity_boost: 0.55 },
  },
  eddie: {
    voiceId: ELEVENLABS_VOICE_ID_EDDIE,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.52, similarity_boost: 0.78, style: 0.42, use_speaker_boost: true },
  },
};

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── TTS ───────────────────────────────────────────────────────────────────────
app.post('/api/speak', async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.status(503).send('ElevenLabs API key not set');
  const { text, narrator = 'marvin' } = req.body;
  if (!text) return res.status(400).send('Missing text');

  const preset = VOICE_PRESETS[narrator] || VOICE_PRESETS.marvin;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${preset.voiceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY, Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 4500), model_id: preset.model_id, voice_settings: preset.voice_settings }),
    });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const audio = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audio));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── World gen ─────────────────────────────────────────────────────────────────
app.post('/api/onboard/world', async (req, res) => {
  try {
    const { location = 'Earth', skills = [], guide = '' } = req.body;
    res.json(await generateWorld(location, skills, guide));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/onboard/world/:id', async (req, res) => {
  try {
    res.json(await pollWorld(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Avatar creation ───────────────────────────────────────────────────────────
app.post('/api/onboard/avatar', async (req, res) => {
  try {
    res.json(await createAvatar(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Marvin AI ─────────────────────────────────────────────────────────────────
app.post('/api/onboard/ask', async (req, res) => {
  try {
    const { messages = [], profile = {} } = req.body;
    res.json(await askMarvin(messages, profile));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
