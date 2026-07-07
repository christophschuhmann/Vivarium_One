# Vivarium — full data & game-state backup

A complete snapshot of the runtime data that is normally gitignored:
- `data/vivarium.db`  — the SQLite database (all users, worlds, ticks, branches, credits, settings)
- `data/assets/`      — every generated image & audio asset
- `data/templates/`   — the Open Intellect signup template
- `data/tts_experiment/` — narrator TTS experiment data

It is one `tar` archive split into 95 MiB chunks (`viv-data.tar.part00.bin` …) to stay under
GitHub's 100 MB per-file limit. Snapshot taken: 2026-07-07 11:26 UTC.

## Restore
```sh
cat viv-data.tar.part*.bin > viv-data.tar
# integrity check (optional):
echo "$(cat SHA256.txt)  viv-data.tar" | sha256sum -c
# extract into the app's data dir (stop the server first):
tar xf viv-data.tar -C /path/to/vivarium/data/
```
This restores `data/vivarium.db`, `data/assets/`, `data/templates/` and `data/tts_experiment/`.
The reconstructed archive's SHA256 is in `SHA256.txt`.
