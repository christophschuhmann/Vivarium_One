# Vivarium · First-Person RPG

Play one character inside an illustrated, voiced story. Talk, explore and make consequential decisions yourself. The Game Master narrates the people and events relevant to your scene; there is **no procedural town ticking** in this deployment.

This branch restores the original first-person game on the current provider, audio, storage and image-library infrastructure. Living World remains preserved in the `living-world-expanded` branch and the `backup/living-world-before-rpg-2026-11-07` tag. Its previous documentation is in [docs/README-living-world.md](docs/README-living-world.md).

## Install

Use Node 22+, Python 3, Git, FFmpeg, zip and unzip. On Debian/Ubuntu:

```bash
sudo apt install git python3 python3-venv ffmpeg zip unzip
git clone --branch first-person-rpg --recurse-submodules https://github.com/christophschuhmann/Vivarium_One.git
cd Vivarium_One
npm run setup -- --with-assets
npm start
```

Open **http://localhost:8890**. Setup prints the local player login and initial password. There is no admin step and no need to purchase Vivarium credits. To specify your own initial login, set `VIV_PLAYER_EMAIL` and `VIV_PLAYER_PASSWORD` before setup. Existing accounts are preserved on repeat setup.

`--with-assets` downloads and indexes the public anime libraries. Allow substantial download/disk space (the installed snapshot uses about 15 GB, plus extracted image caches). You can omit this flag and upload your own images instead, or run `npm run assets:sync` later. An existing library can be reused by setting `VIV_ASSET_LIBRARY=/absolute/path/to/hf-asset-library` in `.env`. New images can also be generated after explicit confirmation. The first character extraction is slower than subsequent uses because transparent expressions are cached.

For optional local music, run `npm run setup -- --with-music` or `npm run music:setup`. The music library is another substantial download. The game works without it. `MUSIC_API_URL` can point to an existing music service.

## Connect OpenRouter

1. Sign in and open the account button at the top right, then **AI & models**.
2. Select **My own providers**, enter your **OpenRouter** key and choose **Save my settings**. One key is enough; HyprLab is optional.
3. Pick models separately for language, images, speech and transcription. The live catalog is grouped alphabetically by model author (Anthropic, DeepSeek, Google, etc.); search accepts model names, IDs and authors. New OpenRouter setups default to **DeepSeek V4.1 Flash 1017** for story and Gemini 3.8 Flash TTS for voices. Existing saved model choices are preserved.
4. Text, speech and transcription requests are billed by your provider. Existing library images are reused locally. Optional new images use the selected image model only after you confirm generation.

Personal keys are encrypted at rest and are never returned to the browser. Keep `.env`, runtime databases and the encryption secret out of public repositories. To expose a local installation remotely, configure `VIV_HOST` and a reverse proxy appropriate to your host; the default binds to localhost.

After selecting a model, expand **Hosting provider**. This lists the actual OpenRouter endpoints that serve that model, grouped by host. The model author and host can differ: DeepSeek creates the model, while Baseten can run it. Each endpoint shows its price, context size, precision, availability and recent speed when OpenRouter publishes those metrics. Missing metrics say **Not reported**, never zero. Catalog prices are starting prices; the selected host's prices can be higher.

The default DeepSeek route prefers **`baseten/fast`**, with fallback enabled and other hosts ranked by generation throughput. **Automatic** removes the preferred host; choose fastest generation, quickest first token, lowest price or OpenRouter's balanced routing. Uncheck the fallback box to require one endpoint strictly; rate limits or outages then fail rather than moving elsewhere. An endpoint is specific to a model, so switching models resets the host choice. **Refresh hosts** reloads the selected model's live endpoints; **Save my settings** persists all choices. These controls also appear in the operator console and apply to language, images, speech and transcription separately.

## Create a story

Open **World Wizard** and describe the character you want to play, the setting and the tone. The assistant builds a plan with a named player character, supporting cast, connected places, relationships and optional opening scenes. Refine the plan in conversation.

Choose **Review images & build**. The review shows a suggested portrait for every character and a background for every location. **Choose image** lets you search the library, filter character age/gender/heritage, upload a PNG/JPEG/WebP, or request a newly generated image. Generation has its own confirmation because it sends a request to your provider and can cost money. Confirming the story plan alone never grants image-generation permission.

Library portraits begin neutral. Available expression variants are imported from the **same character identity and style**, so sadness or anger changes the expression without swapping people. Automatic matching respects the source age ranges and ranks nearby ages; library annotations are not a guarantee of a portrait's perceived age. Review the suggestions and change any that do not fit. Background ranking considers setting type, era, region and season, while manual choices remain available.

Uploaded characters work best as full-body images on a flat green background or with existing transparency. The game creates a transparent cutout for the stage. Uploaded backgrounds should be wide images. Each file is limited to 10 MB and is decoded before acceptance.

The **Cast** screen adds and edits individual characters; **World** manages places and their connections. These use the same image picker. Storyteller proposals for a new character, place or look reuse existing assets by default. The storyteller cannot authorize a paid image call.

[config/rpg-starter.json](config/rpg-starter.json) contains a complete example: *The Letter at Closing Time*, a small-town mystery with four adults, four connected settings and a player-controlled journalist.

## Play

- **You are** identifies your player character; **Inner voice** opens their thoughts and conversation panel.
- Write what you do or say in the action box, or use the microphone. Recording offers **Cancel**, **Transcribe**, or **Transcribe & send**.
- **Continue** narrates the next beat. The storyteller chooses a suitable short interval and pauses at consequential choices. You are not asked to manage a whole town.
- Time-skip chips ask for longer intervals. Optional cinematic time skips can produce several replayable scenes, with decision stops; those use more story calls than a single ordinary beat. Adjust time-skip playback in settings.
- Only people present, arriving, or directly contacting you are updated for a beat. Off-screen records remain continuity information until they matter to the story. There are no minute-by-minute procedural Sims in this version.
- Scene narration stays within your character's perspective. Other characters' private thoughts are hidden in ordinary play. Optional **Director mode** in settings opens the existing authoring/debug perspective; it is separate from a server administrator account.
- **Cast**, **Bonds** and **World** keep the original profile, relationship graph and map navigation. The stage stays with the player character rather than silently changing protagonists.
- Enable **Auto** for spoken scene playback; **Replay voice** starts the whole scene again. Voices use the selected OpenRouter speech model. Gemini speech is requested as PCM and wrapped in a browser-playable WAV container.
- Use timeline/history to revisit scenes, undo, replay and create alternative branches. Your player identity and decision prompts survive save/export/import and duplication.

## Keep and manage your stories

Account → **Storage** shows project, owned-image, shared-library and music storage. Export a story as ZIP before experimenting, duplicate it for another path, or delete your own unwanted projects/assets. Story exports include the images used by that story, not the entire public library. They do not include your provider keys.

Runtime state is under `data/` by default; `VIV_DATA_DIR` selects another directory. Keep deployments in separate folders with separate databases. A Living World save should be restored in the preserved Living World version, not imported into this scene-driven RPG.

The deployment migration stores its runtime backup as an encrypted release in a private GitHub backup repository. Its recovery-key JSON is kept separately on the original server. To restore such an archive without extracting or overwriting a running game:

```bash
python3 -m pip install cryptography
python3 scripts/restore-runtime-backup.py --archive runtime.tar.gcm --key /secure/recovery-key.json --output runtime.tar.gz
```

Inspect `RESTORE.json` inside the authenticated archive and stop the target server before restoring its database. Public image/music caches can be recovered from the saved catalogs and source metadata; source code is preserved by Git branches/tags.

## Validation

```bash
npm run test:rpg
npm run test:providers
```

The RPG regression suite checks age-safe casting, same-identity expression variants, missing-consent rejection, zero image calls during library builds, a single ordinary story call, untouched off-screen state, decision stops, asset permissions and portable saves. The provider suite checks personal-key routing, isolation, catalog validation and all four modalities with stubbed provider requests.

The browser smoke suite is opt-in against a running disposable/test installation (see its environment variables). It verifies the library, scenario image review, generation confirmation, profiles, playback controls and mobile layout. No new paid images are generated by these tests.

## Image sources

- [Anime backgrounds](https://huggingface.co/datasets/laion/Anim-E-Ghibli-Backgrounds-FLUX-9B)
- [Greenscreen character library](https://huggingface.co/datasets/laion/Vivarium-Greenscreen-Characters-FLUX-9B)

Source repositories, revisions and captions accompany imported assets. Consult each source's license before redistributing images. Search uses SQLite FTS5/BM25 and metadata filters; there is no additional embedding service to configure.
