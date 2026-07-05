# Vivarium — Feature & Architecture Documentation

This is the working reference for everything Vivarium does and where it lives in the code.
It is written so that a new developer (or coding agent) can pick the project up cold.
The historical design log with screenshots and live API verifications is
[`plan/implementation-plan.html`](../plan/implementation-plan.html).

---

## 1. Core concepts

| Concept | What it is | Where |
|---|---|---|
| **World** | One simulation: title, tone settings (genre/mood/pacing/directives), a sim-clock, a tick counter, an active branch | `worlds` table |
| **Character** | Profile (`base_profile`), live state (`materialised`: location, mood, activity, emotions, perceptions, intentions, outfits…), a voice (Gemini name and/or LAIONBox reference clip) | `characters` |
| **Location** | A place with a generated 16:9 background, position on the world map, optional `place_group` cluster | `locations`, `paths` |
| **Tick** | One advance of time: the Game Master moves everyone, updates bonds, and writes ONE narrated scene (interleaved narrator/dialogue/thought script) | `ticks`, `server/gm.js` |
| **Branch** | Git-like history: advancing from a rewound position forks a branch; every tick belongs to one | `branches`, `server/branches.js` |
| **Character attributes** | A git-like working-tree (`materialised.attributes`) of persistent conditions/beliefs/goals/skills, accumulated from per-tick `state_patches` (the append-only "git log"); carries forward across ticks and through undo/branch until a patch removes it | `characters`, `state_patches` |
| **Credits** | Internal currency. Every metered call (LLM/image/TTS/ASR) debits `credit_ledger` with a configurable USD→credit markup; per-user daily caps; admins top up | `server/credits.js` |
| **Assets** | Generated media on disk + a DB row (portraits, cutout sprites, backgrounds, audio clips, voice references) | `assets`, `server/assets.js` |

**Model routing:** `server/providers.js` is the *only* module that talks to external model APIs.
Endpoints, models, API-key env names and unit costs are **rows in `model_routes`**, editable live
in the admin console. Every HyprLab chat model — `gemini-3.5-flash`, `glm-5.2`,
`claude-sonnet-5`, or any other id you paste in — speaks the same OpenAI-style
`/v1/chat/completions` format (verified live), so swapping the reasoning LLM is just the model
string + unit costs; the admin Models tab has one-click presets for those three, and `llmChat`
extracts content defensively (string or block-array, with a clear error if a reasoning model
burns its whole token budget thinking). `MOCK_PROVIDERS=1` swaps in deterministic fakes (free CI).

---

## 2. Player features

### 2.1 Accounts
Email+password with e-mail verification (codes land in the admin Mailbox when no SMTP is
configured) or Google sign-in. Sessions are httpOnly cookies. New users get a signup credit gift
(`pricing.signup_bonus_credits`).

### 2.2 Home
World cards, **+ New world**, **🧙 World Wizard**, **⬆ Import save** (restores a `.vivarium.zip`).

### 2.3 Forge (conversational character creation)
Chat with an interviewer AI that maintains a structured draft (appearance, personality, goals,
fears, backstory, speaking style…). Portrait generation uses the world's art style with a
**greenscreen convention**, then `scripts/matte.py` (rembg + chroma keying) produces a transparent
cut-out sprite. Additional outfits are generated *with the everyday portrait as an identity
reference* so the face stays consistent. Voice: pick a Gemini voice (with preview) — or, under
LAIONBox, create a cloned reference (see 2.8). The assistant also proposes a sensible **spawn
location** (`draft.home_location`, from the world's location list); accepting a character opens
a small approval modal with that suggestion preselected — the player confirms or picks another
place before the character enters the world.

### 2.4 World Wizard (chat-designed, agent-built scenarios) — `server/wizard.js`
Describe the scenario you want; the assistant drafts a **complete plan** — title/tone, characters
(with English image prompts + 2-4 outfit descriptions + voice descriptions), locations, a
connected path graph, and a relationship web — and refines it with you. Every plan reply carries a
**server-computed credit estimate** (images + voices + LLM glue; the LLM never prices anything).
Building requires your explicit approval *and* passes a credit preflight. The **background build
job** (`wizard_jobs`, live build diary in the UI) then: creates all rows → paints portraits +
outfit variants (identity-anchored) → paints backgrounds → assigns voices (validated Gemini picks,
or generated LAIONBox references) → places everyone at home, captures the genesis snapshot, sets
the world live.
**Error contract:** every generation gets 2 retries, then one LLM *moderation-safe prompt rewrite*
and a final attempt; a failed asset never aborts the build (logged, placeholder, regenerable
later); `INSUFFICIENT_CREDITS` skips remaining *asset* steps but the world still completes.

### 2.4b World Direction 🎬
Every world carries standing `directives` in each tick's world bible. New worlds start with
`DEFAULT_WORLD_DIRECTIVES` (rich social fabric — family/friends/colleagues woven into scenes;
cinematic amplification — brighter joys, darker shadows, a notch more unpredictable than life;
mature content allowed when story-serving at prestige-TV frankness, never the default focus).
Editable in the **🎬 Direction** modal on the World screen (genre/mood/pacing/directives, with
reset-to-default served from the single source in `gm.js`).

### 2.5 Cast · Bonds · Atlas
Cast: profile drawer (rename, teleport, outfit commissioning, voice management, hear-voice).
Characters are **deduplicated by name** (case-insensitive, per world): creation 409s on a
repeat, and the accept button locks with a progress label while bonds are drafted (~15 s) so
impatient clicks can't fire duplicate requests.
**The bond graph stays current**: creating a character (Forge or cast-suggestion) immediately
drafts their directed bonds to the existing cast (`gm.draftBondsForNewCharacter`, best-effort),
and during ticks `relationship_updates` UPSERT — the GM can form brand-new bonds when cast
members meaningfully connect, not just edit existing ones.
Bonds: directed relationship graph with attributes (nature, common goals, conflicts, shared
experiences) — drag between portraits to create; two-portrait bond-builder overlay. Atlas: pannable
world map, background (re)generation, location editing.

### 2.6 Genesis & the Stage
Genesis places the cast and captures a **genesis snapshot** (used by undo-to-zero). The Stage is
the play screen: current location backdrop, present characters as sprites with speech/thought
bubbles, the storybook (the tick's narrated script), time-step chips (+1m … +1d, custom), POV
selector (character follow-cam or fixed location), and **⚡ Intervene** (natural-language nudges:
whisper to a character, change the world, direct the story — with 🎤 Whisper ASR on every input).

**Mobile:** below 760 px the bottom panels (time chips + storybook) collapse behind a 📖
handle (default collapsed, persisted in `localStorage viv_panel`) so the scene owns the small
screen; desktop layout is untouched.

**Narration player:** every line is clickable; ▶ plays the whole scene sentence-by-sentence in
the right voices with per-line emotion. Generation is **pipelined**: the first line starts
generating the moment a tick lands (`prepare`), playback starts automatically (`autoplay`,
default on), and while line *n* plays, *n+1*/*n+2* are already generating — gapless on both
Gemini and the single-GPU LAIONBox box.

**Cast suggestions (the GM's "introduce this walk-on?" tool):** the tick JSON schema includes
an optional `cast_suggestion {name, reason}` the Game Master may fill — at most one per scene,
only when an unlisted walk-on (someone it has voiced inside narrator lines) has become genuinely
story-relevant. When the moment lands (or the chapter film ends), an overlay shows the GM's 1-2
sentence pitch verbatim: *Not now* records the name in `worlds.cast_dismissed` (fed back into
the GM context so it stops re-pitching; cleared again if the character is later created);
*Yes* jumps into the Forge with an auto-sent seed message, where the assistant drafts the
character from the pitch, paints the first sprite, and the player iterates in chat until
"Accept & add to cast". Server validation: never an existing cast member, never a declined name
(`server/gm.js`, `POST /api/worlds/:id/cast-dismiss`).

**Outfit/skin suggestions:** the same mechanism for LOOKS — `outfit_suggestion {character_id,
name, description, emotion, reason}` (max one per scene). When a cast member's appearance
changes significantly — a genuinely different dress, or a strong clearly-visible emotion no
existing sprite captures — the GM proposes painting a new sprite; one click generates it
identity-anchored to the everyday portrait and stores it in `materialised.outfits` **with its
metadata** (description + emotion tag). Since that state is part of the GM's context every
tick, it can pick and reuse the sprite later via the per-tick `outfit` field. Declines aren't
persisted (the GM re-suggests only if the look recurs). A **reveal popup** shows the finished
sprite so the player sees it landed in the gallery. (Sprite-loss fix: `materialised` is re-read
at write time in the outfits endpoint, tick reconcile, AND time-travel restore — a tick landing
during the ~30 s generation used to silently erase the new sprite; sprites are gallery content
and survive undo now.)

**Location suggestions:** `location_suggestion {name, description, connect_to[], reason}` —
when the story keeps pointing at a place that doesn't exist, the GM proposes building it.
Accepting (`POST …/locations/from-suggestion`) creates the location, wires the proposed path
connections, paints the 16:9 background, and shows a reveal.

### 2.6b Game Master chat 💬
The **💬 GM** chip (top bar) opens an out-of-character assistant drawer. It sees exactly what
the tick engine sees (full cast/bonds/places, verbatim tick window, condensed memory) and can
answer anything about the story — or **propose changes** as structured actions: create a
character (with bonds, portrait auto-painted), paint sprites, patch persistent attributes,
update immediate state, edit/create bonds, build or change locations, rewrite the world
direction. Proposals render as **approval cards** (Apply / Discard); only Apply executes them
(`gmApplyActions`, reusing the same primitives as the manual UI — dedup, metering, bonds).
Strict separation: this conversation **never enters tick generation** (it lives in `chat_logs`
surface `gm_chat`, which ticks don't read); approved changes reach the story only as ordinary
world state. History persists per world; the model's own memory of it is a rolling ~20k-token
queue (old turns fall away, the DB keeps everything). Voice input via the 🎤 mic.

### 2.7 Time skips as films ("chapters") — `server/gm.js runChapter`
Skips over ~20 minutes (with *Animate time skips* on) run a **planner LLM** that judges which
genuinely meaningful events occur in the interval — count scaled to its length (hours → 1-3,
a day → 2-5, a week → up to 6), each event = one scene at one location that changes someone's
mental/physical state, bonds or the world. Detail setting: **full** (side plots: bond moments,
character development) or **main** (plot-critical only; possibly zero scenes → classic quiet
tick). Simultaneous events are ordered for dramatic comprehension (cause before consequence,
`offset_minutes: 0` → "Meanwhile, at …" cards). Each planned event becomes a **real tick**
(undo/branches/memory all apply), generated sequentially and **streamed over SSE as it
finishes** — the client starts playing scene 1 while scenes 2..K are still being written.
Offsets are normalised server-side so the chapter lands exactly on the requested time.

**Cinematic playback** (client `playCinema`): per scene, a video-export-style transition card
("Meanwhile, at the Kitchen" / "3 hours later · 14:05"), then background/sprites/storybook swap
to that tick and the narration autoplays with the usual pipelined TTS. ⏹ skips a scene; *⏭ skip
all* ends the film and jumps to the outcome. Settings live in **Account → Time skips**.

### 2.8 Voices — Gemini & LAIONBox voice profiles
The admin picks the app-wide TTS engine (Models tab; health-probed switch).
- **Gemini** (`gemini-3.1-flash-tts`): 30 prebuilt voices; per-character voice picker; narrator
  default **Iapetus** with a documentary-style delivery prompt — both the measured winners of a
  45-sample judged experiment (`config/narrator_tts_experiment.json`).
- **LAIONBox** (self-hosted DramaBox/LTX-2 expressive model, `laionbox-tts.txt`): every character
  speaks through a cloned **VOICE PROFILE** — a curated voice identity with one clean reference
  clip **per language** (EN/DE/ES/FR). This is essential: a reference spoken in another language
  makes the cloning model produce gibberish, so `synthesizeLine()` always picks the clip matching
  the story's current 🌐 language. Lines run raw → Chatterbox voice-conversion toward the
  reference → Sidon restoration (`vc_sidon`); prompt convention: **English instruction, spoken
  text in double quotes**. The **voice popup** lists all 21 profiles (human display names +
  judged gender/age/timbre), previews them in the current language, and can alternatively take a
  **custom upload** (single-language; overrides the profile until cleared).
  Caveat from testing: extreme delivery directions ("breathless, quick excited pace") degrade
  intelligibility; the app's standard mild styles are safe.

**Where profiles come from:** `scripts/extract_voice_profiles.py` streams the
[`laion/gemini-2.5-pro-tts-voice-profiles`](https://huggingface.co/datasets/laion/gemini-2.5-pro-tts-voice-profiles)
dataset tars (21 Gemini voice identities × 4 languages, ~29k acted samples), collecting several
neutral-emotion no-bursts candidates per (voice, language); `scripts/judge_voice_profiles.py
--select` then has gemini-3.5-flash LISTEN to every candidate and promote the calmest, burst-free
take. Clips live in `assets/voice_profiles/<Voice>/<lang>.mp3` (64 kbps mono, ≤15 s, ~9.5 MB
total), served for previews at `/voice-profiles/…`; the catalog (display names, attributes,
per-voice descriptions the wizard/forge LLM reads for casting) is `config/voice_profiles.json`.
`characters.voice` always stores the **Gemini voice name** under both engines; the 9 Gemini
voices without a profile fall back to a same-gender default (`server/voice_profiles.js`).

**Profile name mapping** (display name ← Gemini voice):
| Female | | Male | |
|---|---|---|---|
| Anna ← Achernar | Kira ← Kore | Aaron ← Algenib | Ian ← Iapetus |
| Amy ← Aoede | Lucy ← Laomedeia | Alec ← Algieba | Oscar ← Orus |
| Bella ← Autonoe | Lily ← Leda | Axel ← Alnilam | Peter ← Puck |
| Chloe ← Callirrhoe | Zoe ← Zephyr | Charlie ← Charon | Ray ← Rasalgethi |
| Daisy ← Despina | | Ethan ← Enceladus | Miles ← Umbriel |
| Erin ← Erinome | | Finn ← Fenrir | |

Demo casting: Alice = Lily (Leda), Bob = Peter (Puck), narrator = Ian (Iapetus).

**Provider-aware delivery coaching:** the two engines get OPPOSITE default styles — Gemini
overacts, so its templates are calm/measured (the judged-experiment winners); LAIONBox is
naturalistic and emotionally clamped, so its templates (`LAIONBOX_NARRATOR_STYLE` /
`LAIONBOX_CHARACTER_TEMPLATE`) demand vivid, audible emotion. A player customisation overrides
both engines; all templates are visible on the admin **Prompts** page.

**Engine-tolerant reuse:** every generated clip is kept forever (assets are never deleted;
`meta` records voice identity, style, text, speaker and language for analysis). When an exact
cache key misses — typically after the admin switches TTS engines or a style template evolves —
`findReusableAudio` returns any stored clip of the same text by the same speaker identity
(candidates span the character's Gemini voice, its LAIONBox profile in any language, and any
uploaded reference). Replays, live playback and story exports (preflight/prepare/ZIP) all use
this, so previously voiced lines never regenerate or re-bill. Deliberately recasting a
character's voice still regenerates, because the candidate set follows the current voice.

**The style/cache contract (important):** `server/tts_service.js synthesizeLine()` is the only
path from text to audio. Cache keys are `<engineVoice>|<style>|<text>` — **never truncated**
(a sliced key once dropped the text entirely for long styles, making every same-style narrator
line share one clip across worlds — the "wrong world's audio plays" bug). Under LAIONBox the
engineVoice embeds the reference identity **and language**: `laionbox:profile:<Voice>:<lang>`
(or `laionbox:<assetId>` for uploads). The style string is built by ONE canonical formula —
`server/export_cues.js cueVoiceStyle()` and the client mirror `web/app.js ttsStyleFor()` are
**byte-identical at default preferences**. This is what makes a line played live on the Stage
export for free later. If you change one side, change the other.

### 2.9 Multilingual play — 🌐 EN · DE · FR · ES
The 🌐 chip (top bar, all screens) cycles the language. It localises the main UI chrome
(dictionary `I18N`/`t()` in `web/app.js`, English fallback for uncovered strings) **and** rides as
`lang` in every tick/forge/wizard call: the Game Master writes all narration, dialogue, thoughts,
activities and summaries in that language (names/ids/JSON keys stay English; image-prompt fields
always stay English). Voice follows automatically: `lang` also rides in every `/api/tts` call and
the story-export flow, so under LAIONBox each line clones the **language-matched profile
reference** (see 2.8) — switch 🌐 mid-game and the same characters keep their voices, now speaking
the new language cleanly (Whisper-verified round-trips in DE and EN).

### 2.5b Atlas group repositioning
Location-group frames can overlap when worlds grow. Move a whole group (all member locations
shift together, persisted): **desktop** — hold the right mouse button on a group frame and
drag; **mobile** — press and hold a frame ~1 s until it lights up gold, then drag. A short
touch-drag still pans the map.

### 2.5c Sprite manager
In a character's profile drawer, clicking any sprite thumbnail previews it AND opens a manage
bar: edit the caption and 🔁 regenerate the image in place (same name, new look), or 🗑 delete
the sprite from the gallery (the generated images stay in the asset archive; the last remaining
sprite can't be deleted; if the character was wearing it, they fall back to the first sprite).
Endpoints: POST …/outfits with `replace:true`, DELETE …/outfits/:name.

### 2.9b Curiosity 💡 ("Did you know" learning cards)
The 💡 Curiosity button on the Atlas opens a grouped topic picker (Mind & Psychology,
Philosophy, Science & Technology, World & History, Life & Us — 39 chips) plus freeform topics
and a frequency (default: every 4th scene). Every Nth tick the storyteller writes one TRUE,
curiosity-evoking fact card (3-8 sentences, "Did you know" tone, player's language) drawn from
those interests and subtly resonant with the current story. Topics also flavour the story
itself — a character's interest, a book on a table — organically, never a lecture. On the
Stage a golden bulb (top right, mirroring the character rail) shimmers while unread cards wait;
the overlay shows all cards in large serif type with 🔊 sentence-by-sentence storyteller
read-aloud — chunks of ≥8 words (short sentences merge into the next), first chunk immediate,
the rest staggered 500 ms apart, the spoken passage highlighted live; opening marks cards read
(bulb dims).
Data: `worlds.curiosity` JSON + `facts` table; routes PATCH …/curiosity, GET …/facts,
POST /api/facts/:id/read.

### 2.9c Account content rating 🌱
Sign-up offers **Adult** (default) or **Teen**. Teen accounts get a PG fade-to-black safety
block appended to every story-generating prompt (ticks, chapter planner, GM chat) that
OVERRIDES world direction: romance/kisses fine, anything explicit or graphically violent cuts
away; dark themes may exist but are handled with restraint. Admin: the Users table shows and
toggles 🧑 adult / 🌱 teen per account; the Prompts page has an editable teen-safety block
(`settings.teen_safety_prompt`, reset-to-default).

### 2.10 Time travel & replay
Undo/redo arrows + the Timeline (🕰 chip in the top bar on every screen, or the stage button):
a **graphical filmstrip** — earlier ⟵ left · right ⟶ later — where every scene is a thumbnail
card (location backdrop with the characters standing in it, as they looked at the time), the
selected card enlarges, and temporal markers between cards keep fast-forward chapters readable
("⟲ meanwhile", "moments later", "≈5h later"). Branch chips above the strip; a detail bar shows
the selected scene's summary. Each tick offers two actions — **▶ Replay** runs the cinema renderer over the stored
history from that point to the branch head (transition cards, backdrops, sprites in their
outfits-of-the-time, narration with audio; cached lines play free) as PURE playback, never
touching world state; **⤴ Jump** rewinds the world there (advancing then forks a branch).
Branches can be renamed.
Rewinding and advancing forks a new branch; the abandoned future stays intact. Restores rebuild
character state, relationships (per-tick `rel_snapshot`) and the sim clock; tick 0 uses the
genesis snapshot. Long-term memory is per-branch (hierarchical summarisation,
`runMemoryMaintenance`).

### 2.11 Share & exports
- **Time-zero seed** (JSON): cast/bonds/world/tone, no timeline — others start fresh.
- **Full saved game** (`.vivarium.zip`): every DB row + every asset binary.
  **⬆ Import** restores it as a brand-new world with all-fresh ids (safe to re-import; a restored
  world survives deletion of the original). `server/world_io.js` documents the id-remap contract.
- **Story bundle** (`.vivarium-story.zip`) — replaces the old MP4 video export: `story.json`
  (the cue script from `export_cues.js`), `media/` (**64 kbps mono MP3** per voiced line + only
  the images the script shows) and **`player.html`** — a fully self-contained offline player
  (in-browser ZIP reader via native `DecompressionStream`, audio-driven cue timing, transition
  cards, fullscreen, seek, pause). Open `player.html` anywhere — no server, no install — and pick
  the zip. Export flow: preflight counts un-voiced lines → the player chooses **generate**
  (SSE progress; billed per line; already-played lines are cache hits = free) or **silent** →
  the zip downloads. Also served at `/player.html`.

### 2.12 Account settings
Credits + usage ledger · narrator voice picker · prepare/autoplay toggles · editable narrator &
character delivery prompts (with reset-to-default) · extra style notes · **Time skips** (animate
on/off, detail level).

---

## 3. Admin console (`/admin`)

Dashboard (usage curves, top spenders) · **Users** (create/delete with full cascade, credit
top-ups, per-user caps, the **data explorer**: every provider call with full request/response
JSON, conversations, assets, spend summaries; JSON exports per-user or global) · **Models**
(TTS engine switch Gemini↔LAIONBox with health probe; model routes: endpoint/model/unit-cost per
role, live; one-click reasoning-LLM presets for gemini-3.5-flash / glm-5.2 / claude-sonnet-5) ·
**Prompts** (full prompt transparency: the exact system+user prompt of the last real tick from
telemetry, all TTS delivery templates for both engines, and an editor for the storytelling core
block — self-aware multi-layered characters, every-scene story progression — injected into every
tick) · **Context** (per-part token breakdown of any world's next-tick context, real avg tokens/tick from
the ledger, and live-editable memory knobs — verbatim window [default 50], summary chunk size,
token budget, compression ratio — with a written explainer of the hierarchical compression) · **Pricing** (markup, credits/USD, signup gift, daily caps) · **Mailbox** (dev
e-mail outbox) · **Audit log** (every admin action).

---

## 4. HTTP API overview

Player API (`server/routes/api.js`, session cookie):

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/{register,login,logout,verify}`, `GET /api/auth/google…`, `GET /api/me`, `/api/me/ledger` |
| Worlds | CRUD `/api/worlds…`, `POST /api/worlds/:id/genesis`, `GET /api/worlds/:id` (full world data) |
| Ticks | `POST /api/worlds/:id/ticks` (SSE: `status`/`chapter`/`tick`/`done`/`error`; body: `timeDelta, intervention, perspective, lang, chapter{animate,detail}`) · `GET …/ticks?after=` |
| Time travel | `POST …/undo`, `…/redo`, `…/timetravel`, `GET …/branches`, `PATCH …/branches/:id` |
| Forge/Wizard | `POST …/forge/chat`, `POST …/populate/chat`, `POST /api/wizard/{chat,build}`, `GET /api/wizard/jobs/:id` |
| GM chat | `POST …/gm-chat` (turn → `{reply, actions[]}`), `POST …/gm-apply` (execute approved actions), `GET …/gm-chat` (history) |
| Characters | `PATCH /api/characters/:id` (rename/teleport), `POST …/outfits`, voice refs: `POST …/voice-ref/{generate,confirm,upload}` |
| Voice | `POST /api/tts` (`text, voice, style, characterId, lang`), `GET /api/voice-profiles` (catalog), `GET /voice-profiles/<Voice>/<lang>.mp3` (previews), `POST /api/asr` (multipart) |
| Exports | `GET …/export/zip`, `POST /api/worlds/import` (multipart), `POST …/export/story/preflight` (body `lang`), `POST …/export/story/prepare?lang=` (SSE), `GET …/export/story?lang=`, `GET …/export/cues` |
| Assets | `GET /api/assets/:id` (owner-scoped) |

Everything a player can do in the UI is exactly one of these endpoints — the E2E suites (and any
agent) can play the game headlessly.

---

## 5. Operational notes & gotchas

- **One server instance**: multiple `node server/index.js` processes can silently share the port.
  Kill all (`pgrep -f "^node server/index.js"`) before restarting.
- **System deps**: `ffmpeg` (audio transcode/mux), `zip`/`unzip` (bundles), Python3 + `rembg`
  + `Pillow` (sprite matting), Playwright Chromium (E2E only).
- **LAIONBox** is single-GPU and serializes requests (~5-6 s per line incl. VC+Sidon). The
  pipelined player is designed around exactly that.
- **Tick concurrency** is locked per world (409 `TICK_IN_PROGRESS`) with a DB unique index as a
  hard net.
- **Credits math** lives in micro-credits (integers) end to end; only the UI rounds.
- **Deletion is real**: worlds/users cascade across all 12+ scoped tables and delete asset files.
