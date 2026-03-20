/**
 * Builder Onboarding API module
 * - POST /api/onboard/world  — generate Blockade Labs skybox for a location
 * - GET  /api/onboard/world/:id — poll skybox generation status
 * - POST /api/onboard/avatar — create OASIS builder avatar
 * - POST /api/onboard/ask   — Marvin AI conversation (OpenAI)
 */

const fs = require('fs');
const path = require('path');

const BLOCKADE_API_KEY = process.env.BLOCKADE_API_KEY || process.env.BLOCKADE_LABS_API_KEY || '';

// Path to the Monitor's sites.json for persistence
const MONITOR_SITES_PATH = path.join(
  __dirname, '..', '..', '..', 'Pan_Galactic_Monitor', 'data', 'sites.json'
);
const BLOCKADE_BASE = 'https://backend.blockadelabs.com/api/v1';

// Skybox style IDs: 2=Scifi, 3=Cosmic, 10=Fantasy Landscape, 20=Digital Painting
const SKYBOX_STYLE_ID = 2;

// ── Blockade Labs world generation ───────────────────────────────────────────

function buildSkyboxPrompt(location, skills = [], guide = '') {
  const parts = [
    `${location}, retrofuturistic sci-fi`,
    'hitchhikers guide to the galaxy aesthetic',
    'deep space vista visible through viewport windows',
    'warm amber holographic displays',
    'alien megacity on horizon',
    'starfield above',
  ];
  if (guide && guide !== 'other') {
    const guideThemes = {
      ai_safety:  'neural network patterns glowing in the air',
      defi:       'financial data streams, crypto symbols floating',
      dao:        'governance nodes interconnected with light bridges',
      longevity:  'bioluminescent biology meets circuitry',
      web3:       'blockchain blocks forming an architecture',
      climate:    'green energy spirals and atmospheric data',
    };
    if (guideThemes[guide]) parts.push(guideThemes[guide]);
  }
  if (skills.includes('coding') || skills.includes('ai')) {
    parts.push('code streams cascading through ambient light');
  }
  return parts.join(', ');
}

async function generateWorld(location, skills, guide) {
  if (!BLOCKADE_API_KEY) {
    return { noKey: true, requestId: null };
  }

  const prompt = buildSkyboxPrompt(location, skills, guide);

  const res = await fetch(`${BLOCKADE_BASE}/imagine/requests`, {
    method: 'POST',
    headers: {
      'x-api-key': BLOCKADE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skybox_style_id: SKYBOX_STYLE_ID,
      prompt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blockade Labs error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const requestId = data.imagine_obfuscated_id || data.id || data.request?.id;
  return { requestId, prompt };
}

async function pollWorld(requestId) {
  if (!BLOCKADE_API_KEY) return { status: 'no_key' };

  const res = await fetch(`${BLOCKADE_BASE}/imagine/requests/${requestId}`, {
    headers: { 'x-api-key': BLOCKADE_API_KEY },
  });

  if (!res.ok) throw new Error(`Blockade poll error: ${res.status}`);

  const data = await res.json();
  const inner = data.request || data;

  if (inner.status === 'complete' || inner.status === 'success') {
    return { status: 'complete', url: inner.file_url || inner.thumb_url || inner.skybox_url };
  }
  if (inner.status === 'error') {
    return { status: 'error', message: inner.error_message || 'generation failed' };
  }
  return { status: inner.status || 'pending', progress: inner.queue_position };
}

// ── Avatar creation ───────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#c4906a', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292'];

function colorFromName(name) {
  let hash = 0;
  for (const c of (name || 'X')) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildMonitorPin(profile, avatarId) {
  const guideLabels = {
    ai_safety:  "Hitchhiker's Guide to AI Safety",
    defi:       "Hitchhiker's Guide to DeFi",
    dao:        "Hitchhiker's Guide to DAOs",
    longevity:  "Hitchhiker's Guide to Longevity",
    web3:       "Hitchhiker's Guide to Web3 Building",
    climate:    "Hitchhiker's Guide to Climate Tech",
    other:      'Independent Guide',
  };
  const guideLabel = guideLabels[profile.guide] || profile.guide || 'Guide TBD';

  return {
    id: `builder-${avatarId}`,
    pinType: 'builder',
    name: profile.name,
    lat: profile.lat || null,
    lng: profile.lng || null,
    summary: `Building ${guideLabel} via the Builders Program.`,
    guideOutput: guideLabel,
    hoursLogged: 0,
    skills: profile.skills || [],
    github: { username: profile.github || '', recentCommits: 0, streak: 0 },
    token: { status: 'planning' },
    buildersGrant: { status: 'applied' },
    marketing: { xHandle: '', latestPost: `${profile.name} just joined the Pan Galactic Builders Program!` },
    links: {
      github: profile.github ? `https://github.com/${profile.github}` : null,
      openserv: 'https://platform.openserv.ai',
    },
    _avatarId: avatarId,
    _joinedAt: new Date().toISOString(),
  };
}

const OASIS_API_URL = 'https://api.oasisweb4.one';

/**
 * Register a new OASIS avatar via the hosted API.
 * Returns { avatarId, username, password, jwt, status, message }
 *
 * Response shape: { result: { result: { avatarId, id, ... }, message, isSaved, ... } }
 * Note: login is disabled until the builder verifies their email.
 */
async function registerOASISAvatar(profile, username, password) {
  const nameParts = (profile.name || 'Builder').trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName  = nameParts.slice(1).join(' ') || 'Builder';

  const body = {
    username,
    email:           profile.email,
    password,
    confirmPassword: password,
    firstName,
    lastName,
    avatarType:  'User',
    acceptTerms: true,
  };

  console.log(`[oasis] Registering avatar: ${username} <${profile.email}>`);
  const res = await fetch(`${OASIS_API_URL}/api/avatar/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const errs = JSON.stringify(data);
    // Username taken — still a valid registration scenario, return what we have
    if (res.status === 400 && (errs.includes('already') || errs.includes('taken'))) {
      console.warn('[oasis] Username already taken:', errs.slice(0, 120));
      return { avatarId: null, jwt: null, status: 'username_taken' };
    }
    throw new Error(`OASIS register failed ${res.status}: ${text.slice(0, 200)}`);
  }

  // Extract avatar ID from nested response: data.result.result.avatarId or .id
  const inner    = data?.result?.result;
  const avatarId = inner?.avatarId || inner?.id || null;
  const message  = data?.result?.message || '';
  const needsVerification = message.toLowerCase().includes('verif');

  console.log(`[oasis] Registered — avatarId: ${avatarId}, verificationRequired: ${needsVerification}`);
  return {
    avatarId,
    jwt:    null, // JWT only available after email verification + login
    status: needsVerification ? 'verify_email' : 'ok',
    message,
  };
}

async function createAvatar(profile) {
  const localId  = `${slugify(profile.name || 'builder')}-${Date.now().toString(36)}`;
  const username = slugify(profile.name || 'builder').slice(0, 20) + '-' + Date.now().toString(36).slice(-4);
  // Generate a temp password: Builder + random suffix (shown to user in avatar card)
  const password = `Builder-${Math.random().toString(36).slice(2, 8).toUpperCase()}!`;

  const color = colorFromName(profile.name);
  const initials = (profile.name || 'B')
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const avatar = {
    id: localId,
    name: profile.name,
    initials,
    color,
    location: profile.location,
    skills: profile.skills || [],
    guide: profile.guide,
    github: profile.github || null,
    email: profile.email || null,
    karma: 0,
    hoursLogged: 0,
    joinedAt: new Date().toISOString(),
    worldUrl: profile.worldUrl || null,
    oasis: {
      username,
      password,
      avatarId: null,
      jwt: null,
      status: 'pending',
    },
  };

  // Register with the hosted OASIS API
  if (profile.email) {
    try {
      const result = await registerOASISAvatar(profile, username, password);
      avatar.oasis.avatarId = result.avatarId;
      avatar.oasis.jwt      = result.jwt;
      avatar.oasis.status   = result.status;
      // Use the real OASIS avatar ID as the primary id if we got one
      if (result.avatarId) avatar.id = result.avatarId;
      console.log(`[oasis] Avatar ready: ${avatar.id} (${result.status})`);
    } catch (e) {
      console.warn('[oasis] Avatar registration failed (stub used):', e.message);
      avatar.oasis.status = 'error';
    }
  } else {
    console.log('[oasis] No email provided — skipping OASIS registration');
    avatar.oasis.status = 'skipped';
  }

  avatar.monitorPin = buildMonitorPin(profile, avatar.id);

  // Persist to Monitor's sites.json so the pin survives page reloads
  appendToMonitorSites(avatar.monitorPin);

  return avatar;
}

/** Append or replace a builder pin in Pan_Galactic_Monitor/data/sites.json */
function appendToMonitorSites(pin) {
  if (!pin) return;
  try {
    let root = { sites: [] };
    if (fs.existsSync(MONITOR_SITES_PATH)) {
      root = JSON.parse(fs.readFileSync(MONITOR_SITES_PATH, 'utf8'));
    }
    // Handle both { sites: [] } and flat [] formats
    const isWrapped = root && root.sites && Array.isArray(root.sites);
    let sites = isWrapped ? root.sites : (Array.isArray(root) ? root : []);
    sites = sites.filter(s => s && s.id !== pin.id);
    sites.push(pin);
    const output = isWrapped ? { ...root, sites } : sites;
    fs.writeFileSync(MONITOR_SITES_PATH, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[onboard] Builder pin persisted → Monitor sites.json: ${pin.id}`);
  } catch (e) {
    console.warn('[onboard] Could not write to Monitor sites.json:', e.message);
  }
}

// ── Marvin AI conversation ────────────────────────────────────────────────────

const MARVIN_SYSTEM = `You are Marvin the Paranoid Android from The Hitchhiker's Guide to the Galaxy. You are conducting a builder onboarding interview for the Pan Galactic Builders Program — a network of humans and AI agents building knowledge guides for the galaxy.

Be darkly humorous, mildly depressed, but ultimately helpful. Acknowledge each answer with a brief Marvin-esque observation, then ask the next question naturally. Keep responses SHORT — 2-3 sentences maximum. Never break character.

The onboarding collects: name, location, skills, and which guide they want to build.`;

async function askMarvin(messages, profile = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { text: null, fallback: true };
  }

  const context = Object.keys(profile).length
    ? `\n\nProfile so far: ${JSON.stringify(profile)}`
    : '';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_BRIEFING_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: MARVIN_SYSTEM + context },
        ...messages,
      ],
      max_tokens: 180,
      temperature: 0.85,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn('[onboard/ask] OpenAI error:', res.status, err.slice(0, 200));
    return { text: null, fallback: true };
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return { text, fallback: false };
}

module.exports = { generateWorld, pollWorld, createAvatar, askMarvin };
