#!/usr/bin/env python3
"""Quality-check the extracted voice-profile reference clips with an audio-capable LLM.

For every assets/voice_profiles/<Voice>/<lang>.mp3, gemini-3.5-flash listens to the clip
and reports: perceived gender, age bracket, timbre/tone description, whether any vocal
bursts (sighs/laughs/gasps) occur, and a 0-10 suitability score as a NEUTRAL voice-cloning
reference. Results land in assets/voice_profiles/judgements.json.

Two uses:
  1. flag clips that don't match the voice's known identity (wrong-gender sample, bursty
     take) so they can be re-picked;
  2. the verified age/timbre descriptions feed config/voice_profiles.json — the catalog
     the game's LLM uses to choose a fitting voice for a character.

Requires HYPRLAB_API_KEY in the environment.
"""
import base64, json, os, sys
from concurrent.futures import ThreadPoolExecutor
import urllib.request

KEY = os.environ["HYPRLAB_API_KEY"]
ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "voice_profiles")

PROMPT = """Listen to this voice clip. Reply with ONLY a JSON object, no prose, no fences:
{"gender": "male"|"female", "age": "young adult"|"adult"|"middle-aged"|"elderly",
 "timbre": "8-14 words describing the voice quality (pitch, warmth, texture, pace)",
 "vocal_bursts": true|false  (any sighs, laughs, gasps, coughs, non-speech sounds),
 "reference_score": 0-10  (how suitable as a NEUTRAL voice-cloning reference: clear speech,
                           steady calm delivery, no strong acted emotion, no bursts)}"""


def judge(job):
    voice, lang, path = job
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    body = json.dumps({
        "contents": [{"role": "user", "parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": "audio/mpeg", "data": b64}},
        ]}],
    }).encode()
    req = urllib.request.Request(
        f"https://api.hyprlab.io/v1beta/models/gemini-3.5-flash:generateContent?key={KEY}",
        data=body, headers={"Content-Type": "application/json"})
    try:
        resp = json.load(urllib.request.urlopen(req, timeout=180))
        txt = resp["candidates"][0]["content"]["parts"][-1]["text"].strip()
        txt = txt[txt.find("{"):txt.rfind("}") + 1]
        out = json.loads(txt)
        print(f"[{voice}/{lang}] {out.get('gender')}/{out.get('age')} score={out.get('reference_score')} bursts={out.get('vocal_bursts')}", flush=True)
        return voice, lang, out
    except Exception as e:
        print(f"[{voice}/{lang}] judge failed: {e}", flush=True)
        return voice, lang, {"error": str(e)}


def main():
    jobs = []
    for voice in sorted(os.listdir(ROOT)):
        vdir = os.path.join(ROOT, voice)
        if not os.path.isdir(vdir) or voice == "_candidates":
            continue
        for lang in ("en", "de", "es", "fr"):
            p = os.path.join(vdir, f"{lang}.mp3")
            if os.path.exists(p):
                jobs.append((voice, lang, p))
    print(f"judging {len(jobs)} clips…", flush=True)
    results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for voice, lang, out in ex.map(judge, jobs):
            results.setdefault(voice, {})[lang] = out
    json.dump(results, open(os.path.join(ROOT, "judgements.json"), "w"), indent=1, ensure_ascii=False)
    # summary of problems
    print("\n--- flags ---")
    for voice, langs in sorted(results.items()):
        for lang, r in langs.items():
            if r.get("error") or r.get("vocal_bursts") or (r.get("reference_score") or 0) < 6:
                print(f"  ⚠ {voice}/{lang}: score={r.get('reference_score')} bursts={r.get('vocal_bursts')} {r.get('error','')}")


def select():
    """--select: judge every clip in _candidates/ and promote the best per (voice,lang).

    Ranking: no vocal bursts first, then highest reference_score. The winner is copied to
    assets/voice_profiles/<Voice>/<lang>.mp3, its metadata + judgement recorded in the final
    manifest.json. Candidate pool and its manifest are produced by
    CANDIDATES=5 python3 scripts/extract_voice_profiles.py
    """
    croot = os.path.join(ROOT, "_candidates")
    cman = json.load(open(os.path.join(croot, "manifest.json")))
    jobs = []
    for voice, langs in sorted(cman.items()):
        for lang, cands in langs.items():
            for c in cands:
                p = os.path.join(croot, voice, c["file"])
                if os.path.exists(p):
                    jobs.append((f"{voice}", f"{lang}:{c['file']}", p))
    print(f"judging {len(jobs)} candidate clips…", flush=True)
    scores = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for voice, key, out in ex.map(judge, jobs):
            scores[(voice, key)] = out
    manifest, judgements = {}, {}
    import shutil
    for voice, langs in sorted(cman.items()):
        os.makedirs(os.path.join(ROOT, voice), exist_ok=True)
        for lang, cands in langs.items():
            ranked = []
            for c in cands:
                j = scores.get((voice, f"{lang}:{c['file']}"), {})
                if j.get("error"):
                    continue
                ranked.append((not j.get("vocal_bursts", True), j.get("reference_score") or 0, c, j))
            if not ranked:
                print(f"  ✗ {voice}/{lang}: no judgeable candidate!")
                continue
            ranked.sort(key=lambda t: (t[0], t[1]), reverse=True)
            burstfree, score, c, j = ranked[0]
            shutil.copyfile(os.path.join(croot, voice, c["file"]), os.path.join(ROOT, voice, f"{lang}.mp3"))
            manifest.setdefault(voice, {})[lang] = {k: v for k, v in c.items() if k != "file"}
            judgements.setdefault(voice, {})[lang] = j
            flag = "" if (burstfree and score >= 6) else f"  ⚠ best available: score={score} bursts={not burstfree}"
            print(f"  ✓ {voice}/{lang}: {c['sample']} score={score} bursts={not burstfree}{flag}")
    json.dump(manifest, open(os.path.join(ROOT, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(judgements, open(os.path.join(ROOT, "judgements.json"), "w"), indent=1, ensure_ascii=False)
    print("final manifest + judgements written; candidate pool left in _candidates/ (delete when happy)")


if __name__ == "__main__":
    select() if "--select" in sys.argv else main()
