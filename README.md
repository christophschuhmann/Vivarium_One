# Vivarium

Vivarium is a browser-based life simulation and visual-novel sandbox. Create an illustrated world, give its characters relationships and goals, advance time, and watch the story unfold with character sprites, narration, voices and an automatically selected soundtrack.

The default local installation runs on **your own HyprLab or OpenRouter API key**. You only need **one** of those accounts. You do not need an admin login or Vivarium credits. Provider charges still apply to your own provider account.

[Full architecture documentation](docs/DOCUMENTATION.md) · [Design log](plan/implementation-plan.html) · [Living World implementation plan](living-world-implementierungsplan.html) · [Implemented Living World, measurements and roadmap](docs/living-world.html)

## Install locally

Supported setup: Linux, macOS, or Windows through WSL. Install **Node 22 or newer** (minimum supported by the installer: Node 20.12), Python 3, `ffmpeg`, `zip` and `unzip`.

On Debian/Ubuntu/WSL, the system dependencies are:

```bash
sudo apt install ffmpeg zip unzip python3 python3-venv
```

Install a recent Node version from [nodejs.org](https://nodejs.org/en/download) or your existing Node version manager. Then:

```bash
git clone https://github.com/christophschuhmann/Vivarium_One.git
cd Vivarium_One
npm run setup
npm start
```

Open **http://localhost:8890**. The setup command prints the initial login for a verified local player, normally `player@vivarium.local`, and a randomly generated password. Save that password. The player is also the local installation owner for shared music management; no admin account is needed.

`npm run setup`:

1. Checks Node, Python and the command-line dependencies.
2. Installs the Node dependencies.
3. Creates `.env` if it does not exist, with local-only binding and personal-provider mode.
4. Creates `.venv` and installs Pillow, NumPy and the Hugging Face downloader. Character greenscreen matting does not require a GPU or a background-removal model.
5. Creates a verified local player with personal-provider mode enabled and no requirement for credits.
6. Preserves existing `.env`, accounts, passwords, worlds and saved keys on repeat runs.

To choose the account yourself, set `VIV_PLAYER_EMAIL` and optionally `VIV_PLAYER_PASSWORD` in your shell before setup. These are installer inputs; avoid committing them. `npm run setup -- --no-install --no-python` is useful when dependencies are already installed. `npm run setup -- --with-music` also downloads the optional music library; see below.

A fresh `.env` binds to `127.0.0.1`. To serve other computers, deliberately change `VIV_HOST` to `0.0.0.0` and configure your HTTPS reverse proxy. Existing installations retain their current configuration.

## First session: connect one provider

1. Sign in with the local player's credentials printed by setup.
2. Open **Settings → AI & models**.
3. Enter **either a HyprLab key or an OpenRouter key**. Leave the other field empty.
4. Choose **My own providers** and select your models.
5. Click **Save my settings**. This saves and tests any key you just entered, as well as your model choices. A separate click on Save key is optional.

A single connected provider is used for all four tasks: story/dialogue, images, speech and microphone transcription. An older saved choice pointing at an unconnected provider is moved to the connected account's defaults. If both accounts are connected, you can mix providers by task, such as HyprLab images and OpenRouter dialogue.

The model lists are fetched from the providers. HyprLab's `/models` response has model IDs but no modality metadata, so the game uses an explicit dashboard classification snapshot in `config/hyprlab_models.json` and intersects it with the live API response. This prevents video, music, embeddings or moderation models from appearing in the story-model picker. The 2026-10-06 snapshot includes 115 chat models, 53 dedicated image models, 14 speech models and three transcription models. Chat-image models are kept out of the dedicated image-generation menu because they use a different endpoint.

Default HyprLab personal choices:

| Task | Model |
|---|---|
| Story and dialogue | `gemini-3.5-flash` |
| Images | `nano-banana-2` |
| Voices | `gemini-3.8-flash-tts` |
| Microphone | `whisper-1` |

`gemini-3.1-flash-tts` remains selectable. Selecting a HyprLab ElevenLabs model reveals a voice-ID field, initially set to George; you can paste another ID from the [ElevenLabs voice library](https://elevenlabs.io/docs/eleven-api/quickstart). The adapter uses ElevenLabs-specific `text` and `voice_id` parameters. The newer Gemini 3.8 voice API receives performance direction separately from the text to speak.

Personal keys are validated and encrypted at rest with AES-256-GCM. The browser receives a masked preview, never the stored key. Requests are scoped to the signed-in account; your choices do not change another player's models. When personal mode is active, model calls use your keys and bypass the Vivarium credit ledger. A missing personal key produces a settings error rather than silently using an operator's account.

If you remove one provider while the other remains connected, personal mode stays available through the remaining provider. Removing the last key disables personal mode. The operator can optionally offer **Server AI** with central credentials and credits; that is separate from the default local BYOK workflow.

## Create and play a scenario

### Build a world

From the home screen, open the **World Wizard**. Describe the setting, desired characters, relationships and tone. For example:

> A present-day seaside university town. Two postgraduate flatmates, their retired neighbour and a visiting researcher. A quiet mystery about a missing laboratory notebook, with warm everyday scenes and restrained suspense.

Discuss the proposed plan with the wizard. Refine character profiles, locations, connected paths and the opening scenes. Review the image count and provider usage before starting the build. With personal mode enabled, the build uses your own provider account rather than requiring Vivarium credits.

The wizard creates location backgrounds, character portraits and greenscreen-matted sprites. It can author a cinematic opening sequence which plays scene by scene. Larger requests stream progress to the browser. Image and voice generation take time and incur provider charges.

You can also start a blank world, use **Forge** to develop characters through conversation, and populate the cast and map incrementally. Generated characters retain an identity reference when outfits are added.

### Advance time and intervene

Open the world on the **Stage**. Use the action bar to advance 30 seconds, five minutes, an hour, a day, or a custom interval. Each meaningful scene records character states, location, dialogue, thoughts and narration.

Type what you want to happen, give a character a nudge, or use the microphone. Select a viewpoint character or location to control which scene you watch. The GM uses the cast's goals, relationships, recent events and memories when deciding what happens next.

Long skips can play as a sequence of scenes. **Settings → Time skips** lets you choose the animated film or a direct jump, and whether the film includes side plots and relationship moments. The timeline stores each generated moment.

### Voices, microphone and language

**Settings → Voice & music** controls autoplay, narrator voice, character performance directions, voice volume and playback speed. Voice preparation can pre-generate the next lines while the current one is playing. Changing a provider or model changes the hosted voice cache identity, so a newly requested line respects your selected model.

**Settings → Microphone** provides a device picker and a live input test. The browser needs microphone permission, and remote browser microphone use requires HTTPS. Speech input is normalized for the transcription endpoint; OpenRouter audio-input models receive WAV when the browser can convert it.

Use the language selector for English, German, French or Spanish. The UI and subsequent narration follow the selected language.

### Rewind, branch and duplicate

The timeline supports undo, redo and jumps into earlier scenes. Continuing from an earlier moment creates an alternative future. Full duplicates are available from the home-screen copy button or **Settings → Storage**: they copy the world, cast, locations, timelines and their media to new IDs and files.

Older same-server branches may share asset IDs with the original. Exports include those referenced files, and deleting the original preserves files still used by another world. A full new duplicate is independent of those shared files.

## Enable automatic music

Vivarium selects background music from the pre-generated [LAION-Tunes RPG Music dataset](https://huggingface.co/datasets/laion/laion-tunes-rpg-music). The dataset contains 2,580 annotated tracks across 18 setting genres, with scene descriptions, moods and music captions. There are 2,075 tracks labelled instrumental. The game searches locally and does not call a music-generation API.

The dataset is gated on Hugging Face. Accept its access conditions on the dataset page and use a Hugging Face token with access to it. Enter the token into your shell without placing it in command history:

```bash
read -r -s -p "Hugging Face token: " HF_TOKEN
printf '\n'
export HF_TOKEN
npm run music:setup
unset HF_TOKEN
npm start
```

On shells where `read -p` is unsupported, set `HF_TOKEN` using that shell's secure input facility. The downloader uses the token for authenticated download; it is not written into the repository or the music metadata.

The audio TARs total roughly **14.2 GB**, with additional metadata, indices and a local search cache. Allow approximately **15 GB** for the library. Setup pins the source revision for its download, keeps the original annotations and indices, and builds `audio-index.json` containing offsets into the three TAR shards. The MP3s stay inside the shards, so there is no second unpacked audio copy. Running the command again resumes/reuses completed files.

`npm start` starts the music service automatically when `audio-index.json` exists. The game is on port 8890; the internal music service binds only to `127.0.0.1:8930`. It uses the same Node installation and requires **no GPU, Torch or embedding-model download**. If the optional music dataset is missing, Vivarium still runs.

### How scoring works

- The GM requests music using an English scene description, genre and mood when a scene's atmosphere changes.
- A world without a score receives a starter track based on the current location, scene summary and mood.
- The local server uses SQLite FTS5 BM25 over the supplied scene annotations, captions, emotions and tags, with genre filtering.
- Automatic selection prioritizes search relevance. The alternatives retain aesthetic scores and popularity information for manual choice.
- Results are restricted to locally available files labelled SFW and instrumental.
- Each location remembers its soundtrack. Moving between differently scored locations crossfades the tracks.
- The **🎶 music button** shows the current query, suggested alternatives and playable previews. You can choose another track, search by descriptive caption, mute or change the music volume in Settings.
- The application proxies the audio through the signed-in browser's same-origin API, including HTTP Range requests, so seeking works through HTTPS tunnels.

Music attribution is shown in the music picker, metadata and Storage view. The dataset declares **CC BY 4.0**; preserve the dataset attribution when sharing music exports. Music selection is optional and a search-service failure does not prevent a story tick.

Useful commands:

```bash
npm run music                            # run only the music service
npm run music:setup -- --index-only       # rebuild audio offsets from existing TARs
```

For a separately managed compatible search server, set `MUSIC_API_URL`. Set `MUSIC_SEARCH_FIELD=caption` for a server with vector-caption search; the bundled service defaults to `bm25_situation`. With an explicit external URL, the launcher does not start a second local server.

## Storage monitor and library management

Open **Settings → Storage**. This view works with the normal player login and shows:

- Your asset bytes and file count, including generated thumbnails.
- Unused asset bytes that can be reclaimed.
- Each scenario's linked media bytes, story/state bytes and current tick.
- Shared music-library storage, track availability and search engine status.
- The pre-generated image library's footprint, shared database size and free disk space.

The database and music library are shared installation resources. Scenario byte totals can overlap for older shared branches; the account-wide asset total counts each file once.

### Scenario actions

| Action | Result |
|---|---|
| Export ZIP | Downloads a complete `.vivarium.zip`-compatible save: world state, cast, places, all timelines and linked assets. |
| Duplicate | Creates a new independent scenario with copied files and remapped IDs. No model calls or credits. |
| Delete | Removes the scenario and media not needed by another scenario. The UI asks for confirmation. Export a backup first if you want to keep it. |
| Restore a scenario ZIP | Imports the archive as a new world owned by the signed-in account. Existing worlds remain intact. |

Scenario ZIP import currently has a 300 MB upload limit. Shared soundtrack files are not duplicated into each scenario save: the music library can be exported separately by the installation owner. For an offline narrated film including its chosen music, use the story export below.

### Asset actions

Filter assets by kind or **Only unused**. Images have previews; audio has playback controls. The view is paginated in groups of 30 so large voice caches do not overload the browser.

Select individual assets or a page and choose **Export selected ZIP**. The archive includes the binaries, JSON sidecars and an asset manifest, with prompts and metadata. Up to 1,000 assets can be exported in one bundle.

**Download** saves one original file. **Duplicate** creates a separate, unused asset copy. **Delete** removes an unused file and its thumbnails. The server refuses deletion when a location, character, saved scene or world snapshot still references the asset. You cannot read, duplicate, export or delete another player's assets by changing an ID in a URL.

The asset ZIP is an archival media bundle; scenario restore uses the scenario ZIP format. Standalone duplicated assets appear in the library but are not automatically assigned to a character or location.

### Shared music actions

The verified player created by `npm run setup` is the local installation owner. That account can export the shared music library as a ZIP, rebuild its BM25 cache, or remove the downloaded library. On multi-user installations these shared actions require the installation owner or an authenticated operator session; ordinary players can see the shared footprint and manage only their own files.

Music cache and removal controls require the supervised `npm start` launcher. Removing the library asks you to type `DELETE MUSIC LIBRARY`; it affects music availability for the installation. Restore it with `npm run music:setup`, then restart Vivarium. Exporting music may create an additional ZIP approximately the size of the library, so free disk space should cover it.

The pre-generated image library is shown as a shared footprint. This monitor does not remove system files, another account's media, or files outside the configured libraries.

## Export a narrated story

The world's export menu provides a **story bundle**: a self-playing visual-novel film with the bundled offline `player.html`, scene cues, backgrounds, sprites, cached/generated voice clips and score changes. It plays in a browser without the Vivarium server.

Before export, the app checks which narration is already cached. Choose to generate missing audio on your provider account or export with those lines silent. Cached audio does not incur regeneration charges. This differs from a scenario save: a story bundle is for watching, while a scenario ZIP is for restoring and continuing the simulation.

API keys, passwords and account settings are not part of scenario or story exports. Back up `.env` and the full runtime database separately if you are migrating the whole installation and want to retain encrypted provider credentials.

## Pre-generated Living World image assets

The complete offline image library is stored separately as a private Hugging Face dataset:

**[TTS-AGI/vivarium-living-world-assets](https://huggingface.co/datasets/TTS-AGI/vivarium-living-world-assets)**

It contains a verified WebDataset TAR with 167 canonical image samples: 47 existing unique backgrounds, 30 newly generated locations and 90 greenscreen characters. Images are paired with original JSON sidecars and captions. Metadata also contains the offline gallery, references, previews and revision history. Authorized Hugging Face access is required to download it.

The generation, review and packaging scripts are in `scripts/`. Large generated image libraries and audio downloads stay out of Git. This asset library is a prepared resource; it does not replace every game's runtime image-generation path automatically.

## Living World: a town with procedural Sims and anchored stories

The `living-world` branch adds a separate **Living World** view. Classic scenarios continue to use the existing studio. There is no player/NPC split in this view: every resident is a Sim with goals, needs, relationships and a personal journal. An anchor changes how that Sim is narrated, while preserving their identity and history.

### Install this branch

```bash
git clone --branch living-world --recurse-submodules https://github.com/christophschuhmann/Vivarium_One.git
cd Vivarium_One
npm run setup
npm run living:setup
npm start
```

Python 3.11 or newer is recommended for the Open Sims adapter. `setup` initializes the pinned Open Sims submodule automatically when needed. `living:setup` uses the bundled Vivarium backgrounds and adult cutouts if the full asset library has not been installed. Sims without an age-appropriate sprite receive a name/colour placeholder; adults are never substituted as children's portraits. Procedural towns also work without an AI key when the Storyteller checkbox is off.

To install the full existing library (77 backgrounds and 90 character variants), use a Hugging Face token with access to the private dataset, set `HF_TOKEN` in your shell, and run:

```bash
npm run living:setup -- --download
```

The downloader restores `data/living-world-library.wds.tar` from `TTS-AGI/vivarium-living-world-assets`, checks the original file hashes, and prepares 90 reusable transparent sprites locally. You can instead point at an already restored library:

```bash
npm run living:setup -- --library /absolute/path/to/living-world-library
```

For subsequent server starts, set the same `VIV_LIVING_LIBRARY` path in your local `.env`. The default download directory needs no additional configuration. Character matting runs once, without API calls. The shared library is reused across all households. Scenario ZIPs include the library pictures and prepared sprites actually referenced by that scenario.

### Start small, then grow

1. Sign in with the local player and connect **one** HyprLab or OpenRouter key through Settings, or **Mein API-Key** inside Living World. No admin login or credit purchase is required.
2. Open **Living World** from the studio, or visit `/living.html`.
3. Click **Neue Stadt**, begin with **10 Sims**, and choose a reproducible seed. The initial two Sim anchors get written biographies when **Anker-Biografien vom Sprachmodell schreiben lassen** is enabled. Other residents receive procedural backgrounds, household ties and ambitions.
4. If you are trying it without a key, disable that biography checkbox and the main **Storyteller für Anker & Kontakte** checkbox. Pending authored backgrounds remain visibly labelled; no AI output is fabricated.
5. Advance **5**, **15**, or **60 minutes**. Time advances only after a successful committed step. With Storyteller enabled, the procedural proposals run first, then actual anchored encounters are narrated together.
6. Use **Stadt erweitern** in the Sims tab to grow to 20, 50, 100 and finally 500 residents. Existing residents, anchors, states and journals are preserved. The seed-73 town at 500 has 200 households and 1,032 hierarchical places.

You can also create 500 directly. Starting small makes it easier to inspect why individual Sims move and react. A village does not become more visually expensive merely because more residents are simulated.

### Choose anchors and inspect perspectives

- **Sim anchor:** select any person, then **Sim verankern**. Their anchor follows them through rooms, travel and phone calls. Removing it does not erase memories or relationships. A procedural biography is marked for authored completion on the next hybrid step.
- **Location anchor:** open a room or the **Anker** tab and choose **Diesen Ort verankern**. Building, neighborhood, district and city anchors also include their descendant locations. All actual occupants encountered during the step become eligible for the Storyteller.
- **Visitors and contacts:** an unanchored Sim joining an anchored room or another anchored Sim's room is included. Explicit phone contacts extend the field across locations. Shared travel segments are also treated as fields. Field membership is based on timed presence and actual contacts, rather than distance or a global all-knowing cast.
- **Personal journal:** select a Sim to inspect their age, family/neighbor ties, needs, ambitions and biography. Every recorded perception links to an actual event. Interpretation and confidence are shown separately. Older entries are paginated and personal BM25 retrieval gives the Storyteller relevant memories belonging to that Sim only.
- **Written background:** **Mit Assistenten ausarbeiten** accepts instructions for motives and formative memories. It records a new authored background entry while leaving already witnessed events intact.
- **Felder:** inspect how many Sims were selected, how many model calls ran, and which invalid proposals were rejected. Removing all anchors makes the town entirely procedural.

A failed, cancelled or stale tick leaves world time, current states and new journals unchanged. Provider calls already made remain billable on your provider account. Selecting a city-wide anchor intentionally involves many Sims; large fields are split into groups of at most 24 owned Sims per model call.

### Navigate without loading the whole town

Click district → neighborhood → house → room. Breadcrumbs and **Eine Ebene zurück** move out; drag the map background to pan. Ctrl + mouse wheel over a card moves in; Ctrl + wheel down or double-clicking the empty map moves out. On touch screens, use the cards and breadcrumbs.

Only the current region has thumbnail cards, with at most 64 on a page. Other districts and important public places use text/icon chips. A room shows at most eight character sprites, with pagination when needed. The old region's image elements are removed before the next one is displayed. Reused sprites are distinguished by name and frame colour. The full asset library is not preloaded into the browser.

In **Assets**, enter a caption, inspect the five BM25 candidates and their metadata, and either select one or let the model choose among those exact IDs. Automatic generation selects age/gender-compatible sprites and caption-matched backgrounds. House previews currently use representative existing entrance/street backgrounds; dedicated facade illustrations can be added to the library without changing the simulation.

Room actions appear in text even when the drawing cannot animate sitting at a desk, reading, using a shower or performing a job. Sprites show presence, rather than furniture poses or continuous walking animations.

### Backups, tests and current scope

Use **Settings → Storage & scenarios** to export, duplicate or delete a Living World town. Its ZIP includes every Living World table, personal journal and anchor audit, plus the referenced illustrations and available cutouts. Import remaps entity IDs and rebuilds the personal memory index. Keys, accounts, billing and the shared music collection are excluded from scenario exports.

```bash
npm run test:living
npm run benchmark:living
```

The engine test uses temporary databases and injected model responses; it does not call a paid provider. The benchmark runs five-minute steps and a full simulated day at 10, 20, 50, 100 and 500 residents, writing `artifacts/living-world/benchmark.json`. A separate manual browser review is available in `scripts/test-living-browser.mjs`; it targets an explicitly prepared preview on port 8891 and changes that preview's towns.

The [HTML implementation report](docs/living-world.html) explains the coordinator, causal checks and measured limits. This is an initial playable implementation capped at 500 residents. The Python adapter uses the actual Open Sims needs, action rules, psychology, social consent checks, affect and career progression. It does not yet reproduce its complete inventory/cooking economy, every institution or university system. Continuous real-time animation, distributed million-resident simulation and Living World rewind/replay controls remain future work. Classic studio music/voices remain available; the new Living World view currently presents text and still sprites.

Open Sims is a separately versioned Git submodule at `c968251faffb99e012af4795902ef643802f14d5`; its README currently specifies that an upstream license has not yet been selected. This repository's MIT license applies to Vivarium code, without relicensing the upstream submodule.

## Optional operator deployment

An operator may set central `HYPRLAB_API_KEY` or `OPENROUTER_API_KEY` credentials in `.env` or the admin provider console. Player-specific settings override central models only for that account. The console also controls the credit ledger, users, prompts, context configuration and model routes.

For the original bundled Alice & Bob demo and operator account, run `npm run seed` explicitly. It creates `demo@vivarium.local` / `alice-and-bob` and `admin@vivarium.local` / `admin-vivarium-2026`. These are convenience demo credentials, not the randomly generated local account from setup. Replace them before exposing the deployment publicly.

New sign-ups need email verification. Without SMTP, the verification code is printed in the server log and appears in the operator mailbox. The local setup account is already verified, so the personal installation flow does not depend on an operator mailbox.

Keep a stable `VIV_SECRET` when moving a database with encrypted keys. The installer creates it for a fresh database. Existing databases without an environment secret retain their stored per-installation secret; setup does not replace their encryption identity.

## Configuration

See [.env.example](.env.example). Important options:

| Variable | Purpose |
|---|---|
| `PORT` | Game HTTP port; default 8890. |
| `VIV_HOST` | Listen interface. Fresh setup uses `127.0.0.1`. |
| `VIV_DATA_DIR` | Runtime database and generated media; default `./data`. |
| `VIV_PERSONAL_MODE=1` | New accounts start in personal-provider mode. Existing choices are preserved. |
| `VIV_SECRET` | Stable encryption identity for saved keys. |
| `VIV_PYTHON_BIN` | Python for greenscreen matting and music download; `.venv/bin/python` is used automatically when present. |
| `MUSIC_DATA_DIR` | Downloaded music directory; default `<VIV_DATA_DIR>/music-library`. |
| `MUSIC_API_URL` | Existing external/independently managed search service; disables bundled autostart. |
| `MUSIC_PORT` | Bundled loopback search port; default 8930. |
| `MUSIC_AUTOSTART=0` | Start the game without starting the local music process. |
| `MUSIC_SEARCH_FIELD` | Search mode; default `bm25_situation`. |
| `MOCK_PROVIDERS=1` | Deterministic fake model responses for testing; no external model charges. |
| `TEST_MODE=1` | Test helper endpoints; never enable on a public production deployment. |

Stop `npm start` with Ctrl-C to stop both the game and its supervised music process. If port 8930 is already occupied, stop the old music server or point `MUSIC_API_URL` at it.

## Troubleshooting

**Saving says a key is missing.** Enter one complete key in AI & models and click Save my settings. A blank second provider is supported. If both keys were removed, reconnect one. A rejected or expired key must be replaced; it cannot be used for generation.

**Provider credit errors.** Personal mode bypasses Vivarium credits, not the provider's balance or quotas. Fund the selected provider account or choose an available model in that account.

**A model is missing from the HyprLab menu.** Use Refresh catalog. Only IDs present in the live API and explicitly classified for the matching endpoint are offered. A new dashboard model may require updating `config/hyprlab_models.json`; video/music/embedding and chat-image entries are intentionally outside the game's dedicated task menus.

**No background music.** Check Settings → Storage for availability. Accept dataset access on Hugging Face, run music:setup with an authorized token, and restart. Missing music never blocks a story scene. Browser autoplay may require an initial click, and Voice & music can mute the score.

**Broken image cutouts.** Run setup again to install Pillow and NumPy in `.venv`, or set `VIV_PYTHON_BIN` to a Python environment with them.

**The browser has an old UI after updating.** Reload the page. Static application files are served with revalidation; an already-open tab continues executing the version it loaded.

**An asset cannot be deleted.** It is referenced by a live scenario or saved scene. Export or delete the appropriate scenario, then refresh Only unused. This protects earlier timelines from losing their artwork or voices.

## Development and tests

```bash
npm run test:providers     # provider routing, encrypted keys, one-key BYOK and credit isolation
npm run test:music         # real BM25 queries and TAR audio ranges (needs downloaded library)
npm run test:storage       # account ownership, export/duplicate/delete and scenario independence
npm run test:settings      # isolated browser: BYOK, storage, music, mobile and five-minute tick
npm run test:e2e           # existing browser suites; requires installed Playwright Chromium
```

`npx playwright install chromium` is needed only for browser testing, not normal play. Automated mutation tests use separate temporary runtime directories. Do not run destructive test endpoints against your live database.

## Repository layout

```text
server/             Game API, provider routing, world simulation, storage tools and music service
web/                No-build browser app, settings studio, storage monitor and offline player
config/             Voice data and explicit HyprLab modality classification
scripts/setup.mjs   Local installer and verified personal account
scripts/start.mjs   Game + optional music supervisor
scripts/setup-music.py  Resumable dataset download and TAR offset index
scripts/            Seed/demo tools, asset generation and validation scripts
e2e/                Browser regression tests
docs/               Detailed architecture and feature documentation
rpg/                Existing first-person RPG variant, maintained as a separate app
data/               Ignored runtime DB, generated media, music downloads and caches
```

## License

Application code: MIT. Model outputs are subject to provider terms. The downloaded music dataset declares CC BY 4.0; its original README is retained with the library and the game supplies dataset attribution.
