#!/usr/bin/env python3
"""Extract per-language reference clips for the Vivarium voice-profile system.

Streams each {Voice}.tar from huggingface.co/datasets/laion/gemini-2.5-pro-tts-voice-profiles
(1-2 GB each — we DON'T store them; we read the tar as a stream and keep only what we need)
and keeps, per language (EN/DE/ES/FR), ONE clean sample:

  * variant  no_bursts  (a reference clip must not contain laughs/gasps — the LAIONBox
               voice-conversion would clone them into every line)
  * emotion_1 == "interest" preferred (neutral, engaged delivery); otherwise the first
               sample whose emotions come from a NEUTRAL_OK set is kept as fallback
  * accent   EN: US or British; DE/ES/FR: standard

Each kept WAV (24 kHz mono, ~20 s) is transcoded to 64 kbps mono MP3, trimmed to 15 s
(plenty for voice cloning, keeps the repo small) into:

    assets/voice_profiles/<GeminiVoice>/<lang>.mp3     (lang ∈ en de es fr)

and a manifest with the chosen samples' metadata is written to

    assets/voice_profiles/manifest.json

Run:  python3 scripts/extract_voice_profiles.py            # all 21 voices, 4 workers
      python3 scripts/extract_voice_profiles.py Iapetus    # just one voice
"""
import io, json, os, subprocess, sys, tarfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

VOICES = ["Achernar", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe",
          "Charon", "Despina", "Enceladus", "Erinome", "Fenrir", "Iapetus", "Kore",
          "Laomedeia", "Leda", "Orus", "Puck", "Rasalgethi", "Umbriel", "Zephyr"]
LANGS = {"en", "de", "es", "fr"}
BASE = "https://huggingface.co/datasets/laion/gemini-2.5-pro-tts-voice-profiles/resolve/main"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "voice_profiles")
ACCENT_OK = {"en": {"US", "British"}, "de": {"standard"}, "es": {"standard"}, "fr": {"standard"}}
# The dataset uses a 59-emotion vocabulary (~2-5 no-bursts samples per emotion per language),
# so we match against families of calm/neutral/pleasant emotions rather than one exact name.
# PREFERRED (grade A) = neutral-engaged, ideal for a cloning reference; NEUTRAL_OK (grade B)
# = still calm/pleasant, fine as fallback. Only emotion_1 is considered — requiring both
# emotions to be neutral starved the search (1 match in a whole 1.6 GB tar).
PREFERRED = {"interest", "deep focus", "contemplation", "calmness", "serenity", "composure",
             "fondness", "contentment", "concentration"}
NEUTRAL_OK = PREFERRED | {"gratefulness", "dignity", "satisfaction", "alleviation", "admiration",
                          "curiosity", "affection", "tranquility", "gentleness", "hopefulness",
                          "determination", "relief"}
# WIDE=1 (env): last-resort pass for voices where a language found no neutral sample at all —
# accept ANY emotion except ones that would poison a cloning reference (screams, sobs, rage…).
if os.environ.get("WIDE") == "1":
    BAD = {"anger", "enragement", "irascibility", "horror", "terror", "detestation", "disgust",
           "malevolence", "crying", "sobbing", "screaming", "desperation", "ecstasy",
           "being drunk", "feeling turned on", "romantic desire", "pain", "agony"}
    NEUTRAL_OK = None  # sentinel: grade B = anything not in BAD (see grading below)


def accent_of(path):                      # paired/EN/British/sample_....wav → British
    parts = path.split("/")
    return parts[2] if len(parts) >= 4 else ""


# How many candidates to collect per (voice, language). 1 = take the first acceptable clip.
# >1 = collect several so scripts/judge_voice_profiles.py can LISTEN to them all and keep the
# best (voice-acting datasets are expressive — the metadata alone doesn't guarantee a calm take).
CANDIDATES = int(os.environ.get("CANDIDATES", "1"))


def extract_voice(voice):
    url = f"{BASE}/{voice}.tar"
    picked = {l: [] for l in LANGS}  # lang → [ {"grade","wav","meta"} … up to CANDIDATES ]
    pending = {}     # basename → (lang, grade, meta)  — json seen, waiting for its wav
    recent_wavs = {} # rolling cache: basename → bytes (json may arrive after the wav)

    def want(lang, grade):
        # room for another candidate? A-grades may displace B-grades once full.
        arr = picked[lang]
        if len(arr) < CANDIDATES:
            return True
        return grade == "A" and any(p["grade"] == "B" for p in arr)

    def add(lang, grade, wav, meta):
        arr = picked[lang]
        if len(arr) >= CANDIDATES:
            for i, p in enumerate(arr):
                if p["grade"] == "B":
                    arr[i] = {"grade": grade, "wav": wav, "meta": meta}
                    return
        else:
            arr.append({"grade": grade, "wav": wav, "meta": meta})

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "vivarium-profiles"})
        resp = urllib.request.urlopen(req, timeout=120)
        tf = tarfile.open(fileobj=resp, mode="r|")
        for m in tf:
            if all(len(picked[l]) >= CANDIDATES and all(p["grade"] == "A" for p in picked[l]) for l in LANGS):
                break  # full set of first-choice candidates everywhere — stop streaming early
            base, ext = os.path.splitext(m.name)
            if ext == ".wav":
                data = tf.extractfile(m).read()
                if base in pending:
                    lang, grade, meta = pending.pop(base)
                    if want(lang, grade):
                        add(lang, grade, data, meta)
                else:
                    recent_wavs[base] = data
                    while len(recent_wavs) > 8:            # keep memory bounded (~8 MB)
                        recent_wavs.pop(next(iter(recent_wavs)))
            elif ext == ".json":
                try:
                    d = json.load(tf.extractfile(m))
                except Exception:
                    continue
                lang = (d.get("language") or "").lower()
                if lang not in LANGS or d.get("variant") != "no_bursts":
                    continue
                if accent_of(m.name) not in ACCENT_OK.get(lang, set()):
                    continue
                e1 = (d.get("emotion_1") or "").lower()
                e2 = (d.get("emotion_2") or "").lower()
                if NEUTRAL_OK is None:  # WIDE mode: anything not clearly unusable
                    grade = "A" if e1 in PREFERRED else ("B" if e1 not in BAD else None)
                else:
                    grade = "A" if e1 in PREFERRED else ("B" if e1 in NEUTRAL_OK else None)
                if not grade or not want(lang, grade):
                    continue
                meta = {"sample": os.path.basename(base), "emotion_1": e1, "emotion_2": e2,
                        "accent": accent_of(m.name), "text": (d.get("text") or "")[:200],
                        "caption": ((d.get("timestamp_items") or [{}])[0].get("caption") or "")[:220]}
                if base in recent_wavs:
                    add(lang, grade, recent_wavs.pop(base), meta)
                else:
                    pending[base] = (lang, grade, meta)
        resp.close()
    except Exception as e:
        print(f"[{voice}] stream error: {e}", flush=True)

    # transcode & write. CANDIDATES=1 → final clips (<Voice>/<lang>.mp3);
    # CANDIDATES>1 → candidate pool (_candidates/<Voice>/<lang>_<k>.mp3) for the judge step.
    vdir = os.path.join(OUT, "_candidates", voice) if CANDIDATES > 1 else os.path.join(OUT, voice)
    os.makedirs(vdir, exist_ok=True)
    result = {}
    for lang, arr in picked.items():
        for k, p in enumerate(arr):
            name = f"{lang}_{k}.mp3" if CANDIDATES > 1 else f"{lang}.mp3"
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", "pipe:0", "-t", "15", "-ac", "1", "-b:a", "64k", os.path.join(vdir, name)],
                input=p["wav"], capture_output=True)
            if proc.returncode == 0:
                result.setdefault(lang, []).append({**p["meta"], "grade": p["grade"], "file": name})
            else:
                print(f"[{voice}] ffmpeg failed for {lang}", flush=True)
    missing = sorted(LANGS - set(result))
    print(f"[{voice}] done: { {l: len(v) for l, v in sorted(result.items())} }{' MISSING: ' + str(missing) if missing else ''}", flush=True)
    return voice, result


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = sys.argv[1:] or VOICES
    manifest = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for voice, result in ex.map(extract_voice, targets):
            manifest[voice] = result
    # CANDIDATES>1 → candidate manifest (consumed by judge_voice_profiles.py --select);
    # CANDIDATES=1 → final manifest next to the shipped clips.
    mpath = os.path.join(OUT, "_candidates", "manifest.json") if CANDIDATES > 1 else os.path.join(OUT, "manifest.json")
    os.makedirs(os.path.dirname(mpath), exist_ok=True)
    existing = json.load(open(mpath)) if os.path.exists(mpath) else {}
    existing.update(manifest)
    json.dump(existing, open(mpath, "w"), indent=1, ensure_ascii=False)
    print("manifest →", mpath, flush=True)


if __name__ == "__main__":
    main()
