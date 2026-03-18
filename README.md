# Eddie's Tannoy

**Ship-wide planning announcements** — chime, Eddie (or Marvin), AI-written narration, ElevenLabs voice, and a live grid synced to audio. Named after the British PA / “attention please” vibe.

**Repository:** [github.com/Improbable-Collaborations/Eddies-Tannoy](https://github.com/Improbable-Collaborations/Eddies-Tannoy)  
*(GitHub slug `Eddies-Tannoy` — rename the repo from `Tannoy-` in **Settings → General** if you haven’t yet.)*

**Content source:** Point at a clone of [Planning-Sprint](https://github.com/Improbable-Collaborations/Planning-Sprint) (or any folder with the same `__STARTHERE` layout).

---

## Quick start

```bash
git clone https://github.com/Improbable-Collaborations/Eddies-Tannoy.git
cd Eddies-Tannoy
npm install
cp .env.example .env
# Edit .env — see below
```

**Terminal 1 — UI (static, port 3333)**

```bash
npm run start
```

**Terminal 2 — TTS + briefing API (port 3334)**

```bash
npm run server
```

Open **http://localhost:3333**. Click **Hear latest update**.

---

## Environment (`.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `ELEVENLABS_API_KEY` | Yes (for speech) | [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys) |
| `PLANNING_SPRINT_PATH` | Recommended | Absolute path to **Planning-Sprint** repo root (default: `../../Planning-Sprint` relative to `server/`) |
| `OPENAI_API_KEY` | Optional | Clear, grouped **AI narration**; without it, a shorter template script is used |
| `PLANNING_SPRINT_BASE_URL` | Optional | Base URL so document links open on GitHub (e.g. `https://github.com/Org/Planning-Sprint/blob/main/Hitchhikers/Planning-Sprint/`) |
| `ELEVENLABS_VOICE_ID` / `ELEVENLABS_VOICE_ID_EDDIE` | Optional | Marvin vs Eddie voices |

See `.env.example` for the full list.

---

## Features

- **Heart of Gold / Eddie** — upbeat voice, ASCII-style sprite, random pre-recorded intros (`assets/audio/eddie-intro-*.mp3`), intro + outro chimes.
- **Marvin** — alternate sprite + voice (toggle in UI).
- **Documents** — git scan of Planning-Sprint for recent `.md` / `.pdf` changes + daily briefing list.
- **OpenAI** — turns facts into one listenable story (no filename parade).

---

## Regenerate assets (optional)

```bash
# Eddie intro MP3s (needs ELEVENLABS_API_KEY)
node scripts/generate-eddie-intro-clips.mjs

# Eddie sprites (needs GLIF_API_TOKEN in a separate MCP `.env` if you use Glif)
node scripts/generate-eddie-glif.mjs && python3 scripts/build-eddie-sprite.py
```

---

## OASIS chat (optional)

JWT + Marvin agent — same as original marv-ui flow. Demo mode: `?demo=1`.

---

## License

Use internally with Improbable-Collaborations; adjust `LICENSE` if you publish more broadly.
