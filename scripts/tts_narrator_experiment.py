#!/usr/bin/env python3
"""
Experiment: find the calmest, least "performed" narrator voice+prompt combo for
Vivarium's storyteller, using gemini-3.5-flash (audio-input capable) as an
automated judge.

Phase 1 — fix a voice, vary the DIRECTION PROMPT (5 candidates), generate in
           parallel, judge in parallel, pick the best-scoring prompt.
Phase 2 — fix the winning prompt, vary the VOICE across male voices, generate
           in parallel, judge in parallel, rank the results.

Everything (audio files + raw judge responses) is saved under
scripts/../data/tts_experiment/ and a full results JSON + human-readable
markdown summary are written next to this script.
"""
import base64, json, os, sys, time, textwrap
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "tts_experiment")
os.makedirs(OUT_DIR, exist_ok=True)
RESULTS_PATH = os.path.join(ROOT, "scripts", "tts_experiment_results.json")
SUMMARY_PATH = os.path.join(ROOT, "scripts", "tts_experiment_summary.md")

API_KEY = os.environ["HYPRLAB_API_KEY"]  # required — set it in .env / the shell
TTS_URL = f"https://api.hyprlab.io/v1beta/models/gemini-3.1-flash-tts:generateContent?key={API_KEY}"
JUDGE_URL = f"https://api.hyprlab.io/v1beta/models/gemini-3.5-flash:generateContent?key={API_KEY}"

# The narration line under test — deliberately includes words ("laughed", "surprised",
# a sigh-adjacent beat) that tempt a TTS model into ad-libbed vocal bursts / acting,
# so a good calm-narrator prompt has to actively resist that pull.
NARRATION_TEXT = (
    "The kitchen smelled of toast and burnt coffee. Alice laughed despite herself, "
    "surprised by how much she had missed this ordinary morning chaos. Bob leaned "
    "against the counter, watching her with the quiet, settled look of someone who "
    "already knew how the rest of the day would go."
)

PROMPT_VARIANTS = {
    "P1_current_default": (
        "Calm, warm audiobook-narrator voice: relaxed pace, natural phrasing, like "
        "reading a favourite novel aloud to a friend. Keep emotion mild and "
        "understated — only a light touch of feeling where the text calls for it. "
        "Never theatrical, never over-acted, never like a voice actor performing a "
        "character."
    ),
    "P2_explicit_ban": (
        "Read this in a steady, neutral audiobook-narrator voice — like a "
        "professional audiobook narration, not a performance. Do not act out the "
        "characters' emotions. Do not add sighs, laughs, gasps, or any vocal sound "
        "effects. Keep a consistent, even pace and tone throughout, with only the "
        "faintest, most natural inflection. This is narration, not a dramatic "
        "reading."
    ),
    "P3_documentary_deadpan": (
        "Speak in a plain, measured, matter-of-fact narrator tone — calm and "
        "pleasant but emotionally reserved, the way a documentary narrator or news "
        "reader speaks. No dramatization, no character acting, no exaggerated "
        "emotional inflection, no vocal bursts of any kind (no gasping, laughing, "
        "sighing aloud). Even, steady pacing throughout."
    ),
    "P4_professional_recording": (
        "You are a professional audiobook narrator recording a calm literary novel "
        "for a publisher. Read naturally and clearly at a relaxed, steady pace. "
        "Your delivery is composed and even — emotion should be implied through "
        "word choice and pacing alone, never through vocal performance, sound "
        "effects, or acted-out reactions. Do not laugh, gasp, or sigh aloud."
    ),
    "P5_short_plain": (
        "Calm, steady, plain audiobook narration. No acting, no vocal bursts, no "
        "dramatic emphasis, no sound effects. Just a clear, pleasant, even-paced "
        "reading voice, start to finish."
    ),
}

# Male voices from config/gemini_tts_voices.json, spanning styles, for phase 2.
MALE_VOICES = {
    "Algenib": "Gravelly",
    "Charon": "Informative",
    "Orus": "Firm",
    "Schedar": "Even",
    "Iapetus": "Clear",
    "Umbriel": "Easy-going",
    "Rasalgethi": "Informative",
    "Achird": "Friendly",
    "Sadaltager": "Knowledgeable",
    "Zubenelgenubi": "Casual",
}
PHASE1_VOICE = "Algenib"  # current app default; hold constant while searching for the best prompt

JUDGE_SYSTEM = textwrap.dedent("""\
    You are an exacting audio quality judge for an audiobook narrator voice.
    You will listen to one short audio clip: a narrator reading a piece of story narration.
    Rate strictly on ONE question: does this sound like a calm, professional AUDIOBOOK
    narrator plainly reading the text — as opposed to an actor PERFORMING it?

    Score 0-10 where:
      10 = flawless calm audiobook narrator: steady, plain, pleasant, zero acting, zero vocal
           sound effects (no audible laughs, gasps, sighs, breathy emphasis, voice cracks).
      7-9 = very good, extremely mild/natural inflection only, no audible sound effects.
      4-6 = noticeably performed: audible emotional acting, uneven pacing, but no explicit
            vocal bursts (laughs/gasps/sighs actually vocalised).
      1-3 = clearly acting/performing OR contains at least one audible vocal burst
            (a laugh, gasp, sigh, or similar non-narration sound actually spoken/vocalised).
      0 = extreme performance, character voices, or multiple vocal bursts.

    Penalize HEAVILY (score must be <=3) for any of:
      - an actual audible laugh, giggle, gasp, or sigh sound in the audio
      - a "vocal fry" or dramatic breath used as a performance flourish
      - a heavily emphasised, actor-like line delivery
      - noticeable pace/pitch swings that read as "acting a scene" rather than reading prose

    Respond ONLY with a single JSON object, no markdown fences, no prose outside JSON:
    {"score": <integer 0-10>, "vocal_bursts_detected": <true|false>, "reasoning": "<one or two plain sentences>"}
""")


def synthesize(voice: str, style: str, text: str = NARRATION_TEXT, temperature: float = 1.0) -> dict:
    """Call Gemini TTS, return {ok, path, seconds, error}."""
    body = {
        "contents": [{"role": "user", "parts": [{"text": f"{style} Say: {text}"}]}],
        "generationConfig": {
            "responseModalities": ["audio"],
            "temperature": temperature,
            "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": voice}}},
        },
    }
    t0 = time.time()
    r = requests.post(TTS_URL, json=body, timeout=180)
    if not r.ok:
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:400]}", "gen_s": time.time() - t0}
    data = r.json()
    try:
        part = next(p for p in data["candidates"][0]["content"]["parts"] if "inlineData" in p)
    except (KeyError, IndexError, StopIteration):
        return {"ok": False, "error": f"no audio in response: {json.dumps(data)[:400]}", "gen_s": time.time() - t0}
    pcm = base64.b64decode(part["inlineData"]["data"])
    seconds = len(pcm) / 48000  # 24kHz * 2 bytes/sample
    return {"ok": True, "pcm": pcm, "seconds": round(seconds, 2), "gen_s": round(time.time() - t0, 1)}


def pcm_to_mp3(pcm: bytes, out_path: str):
    import subprocess
    p = subprocess.run(
        ["ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-b:a", "64k", out_path],
        input=pcm, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode()[:400])


def judge(mp3_path: str) -> dict:
    with open(mp3_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": JUDGE_SYSTEM},
                {"inline_data": {"mime_type": "audio/mp3", "data": b64}},
            ],
        }],
        "generationConfig": {"temperature": 0.1},
    }
    t0 = time.time()
    r = requests.post(JUDGE_URL, json=body, timeout=90)
    if not r.ok:
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:400]}"}
    data = r.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        return {"ok": False, "error": f"no text in judge response: {json.dumps(data)[:400]}"}
    # strip fences if present, extract the JSON object
    t = text.strip()
    if "```" in t:
        t = t.split("```")[1].replace("json", "", 1).strip() if t.count("```") >= 2 else t
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end == -1:
        return {"ok": False, "error": f"no JSON in judge text: {text[:400]}"}
    try:
        parsed = json.loads(t[start:end + 1])
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"bad JSON: {e}; raw: {text[:400]}"}
    parsed["ok"] = True
    parsed["judge_s"] = round(time.time() - t0, 1)
    return parsed


def run_one_sample(label: str, voice: str, style: str, tag: str, temperature: float = 1.0) -> dict:
    """Single synth -> mp3 -> judge pass. tag must be unique per sample (incl. repeat index)."""
    entry = {"label": label, "voice": voice, "style": style, "temperature": temperature}
    synth = synthesize(voice, style, temperature=temperature)
    if not synth["ok"]:
        entry["error"] = synth["error"]
        return entry
    mp3_path = os.path.join(OUT_DIR, f"{tag}.mp3")
    try:
        pcm_to_mp3(synth["pcm"], mp3_path)
    except Exception as e:
        entry["error"] = f"ffmpeg transcode failed: {e}"
        return entry
    entry["audio_path"] = mp3_path
    entry["seconds"] = synth["seconds"]
    entry["gen_s"] = synth["gen_s"]
    j = judge(mp3_path)
    if not j.get("ok"):
        entry["judge_error"] = j.get("error")
        return entry
    entry["score"] = j.get("score")
    entry["vocal_bursts_detected"] = j.get("vocal_bursts_detected")
    entry["reasoning"] = j.get("reasoning")
    entry["judge_s"] = j.get("judge_s")
    return entry


def aggregate(label: str, voice: str, style: str, samples: list) -> dict:
    scored = [s for s in samples if isinstance(s.get("score"), (int, float))]
    entry = {"label": label, "voice": voice, "style": style, "samples": samples}
    if scored:
        entry["score"] = round(sum(s["score"] for s in scored) / len(scored), 2)
        entry["score_min"] = min(s["score"] for s in scored)
        entry["score_max"] = max(s["score"] for s in scored)
        entry["vocal_bursts_detected"] = any(s.get("vocal_bursts_detected") for s in scored)
        entry["reasoning"] = " | ".join(f"(run {i+1}: {s['score']}) {s.get('reasoning','')}" for i, s in enumerate(scored))
        entry["n_scored"] = len(scored)
    else:
        entry["error"] = "; ".join(s.get("error") or s.get("judge_error") or "unknown" for s in samples)
    return entry


def parallel_run(jobs: list, repeats: int = 1, max_workers: int = 12) -> list:
    """jobs: list of (label, voice, style, tag). Every (job, repeat) pair runs as its
    own fully-parallel task; results are grouped back by label/voice afterwards."""
    flat = [(label, voice, style, f"{tag}_{label}_r{i}", label, i)
            for (label, voice, style, tag) in jobs for i in range(repeats)]
    raw = [None] * len(flat)
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(run_one_sample, f[0], f[1], f[2], f[3]): idx for idx, f in enumerate(flat)}
        done = 0
        for fut in as_completed(futs):
            idx = futs[fut]
            try:
                raw[idx] = fut.result()
            except Exception as e:
                raw[idx] = {"label": flat[idx][0], "voice": flat[idx][1], "error": f"exception: {e}"}
            done += 1
            r = raw[idx]
            status = f"score={r.get('score')}" if "score" in r else f"ERROR: {r.get('error') or r.get('judge_error')}"
            print(f"  [{done}/{len(flat)}] {r['label']} r{flat[idx][5]} (voice={r['voice']}) -> {status}", flush=True)
    grouped = {}
    for (label, voice, style, tag, glabel, i), sample in zip(flat, raw):
        grouped.setdefault((label, voice, style), []).append(sample)
    return [aggregate(label, voice, style, samples) for (label, voice, style), samples in grouped.items()]


REPEATS = 3  # samples per (prompt, voice) combo — catches intermittent vocal bursts

def main():
    print(f"=== PHASE 1: prompt search (voice fixed = {PHASE1_VOICE}), {REPEATS} samples/prompt ===")
    phase1_jobs = [(label, PHASE1_VOICE, style, "p1") for label, style in PROMPT_VARIANTS.items()]
    phase1_results = parallel_run(phase1_jobs, repeats=REPEATS)

    scored1 = [r for r in phase1_results if isinstance(r.get("score"), (int, float))]
    if not scored1:
        print("PHASE 1 FAILED: no scored results at all. Aborting.")
        json.dump({"phase1": phase1_results}, open(RESULTS_PATH, "w"), indent=1)
        sys.exit(1)
    best_prompt_entry = max(scored1, key=lambda r: r["score"])
    best_label = best_prompt_entry["label"]
    best_style = PROMPT_VARIANTS[best_label]
    print(f"\nBest prompt: {best_label} (score={best_prompt_entry['score']})\n")

    print(f"=== PHASE 2: voice search (prompt fixed = {best_label}), {REPEATS} samples/voice ===")
    phase2_jobs = [(voice, voice, best_style, "p2") for voice in MALE_VOICES]
    phase2_results = parallel_run(phase2_jobs, repeats=REPEATS)

    scored2 = [r for r in phase2_results if isinstance(r.get("score"), (int, float))]
    scored2.sort(key=lambda r: -r["score"])

    out = {
        "narration_text": NARRATION_TEXT,
        "phase1_fixed_voice": PHASE1_VOICE,
        "phase1_results": phase1_results,
        "best_prompt_label": best_label,
        "best_prompt_text": best_style,
        "phase2_fixed_prompt": best_label,
        "phase2_results": phase2_results,
        "final_ranking": [{"voice": r["voice"], "score": r["score"], "vocal_bursts_detected": r.get("vocal_bursts_detected"), "reasoning": r.get("reasoning")} for r in scored2],
    }
    json.dump(out, open(RESULTS_PATH, "w"), indent=1)

    # human-readable summary
    lines = ["# Vivarium narrator TTS experiment\n", f"Narration text under test:\n> {NARRATION_TEXT}\n"]
    lines.append("## Phase 1 — prompt search (voice held constant: " + PHASE1_VOICE + ")\n")
    lines.append("| Prompt | Score | Vocal bursts? | Reasoning |")
    lines.append("|---|---|---|---|")
    for r in sorted(phase1_results, key=lambda r: -(r.get("score") or -1)):
        lines.append(f"| **{r['label']}** | {r.get('score','ERR')} | {r.get('vocal_bursts_detected','-')} | {r.get('reasoning', r.get('error') or r.get('judge_error') or '')} |")
    lines.append(f"\n**Winning prompt: `{best_label}`**\n\n> {best_style}\n")
    lines.append("## Phase 2 — voice search (prompt held constant: winning prompt above)\n")
    lines.append("| Voice | Style tag | Score | Vocal bursts? | Reasoning |")
    lines.append("|---|---|---|---|---|")
    for r in sorted(phase2_results, key=lambda r: -(r.get("score") or -1)):
        lines.append(f"| **{r['voice']}** | {MALE_VOICES.get(r['voice'],'')} | {r.get('score','ERR')} | {r.get('vocal_bursts_detected','-')} | {r.get('reasoning', r.get('error') or r.get('judge_error') or '')} |")
    if scored2:
        winner = scored2[0]
        lines.append(f"\n**Winning voice: `{winner['voice']}` (score {winner['score']})**\n")
    open(SUMMARY_PATH, "w").write("\n".join(lines))
    print(f"\nSaved: {RESULTS_PATH}\nSaved: {SUMMARY_PATH}")


if __name__ == "__main__":
    main()
