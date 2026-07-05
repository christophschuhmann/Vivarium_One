# Vivarium background-music server

Scene-matched instrumental music from **laion/laion-tunes-rpg-music** (2,580
Gemini-annotated tracks, BM25 + FAISS situation search).

## Setup

```bash
cd rpg-music
python3 -m venv venv
./venv/bin/pip install fastapi uvicorn faiss-cpu numpy scipy \
    "sentence-transformers[onnx]" onnxruntime pandas rank_bm25 python-multipart \
    huggingface_hub hf_transfer

# dataset (~14.5 GB: indices + 3 audio tars)
HF_HUB_ENABLE_HF_TRANSFER=1 ./venv/bin/python -c "
from huggingface_hub import snapshot_download
snapshot_download('laion/laion-tunes-rpg-music', repo_type='dataset', local_dir='data')"

mkdir -p audio && cd audio
for t in ../data/tars/*.tar; do tar -xf "$t"; done   # 2,580 mp3s named <row_id>.mp3
cd ..

./venv/bin/python music_server.py --port 8930        # public on 0.0.0.0
```

`music_server.py` wraps the dataset's stock `rpg_server.py` (search API + web UI)
and adds `GET/HEAD /api/audio/{row_id}` serving the local files.

Vivarium reads `MUSIC_API_URL` (default `http://127.0.0.1:8930`); the game
proxies audio same-origin via `/api/music/audio/:rowId`. If this server is
down, stories simply play without music.
