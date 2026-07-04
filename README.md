# 🌱 Vivarium

A warm, browser-based **life-simulation sandbox**. You create small illustrated worlds — a shared
student flat, a medieval keep, anything — and AI-driven characters live in them: they move between
places, pursue goals, feel things, talk, and remember. An AI Game Master narrates every step as an
illustrated, **fully voiced** visual novel, and you can nudge the world like a quiet god, rewind it
like a git repository, or export the whole story as a self-playing bundle.

**[→ Full feature & architecture documentation](docs/DOCUMENTATION.md)** ·
**[→ Original implementation plan / design log](plan/implementation-plan.html)**

---

## Quick start

Requirements: **Node 20.6+**, `ffmpeg`, `zip`/`unzip` on PATH, Python 3 with `Pillow` +
`rembg` (for character-sprite chroma matting). One [HyprLab](https://hyprlab.io) API key powers
the LLM, image generation, TTS and speech recognition.

```bash
npm install
npx playwright install chromium      # only needed for the E2E tests
cp .env.example .env                 # put your HYPRLAB_API_KEY in .env

npm run seed                         # creates admin + demo player + the "Alice & Bob" world
npm start                            # → http://localhost:8890
```

| Surface | URL | Credentials (seeded) |
|---|---|---|
| Game | `/` | `demo@vivarium.local` / `alice-and-bob` |
| Admin console | `/admin` | `admin@vivarium.local` / `admin-vivarium-2026` |
| Offline story player | `/player.html` | — (no login; also shipped inside every story zip) |

New sign-ups get a 200-credit gift. With no SMTP configured, e-mail verification codes land in
**admin console → Mailbox** (and the server log).

## What's inside (short tour)

- **Forge** — talk a character into existence; portraits + outfit variants are generated with
  identity consistency, greenscreen-matted into sprites.
- **World Wizard** 🧙 — describe a whole scenario in chat; the assistant drafts the full plan
  (cast, places, bonds), prices it in credits, and after your approval an agentic background job
  builds everything: images, map, relationships, voices.
- **Stage** — advance time and watch the tick play out with sprites, speech/thought bubbles and
  pipelined voice-over (line *n+1* generates while *n* plays). Intervene in natural language or
  by voice (Whisper ASR mic on every input).
- **Time skips as films** — skip an hour, a day, a week: a planner LLM decides which meaningful
  events happen in between, each becomes a real scene, and they play back cinema-style with
  transition cards ("Meanwhile, at the Mage Tower…") while later scenes are still generating.
- **Time travel** — undo/redo/jump anywhere; diverging futures fork into named branches, nothing
  is ever lost.
- **Voices** — Gemini prebuilt voices, or the self-hosted **LAIONBox** cloning engine with
  21 curated **voice profiles** (Anna, Ian, Lily, Peter, …) — one clean reference clip *per
  language* per identity, so characters keep their voice when the story switches language
  (custom audio uploads remain available as an override).
- **Multilingual** — 🌐 EN·DE·FR·ES: UI chrome and, from the next tick on, the whole story.
- **Exports** — full save-game ZIP (restorable), time-zero seed JSON, and the **story bundle**:
  a small zip that plays offline in any browser via the bundled `player.html`.
- **Admin console** — users, credits, model routes & pricing, TTS engine switch, audit log, and
  a per-user data explorer over every provider call.

## Repository layout

```
server/          Fastify API — one module per concern, each with a header comment:
  index.js         boot + static + route registration
  db.js            SQLite schema, migrations, seeds (model routes, pricing)
  auth.js          sessions, password + Google sign-in, e-mail verification
  credits.js       credit ledger, pricing policy, preflight/debit guardrails
  providers.js     the ONLY module that talks to model APIs (LLM/image/TTS/ASR,
                   Gemini + LAIONBox dispatch, MOCK_PROVIDERS=1 for free CI)
  tts_service.js   one line of narration → cached audio (shared by Stage & exports)
  gm.js            the Game Master: tick pipeline, chapter planner, Forge, memory
  wizard.js        World Wizard: chat → plan → priced, agentic world build
  branches.js      git-like tick history (undo/redo/fork/jump)
  export_cues.js   story "film script" assembly (single source of truth)
  world_io.js      save-game ZIP export/import with full id remapping
  assets.js        asset store + chroma matting; telemetry.js: provider-call log
  routes/          api.js (player), admin.js (operator), test.js (TEST_MODE only)
web/             no-build vanilla SPA: app.js (game), admin.js (console),
                 player.html (self-contained offline story player)
scripts/         seed_demo.js / reset_demo.js, matte.py (rembg sidecar), experiments
e2e/             Playwright end-to-end suites (real browser, real server)
docs/            DOCUMENTATION.md — every feature in detail
plan/            implementation-plan.html — the living design document
```

## Testing

```bash
npm run test:e2e        # io_features, timetravel, scene — real browser E2E
MOCK_PROVIDERS=1 …      # run the server with deterministic fake providers (no API cost)
```

The E2E suites drive a real Chromium against a real server and make screenshots in `e2e/shots/`.

## Configuration notes

- **API keys stay server-side.** Model endpoints/keys are *routes* in the DB (admin → Models):
  swap a model, change unit costs or point `tts_laionbox` at your own box without a deploy.
- **Credits**: every metered call (LLM/image/TTS/ASR) debits an internal credit ledger with
  configurable USD→credit markup, per-user daily caps and admin top-ups.
- **Data** lives in `./data` (SQLite + generated media). Deleting a world/user cascades
  everywhere, including files on disk.

## License

MIT (see `package.json`). Model outputs are subject to the respective provider terms.
