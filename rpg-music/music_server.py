#!/usr/bin/env python3
"""Vivarium music server — the dataset's stock rpg_server (FastAPI search over
laion/laion-tunes-rpg-music: BM25 + FAISS situation/emotion/caption search)
plus LOCAL AUDIO SERVING from the extracted tars.

The stock server only knows remote `audio_url`s (Suno/Udio CDNs — slow or dead);
Vivarium needs reliable audio, so this wrapper adds:

    GET/HEAD /api/audio/{row_id}   → the local file for that track

row_id → file resolution: the tar members are indexed by filename stem at
startup; a row_id resolves either directly (stem == row_id) or via the UUID
stem of the track's `audio_url` in the metadata DB.

Run:  ./venv/bin/python music_server.py --port 8930
(HF_HOME is pointed at data/.hf_cache where the embedder is pre-cached.)
"""
import argparse
import mimetypes
import os
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
AUDIO_DIR = HERE / "audio"          # extracted from data/tars/*.tar
os.environ.setdefault("HF_HOME", str(DATA / ".hf_cache"))
sys.path.insert(0, str(DATA))
os.chdir(DATA)                       # rpg_server resolves everything from its BASE_DIR

import rpg_server                    # noqa: E402  (defines app, lifespan, search routes)
from fastapi import HTTPException    # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

# ── filename index over the extracted audio ─────────────────────────────────
_index = {}


def build_index():
    for p in AUDIO_DIR.rglob("*"):
        if p.suffix.lower() in (".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac"):
            _index[p.stem] = p
    print(f"[music_server] indexed {len(_index)} local audio files from {AUDIO_DIR}")


def resolve(row_id: int):
    hit = _index.get(str(row_id))
    if hit:
        return hit
    conn = sqlite3.connect(str(DATA / "indices" / "rpg_metadata.db"))
    row = conn.execute("SELECT audio_url FROM tracks WHERE row_id=?", (row_id,)).fetchone()
    conn.close()
    if row and row[0]:
        stem = row[0].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        return _index.get(stem)
    return None


@rpg_server.app.get("/api/audio/{row_id}")
@rpg_server.app.head("/api/audio/{row_id}")
def api_audio(row_id: int):
    p = resolve(row_id)
    if not p:
        raise HTTPException(404, "audio not available locally")
    return FileResponse(str(p), media_type=mimetypes.guess_type(p.name)[0] or "audio/mpeg")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8930)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()
    rpg_server.app.state.gpu_id = 0
    rpg_server.app.state.no_whisper = True      # audio-similarity search not needed by Vivarium
    build_index()
    import uvicorn
    uvicorn.run(rpg_server.app, host=args.host, port=args.port)
