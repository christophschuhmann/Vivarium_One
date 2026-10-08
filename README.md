# Vivarium

Vivarium is a browser-based life simulation and visual-novel sandbox. Create an illustrated world, give its characters relationships and goals, advance time, and watch the story unfold with character sprites, narration, voices and an automatically selected soundtrack.

The default local installation runs on **your own HyprLab or OpenRouter API key**. You only need **one** of those accounts. You do not need an admin login or Vivarium credits. Provider charges still apply to your own provider account.

[Bennington engine makeover: plan and delivery](docs/bennington-engine-makeover.html) · [Expanded town: implementation, usage and measurements](docs/living-world-expanded.html) · [Full architecture documentation](docs/DOCUMENTATION.md) · [Design log](plan/implementation-plan.html) · [Living World implementation plan](living-world-implementierungsplan.html) · [Implemented Living World, measurements and roadmap](docs/living-world.html)


## Bennington and the minute engine

The [behavior and UI audit](docs/behavior-quality-audit.html) records observed defects, repairs, before/after measurements and remaining limits. It includes three-day life reviews and a full day on a copy of the existing 1,000-resident town. **Personality & reputation → Unfinished conversations** now shows remembered relationship strains and gradual repair. Accepted conversation is not automatically positive: needs, feelings and PERMA distinguish warmth, hurt, disagreement and boundaries. In Play, secondary emotions expand on demand so needs and attributes remain easier to reach.

Run `npm run audit:life` for an isolated 100-resident, 72-hour procedural audit. The report is written to `docs/bennington-life-audit.html`. Use `AUDIT_DATA_DIR=/tmp/my-life-audit` to keep the test database for further inspection. Detailed history still consumes substantial disk space at city scale; the audit documents this measured limit rather than implying that year-long runs are already optimized.

Start **Living World → New town** for a fictional Bennington, Vermont scenario. Choose 10–100 residents for an experiment, 1,000 for a populated town, or up to 2,000. Existing saves keep their residents, currency and history. Streets and selected public institutions are researched; people, private businesses, households and story events are fictional. The age-cohort targets come from [Census QuickFacts](https://www.census.gov/quickfacts/fact/table/benningtontownbenningtoncountyvermont/RHI125224). This is a stylized graph, not a parcel-accurate street map. The game economy uses dollars here and retains Vivarium's simplified tax/care policy; it does not reproduce Vermont legislation or actual salaries.

In a Living World, **one tick is always one minute**. Choosing an hour executes 60 of those ticks, and a day executes 1,440. Need changes, journeys, task progress, available contacts and interruptions are checked every minute. Research, reading, creative work and study retain their progress when an accepted conversation or urgent need interrupts them. A conversation occupies both participants until it ends or is interrupted. No minute is skipped simply because the Sim has no anchor.

**Anchors & simulation → Storyteller** controls model narration. With it off, the whole town still runs locally without paid model calls. With it on, real events are narrated at intervals of up to five minutes for anchored characters/places and their actual contacts. Model intentions affect future actions, while committed physical facts and transactions stay fixed. A day with the Storyteller enabled may therefore require many model calls. CPU-only advances save at intervals of up to 60 minutes; narrated advances save each scene interval. Cancel preserves completed intervals and discards only the unfinished one; the scene reloads to the saved clock.

**Turbo** is in the Play anchor toolbar. Open it, choose 1 hour, 6 hours, 1 day, 3 days, a week, 30 days or 365 days, and press **Start Turbo**. The dialog explicitly explains that anchored Sims also use procedural rules during this run. Their anchors are preserved. The job runs in a background worker, shows saved progress and an estimate after the first hour, and continues if you close the dialog or browser. **Stop Turbo** retains completed hourly checkpoints. Restarting the server marks the run interrupted; it never silently resumes a year of computation. The same world cannot be edited or advanced concurrently. Up to two independent worlds can have workers; a single world's minute interactions remain causally ordered.

**Life progression** uses dated birthdays. Children enter age-appropriate schooling; becoming 18 does not award a degree or a job, and actual study requirements still apply. The game currently retires regular workers at 66, a configurable-design assumption rather than Vermont law. Jobs can change after applications, financial pressure, layoffs or a sustained ambition for a better fit. Reciprocal adult interest can develop into dating; sustained severe conflict can end a partnership or marriage. Shared housing, parenting, property, debt and sexual consent stay separate from the relationship decision. Moving out requires an independent budget and accepted housing application. Shared funds and children's savings are not silently taken. Existing housing rules handle rent arrears, applications, relocation and funded shelter. **My daily life → Life changes** shows recent major transitions, with the full record in the journal.

**Personal journal:** open a Sim from Play or Cast, then Journal. Entries record starts, arrivals, interruptions and causes, resumptions, completions and social outcomes, with the Sim's own interpretation. Event metadata retains their needs and feelings at the event. Empty minutes produce no journal entry. A task completion that also completes a personal ambition records that achievement. Initial biography is labeled as initialized background, not as witnessed history.

**Town life → My daily life** shows needs, attributes, current activity progress, paused tasks, Big Five, ambition, cooperation and shared goals with known contacts. Contact choice considers local opportunities, extraversion, relationships and shared interests. Accepted plans can create a real journey/activity. Responses to good news may be active/passive and constructive/destructive; actual responses affect relationships and PERMA. Attraction is adult-only, uses individual preferences, and does not substitute for consent. **Social perspective** explains plausible interpretations, contrary possibilities, the Sim's own emotional lens and what remains unknown.

**Work & education** links directly to the actual workplace scene. **Finances** shows household income class alongside the calculation: expected monthly household net income / square root of household size, relative to the displayed game reference. Wealth, debt, cash reserves and reputation remain separate. Coaching/counseling has an explanatory booking dialog; improvements require attendance, time, available service resources and payment through the appropriate account. Research-linked **i** cards explain shared goals, response styles, Big Five, PERMA, income comparisons and action consequences.

English is the default for UI labels, new core procedural narration, social interpretations and Storyteller output. Existing histories retain their wording; some inherited detailed economy catalog descriptions remain German. The language menu can enable local translation of older passages when the browser provides its Translator API. There is no automatic upload of private Sim journals to an unrelated free translation service.

### Portraits, feelings and a readable town map

Click a Sim in **Play** to open **Mind**. Their portrait, name, age, gender and current occupation appear in the header. **Inner voice** and emotion bars are at the top; **Needs & attributes ↓** takes you straight to the physical needs and abilities. Emotion percentages are simultaneous intensities, not probabilities or a pie chart. Open **Why this feeling?** to see its causes.

Automatic casting uses neutral base portraits and the closest recorded image age within the appropriate age band. Mild contentment or hope keeps a neutral expression. Strong feelings can select an available expression of the same identity and outfit (ordinary expression threshold 50%, broad laughter 80%); missing variants fall back to neutral. Source ages describe stylized artwork, not a guarantee of how old every face looks. Explicitly selected portraits are retained by the repair utility.

New towns begin with varied, age-appropriate outlooks: contentment and anticipation, but also belonging concerns, family boundaries, recognition rivalry, job uncertainty or an actual household funding gap. Some Sims initially maintain a composed public manner while feeling unsettled privately; Mind displays that difference. Background concerns affect the existing emotions, relationship tension and decision rules, and are supplied to the Sim's own conversation context. They do not assert knowledge of another person's intentions. Initial emotion components expire after two to six simulated hours; subsequent experiences and needs drive the ongoing state. The journal labels these starting conditions as **initialized background**, rather than claiming that a new conflict has already happened during play.

**World** uses distinct illustrative neighborhood pictures. Large groups such as Downtown contain additional display groups so every real building remains reachable. These groups do not add walking distance or change the simulation's real rooms. Click to select a location; double-click a room to enter its Play scene. The shared thumbnail budget remains 50, with offscreen images unloaded and older expansions collapsed as needed.

**Finances** starts with three questions: money accessible today, actual payments in the selected month, and the next month's plan. The equation shows **expected take-home income − planned costs − earmarked saving = monthly margin**. Outstanding bills are shown separately. A savings plan is not a payment; a forecast is not money already received. Income rows identify the earner and show gross pay and deductions where applicable. All 100 concept cards have an English version, including their examples, reflection questions and source links.

For an existing installation, back up the database and stop the game server before an explicit artwork repair. Without `--apply`, these utilities only report proposed changes:

```bash
node --env-file=.env scripts/refresh-living-art.mjs --world=YOUR_WORLD_ID
node --env-file=.env scripts/refresh-living-art.mjs --world=YOUR_WORLD_ID --apply
```

`initialize-living-outlooks.mjs --world=YOUR_WORLD_ID` can add starting outlooks only before a world's first time advance. Add `--apply` to persist them. Sims with authored biographies, existing outlooks or logged player interactions are skipped. It never upgrades a town after its first simulated tick.

### Install or update the HF image libraries

The two public datasets are optional. The measured snapshot contains 12,943 indexed images (1,693 backgrounds and 11,250 character variants across 740 identities), about 15.8 GB in original shards. Setup installs Pillow and NumPy for transparent character matting. No image-generation API calls are needed to reuse these assets.

```bash
npm run assets:sync
```

By default, shards, `catalog.sqlite` and the lazy `cache/` live in `data/hf-asset-library`. To share the download between installations, set `VIV_ASSET_LIBRARY=/absolute/path/to/hf-asset-library` in `.env` before syncing. `VIV_PYTHON_BIN` can point to an existing Python environment with Pillow and NumPy; otherwise `.venv/bin/python` is used when available. Run the same command again as the repositories grow. It pins each source revision, verifies file sizes and hashes, skips verified unchanged files and atomically replaces the FTS5 index. A failed sync/index leaves the previous catalog in place. Original shards are never expanded into thousands of full image files.

Open **Cast → Image library** to search captions with BM25, filter characters by age, gender, heritage, outfit style or expression, and exclude identities already used in the current town. A page displays at most 24 results. Prompts, source revision and license provenance are retained; character expression changes use a compatible variant of the same identity when one exists, otherwise the current outfit stays. Greenscreen removal happens on demand and is cached. Upstream age/release checks are applied before a minor's image can enter the catalog; 100 unverified variants were withheld in this snapshot.

Scenario ZIP exports materialize and include their referenced artwork, including transparent sprites, with provenance and license text. They do not include the entire shared image collection. ZIP downloads stream from disk. Clear the derived cache only when the server is stopped; it can be recreated from the original shards. Keep those shards and `source-tree.json` together when moving the library.

```bash
npm run test:minute-engine
npm run test:expanded-regressions
npm run test:turbo
npm run test:progression
VIV_ASSET_LIBRARY=/path/to/hf-asset-library npm run test:portraits-map
VIV_ASSET_LIBRARY=/path/to/hf-asset-library npm run test:portraits-map-browser
npm run audit:life
VIV_ASSET_LIBRARY=/path/to/hf-asset-library npm run test:hf-assets
VIV_ASSET_LIBRARY=/path/to/hf-asset-library npm run test:bennington-browser
VIV_ASSET_LIBRARY=/path/to/hf-asset-library npm run benchmark:bennington
```

The browser tests use isolated databases and no paid calls. Install Chromium with `npx playwright install chromium`. Reports and screenshots are in `artifacts/expanded-world/`. One-hour versus sixty-single-minute equivalence, full-day runs, worker cancellation and targeted life-transition fixtures are separate checks. [The multiday review](docs/bennington-life-audit.html) contains representative personal journals, including children, teenagers and older adults. Larger population measurements are recorded separately; they are not evidence for a 10,000-Sim or million-resident city. Current API/UI limit: 2,000 Sims.

Performance and storage are measured, not guaranteed: full-day tests are saved in `artifacts/expanded-world/bennington-*-day*.json` and `bennington-day-*.json`. Long runs retain every meaningful personal event and can accumulate substantial history. A year has 525,600 ticks; the month/year controls do not imply that these runs finish instantly or use little disk space. Further scaling needs partitioned persistent history and carefully synchronized neighborhood workers, not just more browser thumbnails. A million-resident city and a complete year at 2,000 Sims have not been validated.

## Install locally

Supported setup: Linux, macOS, or Windows through WSL. Install **Node 22 or newer** (minimum supported by the installer: Node 20.12), Python 3, `ffmpeg`, `zip` and `unzip`.

On Debian/Ubuntu/WSL, the system dependencies are:

```bash
sudo apt install ffmpeg zip unzip python3 python3-venv
```

Install a recent Node version from [nodejs.org](https://nodejs.org/en/download) or your existing Node version manager. Then:

```bash
git clone --branch living-world-expanded --recurse-submodules https://github.com/christophschuhmann/Vivarium_One.git
cd Vivarium_One
npm run setup
npm run living:setup
npm start
```

Open **http://localhost:8890**. The setup command prints the initial login for a verified local player, normally `player@vivarium.local`, and a randomly generated password. Save that password. The player is also the local installation owner for shared music management; no admin account is needed. `main` contains the previously merged stable version; use `living-world-expanded` for the economy, ToM and town-life extensions described here.

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

Set `MUSIC_READ_ONLY=1` when this installation uses another instance's music directory: storage remains visible and exportable, while cache rebuild and deletion are refused. Music cache and removal controls otherwise require the supervised `npm start` launcher. Removing the library asks you to type `DELETE MUSIC LIBRARY`; it affects music availability for the installation. Restore it with `npm run music:setup`, then restart Vivarium. Exporting music may create an additional ZIP approximately the size of the library, so free disk space should cover it.

The pre-generated image library is shown as a shared footprint. This monitor does not remove system files, another account's media, or files outside the configured libraries.

## Export a narrated story

The world's export menu provides a **story bundle**: a self-playing visual-novel film with the bundled offline `player.html`, scene cues, backgrounds, sprites, cached/generated voice clips and score changes. It plays in a browser without the Vivarium server.

Before export, the app checks which narration is already cached. Choose to generate missing audio on your provider account or export with those lines silent. Cached audio does not incur regeneration charges. This differs from a scenario save: a story bundle is for watching, while a scenario ZIP is for restoring and continuing the simulation.

API keys, passwords and login-account settings are not part of scenario or story exports. Simulated personal/household accounts, all financial ledger legs, obligations, property/loan contracts and source references ARE included in Living World scenario ZIPs and duplicates. Back up `.env` and the full runtime database separately if you are migrating the whole installation and want to retain encrypted provider credentials.

## Pre-generated Living World image assets

The complete offline image library is stored separately as a private Hugging Face dataset:

**[TTS-AGI/vivarium-living-world-assets](https://huggingface.co/datasets/TTS-AGI/vivarium-living-world-assets)**

It contains a verified WebDataset TAR with 167 canonical image samples: 47 existing unique backgrounds, 30 newly generated locations and 90 greenscreen characters. Images are paired with original JSON sidecars and captions. Metadata also contains the offline gallery, references, previews and revision history. Authorized Hugging Face access is required to download it.

The generation, review and packaging scripts are in `scripts/`. Large generated image libraries and audio downloads stay out of Git. This asset library is a prepared resource; it does not replace every game's runtime image-generation path automatically.

## Living World: a town with procedural Sims and anchored stories

The `living-world-expanded` branch runs the Living World simulation inside the **original Vivarium stage and studio**. The stage, thought bubbles, narrator/character voices, private inner-voice dialogue, interventions, Game Master chat and scene music use the familiar interface. There is no player/NPC split: every resident is a Sim with goals, needs, relationships and a personal journal. An anchor changes how that Sim is narrated, while preserving their identity and history.

### Install this branch

```bash
git clone --branch living-world-expanded --recurse-submodules https://github.com/christophschuhmann/Vivarium_One.git
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

1. Sign in with the local player and connect **one** HyprLab or OpenRouter key through **Settings → Models & API keys**. No admin login or credit purchase is required.
2. Open **Living World** from the home screen, name your town and start with **10 Sims**. The town opens on the original **Stage**; existing `/living.html?world=…` bookmarks redirect there.
3. Click a sprite to open the original **Mind** window. Use **Inner voice** for private reflection, **In Ruhe sprechen** for a calm conversation, and **Stats & Protokoll** for needs, goals, biography, relationships and personal memories. Both kinds of conversation leave the simulation clock paused.
4. Choose **+1m**, **+5m**, **+30m** or **+1h**, then **Advance**. The clock advances only after a committed step. **Intervene** passes an event, idea, condition or directorial instruction to that step. Selecting an unanchored Sim for an intervention also includes that Sim's encounters in the narrated field for this step.
5. Use **⚓ Anker** to change Sim/location anchors and add residents, gradually growing to 20, 50, 100 and finally 500. Existing states and journals are preserved. You can switch off **Storyteller für Anker & Kontakte** here to inspect procedural simulation without a provider call.
6. **GM** opens the original Game Master chat. Ask about the focused scene or propose anchor changes and authored biographies. Changes are shown as a review card and run when you choose **Apply**. A Sim's **Biografie ausarbeiten** button also lets you supply instructions for its background.

You can also create 500 directly. Starting small makes it easier to inspect why individual Sims move and react. A village does not become more visually expensive merely because more residents are simulated.

### Choose anchors and inspect perspectives

- **Sim anchor:** click a sprite, then **Anker setzen**, or select a Sim through the **Anker & Simulation** menu. Their anchor follows them through rooms, travel and phone calls. Removing it does not erase memories or relationships. A procedural biography is marked for authored completion on the next hybrid step.
- **Location anchor:** open the Atlas and right-click a neighborhood, house or room to set its anchor. On touch devices use **Anker → Ort auswählen** and the graph focus controls. Building, neighborhood, district and city anchors also include their descendant locations. All actual occupants encountered during the step become eligible for the Storyteller.
- **Visitors and contacts:** an unanchored Sim joining an anchored room or another anchored Sim's room is included. Explicit phone contacts extend the field across locations. Shared travel segments are also treated as fields. Field membership is based on timed presence and actual contacts, rather than distance or a global all-knowing cast.
- **Personal journal:** select a Sim to inspect their age, family/neighbor ties, needs, ambitions and biography. Every recorded perception links to an actual event. Interpretation and confidence are shown separately. Older entries are paginated and personal BM25 retrieval gives the Storyteller relevant memories belonging to that Sim only.
- **Written background:** **Biografie ausarbeiten** accepts instructions for motives and formative memories. It records a new authored background entry while leaving already witnessed events intact.
- **Erzählfokus:** the anchor menu shows selected Sims and field counts from the latest step. Removing all anchors makes the town procedural unless a targeted intervention adds a temporary focus.

A failed, cancelled or stale tick leaves world time, current states and new journals unchanged. Provider calls already made remain billable on your provider account. Selecting a city-wide anchor intentionally involves many Sims; large fields are split into groups of at most 24 owned Sims per model call.

### Neighborhoods with a shared everyday life

Neighborhoods now have recognizable names such as **Am Mühlbach**, **Bücherhof**, **Alte Weberei** and **Lindenhöfe**, their own street names, atmosphere and recurring informal meeting places. Selecting a neighborhood in World shows its character and local gathering habit. New areas added through the anchor menu receive distinct names rather than numbered extensions. Search also finds their street names.

Sims begin with a bounded network of reciprocal family, neighborhood, school, work and interest-based friendships. School friendships respect age differences; workplace ties require a shared workplace. Each relationship can have several contexts, shared background, trust and small unresolved tensions. Personal wishes differ: belonging, care, recognition, stability, independence or curiosity. These influence actual procedural conversation choices and personal interpretations. Existing tensions can lead to setting boundaries, apologies or reconciliation; Open Sims continues to check feasibility, adulthood, kinship and consent.

After work or school, eligible Sims can follow mutual plans to visit a friend's living room or gather at their neighborhood's public meeting place. Visits follow the actual route graph and room capacities. School/work, urgent needs, sleep and the existing child supervision rules take priority. A proposed visit is a plan, not an accomplished event; only an actual encounter changes relationships and creates witnessed memories. The map's current focus never controls who is simulated.

Open **Stats & Protokoll** from a Sim's thought window or **Cast → Alle Sims**. **Was mir wichtig ist** shows personal wishes and neighborhood context. **Beziehungen** shows shared history and tension alongside trust and closeness. Click a contact's name to open their profile. Paused conversations and anchored Storyteller scenes receive the Sim's own motives and known relationships; other Sims' private motives remain private.

On first startup after this update, existing Living World towns are upgraded automatically, with a SQLite backup named `data/before-social-neighborhoods-<timestamp>.db`. Old generated neighborhood labels are replaced; custom names, IDs, anchors, physical states, authored biographies, numeric relationship values and past journals are retained. Supplemental background is explicitly recorded as initialization, rather than newly witnessed history. The upgrade runs once and increments the world version without advancing time. Scenario ZIP exports/duplicates retain the new context and remap its entity references.

The isolated social benchmark includes a full simulated day at 10, 20, 50, 100 and 500 residents. At 500 residents on the development host, a five-minute procedural step took **450 ms median** and a full day **47.3 s**; these measurements exclude language-model latency. A new town seeds at most 12 directed contacts per Sim; actual encounters may add more. Results are saved in `artifacts/living-world/social-benchmark.json`.

### Needs, feelings and goals that stay connected

**Mind** now shows current modeled feelings even before the first conversation. Hunger, thirst, toilet urgency, tiredness, loneliness and boredom produce appropriate distress, tiredness, longing or irritability; ongoing activity produces interest or concentration. Completed care produces relief, actual goal progress can produce hope or pride, and encounters retain their own time-limited emotional effects. Stress modestly increases fatigue, social and comfort needs and biases future choices toward rest. Emotional state influences the action choice together with needs, ambitions, personality and scheduled commitments.

**Tun & Vorhaben** displays the current desire, needs and three measurable daily goals. **Stats & Protokoll → Ziele & Alltag** separates these from longer-term ambitions. New backgrounds may include explicitly labeled prior-life progress; progress after the town begins requires actual completed actions or accepted encounters. Fresh daily goals say **Heute noch vor mir**, rather than suggesting an empty personality with a 0% score. Actual practice time and evidence references remain in the state and journal. Older worlds recover progress from their retained events while retaining existing values.

Both **Inner voice** and **In Ruhe sprechen**, as well as anchored Storyteller scenes, receive the Sim's current emotions, desires, thoughts, needs and existing goals. Validated responses can change feelings, modestly change social/fun/comfort needs or fatigue, and focus an existing ambition. These changes are saved in the real simulation state and displayed immediately; a conversation leaves the clock paused. Words do not satisfy hunger, thirst, bladder or hygiene, grant completed achievements or replace actual physical events. Storyteller reflections must reference an event the responding Sim really participated in or witnessed; unrelated or unsupported effects are rejected. Model-authored thoughts persist for up to 15 simulated minutes unless another authored response replaces them.

### Public buildings with real rooms

Search **Schule** in World, expand the building and open **Klassenraum A**, **Klassenraum B**, **Schulflur**, **Schulmensa**, **Lehrerzimmer**, **Schulhof** or **Toiletten**. These are connected simulation locations with room capacities, usable objects and reusable backgrounds. The school timetable includes an outdoor break and a lunch interval; urgent care takes priority. Movement inside a child's own school/daycare stays supervised. Children still use the existing supervision rules for external journeys.

The kindergarten, library, campus, town hall, clinic, fire station, café/shops and park also have additional usable sections. Sims use nearby public toilets and meal/rest facilities when available instead of always returning home. The World thumbnail budget remains unchanged.

Existing towns upgrade once on startup after saving `data/before-life-model-<timestamp>.db`. World time, residents, physical needs/actions/routes, anchors, biographies and existing events/journals remain intact. The original public-room IDs remain valid; new rooms and a documented state-model initialization entry are added. No model call is required for this migration.

The current full-day benchmark with the connected mental-state model and additional rooms is saved in `artifacts/living-world/mind-benchmark.json`: **500 Sims, 200 households, 1,078 locations**, **638 ms median** per five-minute procedural step and **59.2 seconds** for 24 simulated hours on the development host. It excludes language-model latency and includes all recorded need-urgency samples, including high values.

### Navigate without loading the whole town

The **World / Atlas** tab is the main navigation map. Collapsed neighborhoods and houses are round thumbnails; opening them reveals smaller circles inside a soft colored group boundary. A house contains its rooms, and a neighborhood contains houses and a street node. Several neighborhoods and houses can remain open at the same time. Public buildings use larger circles; the same hierarchy can contain a campus with buildings and rooms.

- A **single click selects** a circle. **Double-click** a neighborhood/house, or use its **+** badge, to open it. **Double-click a room or other real endpoint with a background** to jump straight to Play without advancing time; **Bühne öffnen** is the single-click alternative. **Anker & Hintergrund** opens its location settings; right-click is a shortcut.
- Drag the map to move around. Scroll or use **+ / −** to zoom. Zooming sufficiently out closes small expanded groups; zooming onto a large collapsed group opens it. The **−** on a group boundary closes just that group. **Übersicht** fits the open map; **Stadt** closes all groups and returns to the city overview.
- Search **Library**, **Bibliothek**, **Schule**, **Campus**, a room name or a Sim's name in **Orte & Sims finden**. Click a result to open its parent groups and center the correct place. Search understands common German/English location names.
- The **Deine Anker** sidebar shows anchored Sims and their current locations, plus anchored places. Filter it by Sims or places. Click a row to find the anchor on the map; **↗** opens its scene immediately.
- Play has a compact **anchor navigation bar** instead of a small unreadable map. Use its **← / →** buttons or the left/right arrow keys to jump between anchors without advancing simulation time. Choose **Alle Anker**, **Sims** or **Orte**. Location anchors on houses/neighborhoods open a descendant room; Sim anchors follow the Sim's current location. Keys do not navigate while a text input or a dialogue window is active. **World ↗** opens the full map.

The map projects actual routes onto visible circles. In the initial town generator a neighborhood itself is the simulated street; its expanded street circle is a presentation of that same location, rather than an additional invented road. Group boundaries express containment, while route lines express movement. The map keeps existing world IDs, anchors, memories and saved-game references intact. Very large sets of independently generated districts are bounded to 60 overview groups; search brings a district outside that overview into the current map. While inspecting a house, distant unrelated routes are hidden so they do not cross its rooms. Travelling Sims remain visible and accessible in their scene, marked as unterwegs; their real simulation location remains between places.

A graph response contains at most **180 nodes and 50 thumbnail references**. The map attaches at most **50 visible images, including the small Sim portraits**, removes image elements outside the viewport and shares that 50-image budget with open scene/picker panels. Small distant nodes hide long labels until zoomed in; focused labels remain readable. The stage displays at most 16 residents with name tags and individual colors; **Character** opens a searchable, paginated picker with 12 portraits per page. All other places continue to simulate. The API sends a bounded scene snapshot rather than every resident, every room and their complete journals. Browser caching can retain earlier decoded images, so the element budget is not a hard limit on browser process memory.

Older expanded groups close automatically when adding another group would exceed the thumbnail budget. The selected branch stays open; the group used least recently is collapsed first. Images outside the viewport are removed from the active DOM.

Actual leaf locations list up to five present Sims. If more than five are there, the preview shows four names plus **…**; click it for the full attendance overlay (40 residents per page). The most recently opened group directly above room/leaf level also shows small Sim portraits over the location thumbnails. Names and portraits open profiles. The selection sidebar has the same roster, including when zoomed out. Travellers are shown separately by the anchor list rather than counted as physically present at their last place.

**Cast → Sim-Explorer** lists all residents, including Sims without anchors, with 18 portraits per page. Combine filters for name, given name, family name, home neighborhood, age group and anchored/unanchored status. Open any card for its complete profile, needs, goals, relationships, private conversations and personal journal. The neighborhood filter means where the household lives; the card also shows the Sim's current location. World search finds names regardless of anchor status.

Each Explorer card now shows the **actual current location path** (town/neighborhood/building/room) and three separate shortcuts: **Spielen** opens that Sim's current scene, **Welt** expands and focuses the Sim's current place on the World graph, and **Beziehungen** opens that Sim as the relationship graph's center. Profile buttons offer the same shortcuts. Travellers show their start/destination and are located on the map by their last reached node; opening their scene preserves their in-transit simulation state. Navigation never advances time.

### Explore each Sim's relationships

**Mind** keeps its action toolbar immediately below the heading, above feelings and goals. **Aus ihrer Sicht**, paused conversation, profile, Stats and **Beziehungsnetz** are available without scrolling through long goals. The relationship button focuses that Sim directly and leaves the clock unchanged.

**Bande → Beziehungsnetz** works for every Sim, including unanchored residents. **Sim wählen** searches the entire population. Every connecting line carries the target’s relationship to the center, such as mother, son, grandfather, cousin, husband, colleague, classmate, friend or romantic interest. The profile uses the same labels. Family roles come from explicit parent/partner records; a tense acquaintance is labeled conflict rather than automatically becoming an enemy. Click a line label for all relationship contexts and quality values. The center has a larger round portrait; connected Sims appear as round portraits with names. Click a connected Sim to make them the new center and see their own connections. Browser Back or **← Zurück** returns to the previous focus; the center is stored in the URL so it can be bookmarked.

The right sidebar provides a searchable list of **verankerte Sims**, showing their current locations. Anchored nodes and their connections use gold accents. **Kontakte mit Anker** filters the current center's contacts while retaining the center itself. Click a relationship line to inspect its trust, closeness, tension and shared background. **Profil**, **Spielen** and **Welt** are available for the current center.

The graph shows at most eight contacts plus its center, each with age and current occupation/status below the portrait; additional contacts are paginated. The anchor list has six portraits per page, and the general Sim selector remains paginated. **✋ Verschieben** explicitly enables/disables dragging; **Escape** disables it. Pointer cancellation, focus loss and release terminate a drag. Zoom controls, the Sim selector and dialogs are outside the graph's hit area. The layout also works on mobile.

### Consistent language without extra model charges

Living World defaults to **English interface labels and English new stories**. PERMA dimensions, goals, practice time, profile status, relationship roles and help-card explanations use English in English mode. Interface translation is deterministic and does not require an API key. The optional German display remains available through the language menu.

Existing authored journals keep their original wording. Where supported, **Language → Enable local translation** can translate older German passages for display using the browser’s Translator API. This requires browser support and may download a language pack on explicit activation. It does not change saved facts, names, input values or original audio, and does not send journals to a public translation service.
Research sources: [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api) documents local translation and its browser/device limitations. [LibreTranslate](https://docs.libretranslate.com/) is a free self-hosted alternative; its hosted service requires a paid API key. Vivarium does not automatically send scene text or personal journals to a public translation service. For a future server-side fallback, self-hosting LibreTranslate would avoid per-call provider fees but still require local compute and installation.


**🎨 Sprite / Hintergrund** selects from five BM25 library candidates and displays their captions. Library portraits may be reused by many residents; their name tags and colors keep them distinct. Missing age-appropriate portraits use placeholders. Dedicated facades can be added to the library later.

Room actions appear in text even when the drawing cannot animate sitting at a desk, reading, using a shower or performing a job. Sprites show presence, rather than furniture poses or continuous walking animations.

### Backups, tests and current scope

Use **Settings → Storage & scenarios** to export, duplicate or delete a Living World town. Its ZIP includes every Living World table, personal journal and anchor audit, plus the referenced illustrations and available cutouts. Import remaps entity IDs and rebuilds the personal memory index. Keys, accounts, billing and the shared music collection are excluded from scenario exports.

```bash
npm run test:living
npm run test:living-social
npm run test:living-mind
npm run test:living-browser
npm run benchmark:living
```

The mental-state test checks need-driven feelings, actual public toilet use, evidence-based ambition and daily-goal progress, witnessed and bounded Storyteller feedback, paused conversations, clearing and idempotent migration. The engine test uses temporary databases and injected model responses; it does not call a paid provider. The benchmark runs five-minute steps and a full simulated day at 10, 20, 50, 100 and 500 residents, writing `artifacts/living-world/benchmark.json`. The browser test also checks precise Explorer place paths, direct scene/map/relationship jumps, unanchored relationship centers, neighbor refocusing, anchor filtering, a reachable chooser during pan mode, pointer/Escape handling, display-only translation/restoration and original Vivarium graphs. The browser test starts its own temporary server and database, uses a fixture model, and checks the original Stage, Mind, paused conversations, Stats, interventions, GM review cards, nested circular Atlas, simultaneous group expansion, bilingual place search, paused anchor jumps, 500-Sim image limits and mobile layout. It does not modify a running installation. The optional `scripts/review-living-real.mjs` explicitly targets a prepared demo preview and makes paid calls using that player's configured key. `scripts/review-living-mind.mjs` only inspects the current preview without changing it. `scripts/review-living-mind-real.mjs` makes paid conversation/Storyteller calls on a temporary duplicate, verifies mental feedback and unchanged physical needs, and deletes the duplicate afterwards. Its report is saved as `artifacts/living-world/mind-real-check.json`.

The [HTML implementation report](docs/living-world.html) explains the coordinator, causal checks and measured limits. This is an initial playable implementation capped at 500 residents. The Python adapter uses the actual Open Sims needs, action rules, psychology, social consent checks, affect and career progression. It does not yet reproduce its complete inventory/cooking economy, every institution or university system. Continuous real-time animation, distributed million-resident simulation and Living World rewind/replay controls remain future work. Living World now uses the original narrator/character TTS and music player. Its timeline lists completed steps; physical undo, branch replay and offline cinematic export of Living World steps remain future work. Scenes show text and still sprites, rather than walking or furniture animations.

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

### Biography response recovery

New anchors may have a pending authored biography. Missing IDs or malformed JSON receive one focused retry; incomplete batches never partially overwrite backgrounds. If this optional enrichment still fails, an otherwise valid Storyteller step and intervention can proceed with the retained background. A warning appears after the step, in its history and as an open biography in the profile. Deferred biographies are not automatically charged again each tick; use **Profil → Biografie ausarbeiten** to retry explicitly. Cancellation and failures in the actual Storyteller still roll the whole step back. `npm run test:living-biographies` covers this distinction, including the reported provider error with working inner chat.

### Social warmth, romantic affection and age boundaries

**Soziale Wärme** (`needs.social`) is a 0–1 unmet need for friendship, belonging, family care and ordinary social contact. It is separate from **Romantische Zuneigung** (`needs.romantic_affection`). Friendly smalltalk does not automatically satisfy romantic affection.

The romantic need is **always 0 below age 14**, **0–0.35 at ages 14–17**, and **0–1 at ages 18+**. Teens may only have harmless romantic conversations and public dates with another 14–17-year-old **at most one year apart**. These use separate `teen_romantic_talk` and `teen_date` categories. **Sexual acts, erotic thoughts, sexualized narration and adult/minor romance are forbidden for everyone under 18**, regardless of a need value, model suggestion, Stats edit or successful skill check. Known relatives are excluded from romance.

For adults, values above **0.65** can produce adult desire and weight permitted approaches; above **0.75** they can motivate a private consensual moment. Intensity never grants consent. Private adult intimacy requires two unrelated 18+ partners, their own willingness and a private bedroom with no other occupants. Its presentation stays non-explicit. Eifersucht is an uncertain subjective interpretation, not proof of another person's intentions or a right to control them.

The policy is centralized in `config/living_social_policy.json`, enforced in the JS state/Stats/reflection paths and the Python interaction adapter, and explicitly included in model instructions. Clearly sexualized model responses in minor contexts are rejected before persistence; this additional prose filter is not a semantic guarantee for arbitrary unrestricted model language. The structural allowed-category and age checks remain authoritative. Startup adds the new need to existing worlds after a database backup, preserving social warmth, factual journals, biographies, locations and simulation time. The world version increments to invalidate stale requests. `npm run test:living-romance` covers 500 age/category combinations plus caps, known relatives, private-room occupancy and migration.

### Detailed social / Theory-of-Mind / W100 proposal

Read [the standalone German HTML proposal](docs/living-world-social-tom-plan.html): overview, bounded probabilistic expectations, third-party awareness, duties, sessions, thought templates, existing W100 formula, Storyteller handoff, memory and scaling, rollout and acceptance tests. The appendix contains **600 fully documented examples in six catalogs of 100**, with trigger conditions, descriptions, outcomes, effects, both perspectives, witnesses, checks and linked constructive counterparts. It includes search, pagination, an expectation demo, a W100 calculator and JSON export. [The taxonomy JSON](docs/living-world-social-taxonomy.json) is also available separately. Rebuild both using `python3 scripts/build-social-tom-plan.py`.

The taxonomy is the original design catalog. This branch now implements guarded duties, contextual social topics, private probabilistic expectations and W100 checks through the modules in `server/living/expanded/`. Catalog examples describe possible situations, not evidence that those situations have happened. See [the implementation report](docs/living-world-expanded.html) for the precise operators and limits.

### Individual wellbeing: PERMA-inspired game scores

Every Living-World Sim now has five **0–100** wellbeing indicators: **Positive Gefühle (P), Engagement (E), Beziehungen (R), Sinn & Zugehörigkeit (M), Erlebtes Gelingen (A)**. Open a Sim's **Profile** to see the bars and recent own experience sources; the **Mind** window includes the same scores in its wellbeing section. Higher wellbeing is favorable; higher needs still mean more urgency. The mean is only an orientation, not a replacement for the five areas.

Completed activities, actual ambition progress and final validated encounters affect the appropriate pillars. Interests personalize engagement; support and conflict affect relationships. Current feelings and urgent bodily needs affect P. Storyteller and paused conversations receive own scores as read-only context and can contribute bounded subjective emotional responses; they cannot invent accomplishments or set wellbeing numbers. Money, possessions, romance and sexual activity are not requirements or automatic happiness bonuses. All age and consent boundaries remain authoritative.

This is a **fictional heuristic inspired by Seligman**, not the validated PERMA-Profiler or a psychological diagnosis. This branch retains 128 recent detailed contributing sources per Sim and up to 365 days of compact older contributions, caps daily effects and uses different illustrative decay rates. Older contributions still affect scores through the daily archive; the complete personal event history remains on disk. Startup backs up and initializes older worlds from their current state without inventing past happy experiences. Clear a paused conversation to remove its sources while preserving later actual activity; exports/duplicates preserve and remap source IDs. See [the detailed PERMA rules and limits](docs/living-world-social-tom-plan.html#wellbeing); run `npm run test:living-wellbeing` for the isolated functional checks. The integrated expansion is described below.

### Economy, housing and civic expansion

The [same HTML proposal](docs/living-world-social-tom-plan.html#economy) now includes a connected euro economy: personal and household accounts, exact cent transfers, earned versus paid wages, fictional German-inspired tax/social-insurance rules, property ownership/rentals, housing search and support, food stocks, subscriptions, inventory, funded loans, local businesses and separately financed public services. It connects material security, ambitions, skills, preferences, reputation and limited personal knowledge to the existing simulation and UI. The plan includes adult-only abstract crime/addiction/support paths, source-based news, staged migration and acceptance criteria, **32 activity offers, 28 special items and 100 additional case designs**. Existing youth/consent boundaries remain mandatory.

An interactive household-budget example and profile layout show the intended UI without changing the live world. [The economy design JSON](docs/living-world-economy-design.json) includes the fictional policy and catalogs. Prices, thresholds, distributions and tax bands are design parameters, not current German legal/tax rates. Economy gameplay is implemented on `living-world-expanded`; the plan remains the historical design reference. The implemented policy values live in `server/living/expanded/catalog.js`, and the UI is under **City / Stadtleben**. Rebuild with `python3 scripts/build-social-tom-plan.py`; review the served HTML using `node scripts/review-social-plan.mjs` (Playwright Chromium required, `LIVING_REVIEW_URL` overrides the default local port 8891).


## Expanded town life: practical usage

This branch adds the connected economy, individual capabilities, private Theory of Mind and PERMA history to the existing Living World. [The standalone German implementation report](docs/living-world-expanded.html) contains the exact rules, module map, active job/activity/item/duty catalogs, verification and measured limits. The original design HTML remains a historical catalog, rather than a claim that every example is a separate physical mechanic.

### Start small and keep your current world

Create a new **Living World town** from Home, initially with 10 or 20 residents. The existing Stage/Play, Mind, Bonds, World and Sim Explorer remain the main navigation. Any Sim can be anchored; any actual location can also be anchored. Residents present in an anchored location, or in actual contact with an anchored resident, join the relevant narrated field. Unanchored residents still keep their needs, goals, personal histories, resources and relationships.

Disable Storyteller to advance purely procedurally without provider calls. Enable it when you want important encounters narrated through your own provider. All economic operations remain validated code rules; a model cannot invent money, grant a credential, teleport a resident or replace consent with a successful roll.

On first opening an older Living World save, the expansion backs up the database and adds missing current resources/structures. Subsequent rule upgrades preserve money, world time and lived history. Initial resources and aptitude are explicitly marked as initial state, rather than fabricated previous experiences. For an independently managed test install, use a separate checkout and `VIV_DATA_DIR`, with its own `PORT`.

### City / Stadtleben

The new dock item opens eight connected sections for the selected resident:

| Section | Usage |
|---|---|
| **Mein Alltag** | Inspect skills, attributes and W100, needs, goals and PERMA; manage agreed duties and personally experienced cases. Money has its own dedicated tab. |
| **Finanzen** | View the previous calendar month or current month so far, choose personal/joint/combined accounts, inspect categorized actual income and spending and paginated individual postings. See gross-to-net deductions without double counting, separate transfers/deposits/loans, next-month costs, expected income and a monthly reserve plan. Pay open invoices and inspect financing. |
| **Arbeit & Bildung** | Immediately see work, school, study, unemployment, retirement or agreed care; inspect the current employer, hours and expected gross/net salary, career ambitions, education institutions, dates, fields, completed qualifications and results. See family care, professional support and holiday-work permissions. |
| **Stellenbörse** | Change the selected Sim's minimum expected monthly net income and commute limit. Inspect why a vacancy is eligible or blocked, then apply. Actual unemployed Sims also search during simulated daytime. |
| **Wohnungsbörse** | Compare a maximum of five suitable vacant homes. Renting requires an application with an uncertain, documented W100 decision and the real deposit after acceptance; buying requires real funds or an affordable funded mortgage and explicit consent. A move creates a contract and then actual movement, rather than teleporting. |
| **Freizeit & Besitz** | Plan reachable free or paid activities, purchase special items, inspect actual possession and show it publicly. Memberships incur real renewed costs and can be cancelled. Owning an item does not claim you have already used it. |
| **Soziale Sicht** | Search recent contacts by name or known relationship. Each card separates an actual observed encounter, a tentative interpretation, alternative explanations, the Sim's own wishes and current needs, possible impressions on the other person, unknowns, and a suggested respectful next step. Own sources and hypothesis weights are expandable; Profile, Bonds and Scene links open that contact. |
| **Rundblick & Rathaus** | Read canonical local news, inspect separately funded institutions, contribute voluntarily and request a funded public festival. Optional AI commentary is labelled separately and does not replace the source facts. |

Stadtleben has its own scrollable screen: use the mouse wheel, touch swipes or Page Up/Down; Ctrl+End reaches the bottom and **↑ Nach oben** returns to the beginning. The Sim picker and eight section tabs stay visible below the global toolbar. On small screens, select a section with **Bereich**. Each section remembers its scroll position while the screen is open; Left/Right/Home/End navigate the desktop tabs. **Welt** and **Beziehungen** go directly to the selected resident.

The selected Sim picker includes unanchored residents. **▶ Szene** jumps to their actual Play location. **Profil → Finanzen, Bildung & Fertigkeiten** opens the same household/capability view; the Mind action bar also links to **Soziale Sicht**. The circular World viewer adds a named public quarter, **Marktbogen**, connected through its actual street and rooms.

**Bedürfnisse und Attribute sofort finden:** „Mein Alltag“ beginnt mit zwei offenen Karten. Ein einzelner Klick auf einen Sim in Play öffnet dieselben Werte direkt oberhalb der Gedankenansicht. Im Profil stehen sie vor der Biografie; die obere Leiste führt zu Szene, Gespräch, Mind, Welt, Beziehungen und weiteren Lebensbereichen. Die zweite Leiste springt zu Bedürfnissen/Attributen, PERMA, Biografie und Protokoll. Hunger, Durst, Blase/Toilette, Müdigkeit, Hygiene, soziale Wärme, Abwechslung, Komfort und romantische Zuneigung sind getrennt sichtbar. 0 % bedeutet versorgt, 100 % dringend; ab 65 % wird der Balken warm gefärbt, ab 85 % deutlich hervorgehoben. Attribute verwenden eine eigene Skala von 0–100. Die bestehenden Altersgrenzen für romantische Zuneigung bleiben verbindlich.

Die **i-Erklärkarten** ergänzen Begriffe durch Denkanstöße und konkrete fiktive Situationen: Welche verletzte Erwartung könnte hinter Ärger stehen? Welche Ressource fehlt einer erschöpften pflegenden Person? Was unterscheidet Vermögen von verfügbarer Liquidität? Die Beispiele sind mögliche Deutungen, keine Behauptungen über die aktuelle Figur. Beobachtung, Vermutung und Handlung bleiben getrennt. Tastatur, Escape und Fokus-Rückkehr funktionieren weiterhin; PERMA und Fachbegriffe haben verlinkte Hintergrundquellen.

### Vorlesen und Ortsmusik in Play

**Auto** neben den Zeitsteuerungen übernimmt dieselbe gespeicherte Einstellung wie Settings → automatisches Vorlesen. Nach einem abgeschlossenen Living-World-Zeitschritt startet die aktuelle Szene mit Erzähler und Sim-Stimmen in Satzreihenfolge. **↻ Vorlesen** beendet gegebenenfalls die laufende Wiedergabe und liest die Szene von Anfang an erneut; **⏸** pausiert, **▶/⏹** startet beziehungsweise beendet. Einzelne Sätze bleiben anklickbar. Eine normale Navigation startet keinen neuen automatischen Vortrag. Vorbereitendes Generieren und automatisches Abspielen bleiben getrennte Einstellungen.

Beim ersten Besuch eines Raums wählt die vorhandene BM25-Musiksuche einen passenden instrumentalen Titel anhand eines zweckbezogenen Standard-Queries: etwa ruhiges Klavier im Schlafzimmer, konzentrierte Musik zum Lernen oder lebhafte Akustik am Markt. Query, Titel und Kandidaten werden je Location gespeichert, einschließlich ZIP-Export und Duplikation. Derselbe Ort behält die Auswahl auch nach Neuladen und weiteren Ticks; gleichzeitig lädt der Player nur den aktuellen Titel. Die Auswahl erfolgt auch bei ausgeschaltetem Ton, sodass Einschalten dieselbe Ortsmusik verwendet.

Über **🎶** ist das aktuelle Query sichtbar und veränderbar: suchen, Kandidaten anhören und einen Treffer auswählen. Der Storyteller darf bei einer tatsächlichen Stimmungsänderung optional ein neues Query für einen gerade von seinen Sims belegten Raum vorschlagen; die Auswahl wird erst mit dem gültigen Tick gespeichert. Eine fehlgeschlagene Suche erhält die vorhandene Musik. Neuere manuelle Entscheidungen gewinnen gegen spät eintreffende Suchergebnisse. Die Musikauswahl verändert weder Sim-Zustände noch die Simulationszeit oder Versionsnummer; sie erzeugt selbst keine bezahlten Modellaufrufe.

Social explanations distinguish who initiated a bid, an accepted conversation from completed help, a refusal from general rejection, and a witness from a participant. Phone contacts do not claim visible expressions or knowledge of the other room. Family, school, colleague/known manager and partner contexts shape the wording; apology, boundary-setting, confidences, teasing and gossip each have their own interpretation. Hunger, fatigue, stress, personal money worries and known relationship tension can colour the Sim's own perception, without being evidence about somebody else's intentions. Reading an older save refreshes the wording without changing its money, time, source memories or learned probabilities. These are bounded procedural hypotheses, not access to another person's private mind. Suggested next steps are not automatically executed actions. All existing minor/consent protections apply to this text layer too.

### Work, reputation and family money

Vacancies require adequate practical skill, a required existing credential, suitable expected income and a reachable commute. A current negative impression held by that specific employer or strong publicly verified negative reliability can block hiring. Another Sim's secret opinion or unverified gossip does not. Only work actually completed at the workplace creates earned wages; payment additionally needs the employer's funds. Unpaid wages remain claims. Training develops ability, without magically issuing professional certificates.

For ages 15–17, a parent can enable safe holiday work in **Arbeit & Bildung**. It is limited to the game's holiday calendar, weekdays, four hours daily and 20 days annually. The birthday transition ends that youth contract without deleting earned wage claims. Parents caring for children under three can receive a separately approved, funded care benefit instead of a fictitious simultaneous full-time wage.

Each child has their own savings/pocket money. Households show agreed shared resources and projected obligations, while individual savings remain separate. A voluntary household merger needs all adults' consent, reciprocal trust and enough space. Food is stocked, carried or purchased with actual money; if unaffordable, a reachable and funded community kitchen remains available. A poor Sim no longer waits endlessly at an empty public refrigerator.

Rent, utilities, subscriptions and loan installments fall due on actual simulation dates. Monthly membership renewal is based on 30 elapsed days. Partial payments pay interest only once. Restricted deposits are separate from spendable cash. Former homes become available only after actual vacancy; paid unused rent can create a funded prorated refund or an outstanding refund claim.

### Monthly finances, education and care

**Finanzen → Monatsrückblick** defaults to the previous calendar month. If the simulation started after that month, the view explicitly reports no saved history; it does not invent earlier wages or expenses. Account legs are summed once per transaction. A transfer from personal to joint funds cancels in the combined view. Loans, initial wealth and restricted deposits remain separate from earned income and consumption. Up to 60 individual entries are loaded per page; category totals cover the entire recorded month. Gross, tax and employee insurance explain the net salary already counted as income, rather than deducting it again.

**Nächster Monat** lists rent, estimated utilities/heating, food, agreed loan payments, memberships and care copayments. Expected wages depend on actual work and funded payroll. The forecast includes existing unpaid obligations and a configurable monthly reserve plan. Planning a reserve does not debit money or create a duplicate savings account. The target buffer is a fictional game rule: two months of costs, at least €500. Personal budget reviews generate sourced worry, doubt or relief and small PERMA changes; money alone creates neither meaning nor a person's worth. Private account balances and undisclosed income of other household members stay excluded from the selected Sim's perspective.

**Arbeit & Bildung** separates procedural starting biography from subsequently observed education. Each stage records institution, town, subject, dates, enrollment/completion, qualification and result. Kindergarten has no school grade. Newly simulated school completion requires recorded learning; higher education/training additionally needs 200 observed hours and 60 attendance days. Passing time alone awards no diploma. A degree does not automatically issue a medical or public-service license. New towns include young adult university students; an ongoing later course is distinguished from an already completed first degree. Current activity status is also visible in the Sim Explorer, profile and City toolbar.

Some procedural older residents receive an individualized, agreed support plan; age alone does not declare everybody dependent. **Seniorenhaus Lindenblick** has connected real rooms on the existing World graph. Other older residents receive home care from adult family members. A family visit needs actual shared presence and time, trains care skills, supplies only available food, affects fatigue and gives both Sims sourced relationship/PERMA experiences. Professional care is explicitly a funded external service outside the active Sim population, with a real delivered meal, an insurance payment and a separate copayment invoice. Calendar-month accrual does not overcharge a 31-day month. Residential care uses a separate one-person economic household, preserving the home and funds of the remaining family; personal food extras have their own budget. The simulation does not fabricate unseen staff-Sim wages. Support levels and monthly amounts are fictional, not official German Pflegegrade. Vacated homes and deposits are released only after actual departure; a partner remaining in the family home retains that home.

### Applications and explanations

A fulfilled minimum requirement is a chance to apply, not guaranteed acceptance. Job selection considers practical skill above the minimum, a matching completed educational stage, documented employer-specific experience and available slots. Employers never read private bank balances, secret opinions or ethnicity. Housing selection considers disclosed income, actual deposit resources, a buffer, known reliability and existing obligations. Both decisions record their factors, estimated chance, W100 result and reason; an unsuccessful application leaves the current contract, home and cash unchanged. Reapplying to the same offer is locked for seven simulated days, preventing repeated-click rerolls. Protected emergency housing remains an assistance process. Cash purchases and mortgages keep their separate funding/consent checks.

Small **i** buttons explain PERMA's five dimensions, feelings and intensity, needs, self-efficacy, skills/attributes, goals, social interpretations, gross/net pay, social and health insurance, cold/warm rent, deposits, credit, liquidity, forecasts, care and applications. Explanations open in a keyboard-accessible overlay; Escape closes it and returns focus. Real-world explanations link to primary sources, including [Penn's PERMA theory](https://ppc.sas.upenn.edu/node/708), [APA on self-efficacy](https://dictionary.apa.org/self-efficacy), [BMG on health insurance](https://www.bundesgesundheitsministerium.de/gkv/seite), [BMG on care insurance](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung), and [bpb on rental costs](https://www.bpb.de/kurz-knapp/zahlen-und-fakten/sozialbericht-2024/553255/mieten-und-wohnkosten/). The game distinguishes those definitions from its simplified fictional policy.

### Happiness, expectations and sources

PERMA-inspired **P, E, R, M, A** scores measure five fictional wellbeing dimensions. Own feelings, actual engagement, accepted contact, care, purpose and real progress contribute separately; wealth is not an automatic happiness bonus. The view shows recent contributing sources. Up to 128 recent detailed sources and 365 days of compact historical contributions remain effective; full personal history remains on disk. Clearing a paused conversation removes its own contributions while preserving subsequent real activity. These values are game heuristics, not a validated questionnaire or diagnosis.

Theory of Mind tracks at most 24 contacts, three topics per contact and eight evidence references per topic. Normalized alternatives always leave room for uncertainty. Private finances, diagnoses and thoughts do not become general shared knowledge. The player can inspect profiles, but model agents receive only the selected Sim's permitted personal context.

**Social warmth** and **romantic affection** are separate. Under 14, romantic affection is always zero. Ages 14–17 are capped at 0.35, with only harmless nonsexual dates/conversation between two teens no more than one year apart. Sexual acts, erotic thoughts and sexualized narration involving anyone under 18 are prohibited, including model responses and imported saves. Higher adult romance values never replace independent consent. Optional abstract adult risk/private service roles are 18+ only; private service roles default to off and never narrate intimate details.

### Save, verify and understand the limits

**Settings → Storage** still exports, duplicates and deletes scenarios and assets. Living World ZIPs include all economic accounts, ledger legs, contracts, duties, sources and private views with remapped IDs. They exclude login-account passwords and provider keys. Shared music can be reused without copying roughly 14 GB: set `MUSIC_DATA_DIR` to the existing library, `MUSIC_API_URL` to its server, `MUSIC_AUTOSTART=0` and `MUSIC_READ_ONLY=1` in the second install. That copy displays shared storage and supports export, while refusing music deletion/reindexing.

```bash
npm run test:location-music               # isolated persistence, race, storyteller and export checks
npm run test:expanded-regressions          # all isolated suites; optional music if MUSIC_DATA_DIR exists
npm run test:expanded
npm run test:expanded-semantics
npm run test:finance-care                  # isolated ledger, applications, education, care and 500-Sim tick
node scripts/test-finance-care-browser.mjs # isolated real browser, desktop + mobile, no provider calls
npm run test:expanded-lifecycle
npm run test:living
npm run test:living-mind
npm run test:living-social
npm run test:living-romance
npm run test:living-wellbeing
npm run test:providers
npm run test:storage
npm run benchmark:expanded
LIVING_REVIEW_URL=http://localhost:8890 npm run review:expanded
```

Browser review requires Playwright Chromium (`npx playwright install chromium`, plus the platform dependencies) and a running demo install with `demo@vivarium.local / alice-and-bob`; it creates and removes its own fixture. Core/semantic/lifecycle tests use temporary databases and make no paid provider calls. The music test requires the downloaded library (`MUSIC_DATA_DIR=/path/to/music-library npm run test:music`). Real-provider review is a separate deliberate check and uses actual provider billing.

The recorded load test covers **10, 20, 50, 100 and 500 Sims for a complete simulated day**, with balanced financial ledgers. The 500-Sim five-minute tick had a median around **1.03 seconds**, and the full day took **131 seconds**, without model latency. The cumulative test process used about **1.1 GiB RSS** and its cumulative SQLite file roughly **500 MiB**, largely due to detailed durable history. Creation supports up to 2,000 Sims; the above measurements concern the earlier 500-Sim benchmark and are not a claim of million-resident scalability. Browser graph images remain capped at 50 visible thumbnails including Sim previews; CPU text simulation does not load all resident portraits.

All economy rates, tax brackets and legal/administrative timelines are fictional game parameters. Physical Living World undo/replay, continuous walking animations, distributed processing, full legal proceedings and detailed divorce/custody are not exposed as finished features. The 100 duties use nine safe operator families; 600 social catalog entries provide guarded contexts and expectation variants, rather than 600 independent physical simulations. See the implementation report for the precise boundary between implemented behavior and later engine work.


### Social attributes and connected character views

Open a Sim in **Play → Mind** or **Cast → Profile → Attributes** to see attractiveness (adult appearance), reputation, popularity among known contacts, public recognition and ambition alongside the existing capabilities. The same scores appear under **Town life → Personality & reputation**. Its breakdown shows appearance preferences, attraction toward compatible adult contacts, current social drives, Big Five, shared goals and the Sim’s uncertain interpretation of encounters. The character-section buttons keep the selected Sim when moving between needs/attributes, personality/reputation, finances and work/education. Finances opens directly rather than adding another resource popup.

- **Reputation** averages known helpfulness and reliability. With no evidence, 50 is an uncertain starting prior, not a verified achievement. Public recognition counts favorable public reports; possessions and bank balance remain separate. The sources panel identifies documented and unverified reports.
- **Popularity** reports the proportion of incoming contacts with closeness at least 50%, trust at least 45% and tension below 50%. It always shows the size of that network. No contacts means unscored.
- **Attractiveness** is an adult appearance attribute. Attraction is observer-specific and also uses warmth, reliability, competence, status and shared interests. Individual preference distributions overlap widely; small gender-associated offsets are explicit fictional design settings, not claims about every man or woman. No adult attractiveness or sexual-desire score is assigned to minors. Existing age, kinship, privacy and consent restrictions remain authoritative.
- **Drives** change eligible social-action weights: connection favors approaches, achievement favors advice and collaboration, recognition favors sharing accomplishments and approaching publicly known people, and rivalry can favor challenges or undermining. Strong attraction and observed reputation now contribute more strongly to these weights. A favorable reputation cannot replace professional qualifications or independent consent.

New Bennington households use a **10% same-sex starting-couple probability**, rather than drawing both partners’ genders independently. This is a scenario setting requested for this game, not a demographic estimate. Adult Sims have consistent individual partner preferences; future relationships still need compatible preferences and reciprocal relationship development. Existing played marriages and identities are preserved.

Bennington’s occupation sampler includes **76 weighted occupations**, plus existing civic/status roles. Health and care, education, retail, manufacturing/trades, hospitality, office work, creative work and public services have different frequencies and appropriate minimum starting ages. Jobs are real contracts with skill requirements, workplaces and job-board listings. Degree-requiring roles use the same qualification gate for applications; initialized credentials are background, while new study requires recorded time. The weights are game assumptions informed by the [Vermont DOL Bennington County profile](https://www.vtlmi.info/profile2024.pdf), not an exact census or real wage schedule. Existing careers are not silently rewritten after play begins.

New starting outlooks include differing priorities within couples, divided loyalties, recognition rivalry, financial worry, boundary tensions and contented lives. Initial concerns are marked as background, not invented witnessed events. The storyteller follows the actual current state and can leave disagreement unresolved instead of automatically producing reconciliation and gratitude.

Validation: `npm run test:portraits-map` checks a 1,000-Sim fixture (77 actual professions, 41 same-sex couples among 346 couples for seed 73), real job contracts and qualifications, varied starting outlooks, adult attraction/reputation effects and all neighborhood expansions. `npm run test:portraits-map-browser` checks the actual stage, English dynamic labels, character-section links, social attributes, relationship metadata, image loading and mobile layouts. `npm run test:living-romance` checks age/consent boundaries plus adult partner-preference rejection. These are game checks, not clinical or demographic validation.
