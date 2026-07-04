#!/usr/bin/env python3
"""Combine every batch of the narrator TTS experiment into one final report."""
import json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, "scripts")


def load(path, key=None):
    p = os.path.join(S, path)
    if not os.path.exists(path) and not os.path.exists(p):
        return []
    try:
        d = json.load(open(p if os.path.exists(p) else path))
    except Exception:
        return []
    return d[key] if key and isinstance(d, dict) and key in d else (d if isinstance(d, list) else [])


main = json.load(open(os.path.join(S, "tts_experiment_results.json")))
confirm = load("tts_experiment_phase3_confirm.json")
temp_sweep = load("tts_experiment_phase4_temperature.json")
temp_more = load("tts_experiment_phase4b_iapetus_t03.json")

# --- Phase 1: prompt ranking (unambiguous, single batch) ---
print("=" * 70)
print("PHASE 1 — PROMPT RANKING (voice held constant: Algenib, temp=1.0)")
print("=" * 70)
for r in sorted(main["phase1_results"], key=lambda r: -(r.get("score") or -1)):
    print(f"  {r['label']:28} avg={r.get('score')}  range=[{r.get('score_min')},{r.get('score_max')}]  bursts_ever={r.get('vocal_bursts_detected')}")
print(f"\n  WINNER: {main['best_prompt_label']}")

# --- Phase 2 + confirm: pool ALL raw samples per voice at temp=1.0, prompt=P3 ---
print("\n" + "=" * 70)
print("PHASE 2 + CONFIRMATION — VOICE RELIABILITY AT TEMP=1.0 (prompt = P3 winner)")
print("All independent draws pooled per voice for the true hit-rate.")
print("=" * 70)
by_voice = defaultdict(list)
for r in main["phase2_results"]:
    for s in r.get("samples", []):
        if isinstance(s.get("score"), (int, float)):
            by_voice[r["voice"]].append(s["score"])
for r in confirm:
    voice = r["voice"]
    for s in r.get("samples", []):
        if isinstance(s.get("score"), (int, float)):
            by_voice[voice].append(s["score"])

rows = []
for voice, scores in by_voice.items():
    hits = sum(1 for s in scores if s >= 7)
    rows.append((voice, len(scores), hits, hits / len(scores), sum(scores) / len(scores), scores))
rows.sort(key=lambda r: -r[3])
for voice, n, hits, rate, avg, scores in rows:
    print(f"  {voice:16} n={n:2}  hit_rate={rate*100:5.1f}%  ({hits}/{n} scored >=7)  avg={avg:.2f}  raw={scores}")

# --- Phase 4: temperature sweep, pooled ---
print("\n" + "=" * 70)
print("PHASE 4 — TEMPERATURE SWEEP (prompt = P3 winner)")
print("=" * 70)
by_vt = defaultdict(list)
for r in temp_sweep:
    if isinstance(r.get("score"), (int, float)):
        by_vt[(r["voice"], r.get("temperature"))].append(r["score"])
for r in temp_more:
    if isinstance(r.get("score"), (int, float)):
        # this batch used voice='Iapetus' embedded in label; temperature passed explicitly
        by_vt[("Iapetus", 0.3)].append(r["score"])

vt_rows = []
for (voice, temp), scores in by_vt.items():
    hits = sum(1 for s in scores if s >= 7)
    vt_rows.append((voice, temp, len(scores), hits, hits / len(scores) if scores else 0, sum(scores) / len(scores) if scores else 0, scores))
vt_rows.sort(key=lambda r: (-r[4], -r[5]))
for voice, temp, n, hits, rate, avg, scores in vt_rows:
    print(f"  {voice:16} temp={temp:4}  n={n:2}  hit_rate={rate*100:5.1f}%  avg={avg:.2f}  raw={scores}")

# combine with temp=1.0 pooled data as the "temp=1.0" row for the same voices for direct comparison
print("\n  (for reference, temp=1.0 pooled from phase2+confirm above)")
for voice in set(v for v, t, *_ in vt_rows):
    if voice in by_voice:
        scores = by_voice[voice]
        hits = sum(1 for s in scores if s >= 7)
        print(f"  {voice:16} temp= 1.0  n={len(scores):2}  hit_rate={hits/len(scores)*100:5.1f}%  avg={sum(scores)/len(scores):.2f}  raw={scores}")

print("\n" + "=" * 70)
print("FINAL RECOMMENDATION")
print("=" * 70)
best_vt = max(vt_rows, key=lambda r: (r[4], r[5])) if vt_rows else None
best_v1 = max(rows, key=lambda r: r[3]) if rows else None
print(f"  Best at temp=1.0 (default temp): {best_v1[0]} — {best_v1[3]*100:.0f}% hit rate over {best_v1[1]} draws")
if best_vt:
    print(f"  Best with temperature tuning:    {best_vt[0]} @ temp={best_vt[1]} — {best_vt[4]*100:.0f}% hit rate over {best_vt[2]} draws")
