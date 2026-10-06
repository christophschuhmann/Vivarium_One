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

The `living-world` branch runs the Living World simulation inside the **original Vivarium stage and studio**. The stage, thought bubbles, narrator/character voices, private inner-voice dialogue, interventions, Game Master chat and scene music use the familiar interface. There is no player/NPC split: every resident is a Sim with goals, needs, relationships and a personal journal. An anchor changes how that Sim is narrated, while preserving their identity and history.

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

**Bande → Beziehungsnetz** works for every Sim, including unanchored residents. **Sim wählen** searches the entire population. The center has a larger round portrait; connected Sims appear as round portraits with names. Click a connected Sim to make them the new center and see their own connections. Browser Back or **← Zurück** returns to the previous focus; the center is stored in the URL so it can be bookmarked.

The right sidebar provides a searchable list of **verankerte Sims**, showing their current locations. Anchored nodes and their connections use gold accents. **Kontakte mit Anker** filters the current center's contacts while retaining the center itself. Click a relationship line to inspect its trust, closeness, tension and shared background. **Profil**, **Spielen** and **Welt** are available for the current center.

The graph shows at most 24 contacts plus its center; additional contacts are paginated. The anchor list has six portraits per page, and the general Sim selector remains paginated. **✋ Verschieben** explicitly enables/disables dragging; **Escape** disables it. Pointer cancellation, focus loss and release terminate a drag. Zoom controls, the Sim selector and dialogs are outside the graph's hit area. The layout also works on mobile.

### Consistent language without extra model charges

Living World uses **German originals and German UI labels by default**, independently of a legacy English setting used by classic scenarios. New Living World conversations remain German so the saved history stays consistent.

Click **🌐 DE → English · lokale Übersetzung** for an optional English display layer. It uses the browser's built-in Translator API, translates the currently displayed text, and caches up to 1,000 snippets in memory. Names, input values, identifiers and simulation records are preserved. Switching back restores the German originals. There are no provider/API charges; originals and audio remain German. The first activation may download a language pack. This feature depends on browser support, primarily desktop Chrome; unsupported browsers keep German and show a clear explanation. A browser-local translator fixture validates translation and restoration; actual language-pack availability depends on the user's browser.

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
