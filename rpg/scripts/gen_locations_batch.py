#!/usr/bin/env python3
"""Generate the remaining demo-world location backgrounds (empty, no people)."""
import subprocess, sys, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SUFFIX = ",  -  warm & bright colors, very nice HQ Anime style, ghiblhi style, pleasant to look at, widescreen location panorama, empty scene, no people, no humans"
LOCS = {
    "bedroom": "cozy student couple's bedroom, double bed with mismatched pillows and a knitted throw, fairy lights over the headboard, two desks squeezed side by side, anatomy poster and psychology books, soft morning light",
    "bathroom": "small bright apartment bathroom, white tiles with mint accents, shower curtain with cute pattern, two toothbrushes in a cup, plants on the window sill",
    "supermarket": "friendly neighbourhood supermarket interior, colorful produce aisles, stacked fruit displays, warm lighting, small chalkboard offers",
    "campus_quad": "sunny university campus quad, old stone faculty buildings, clock tower, leafy trees, benches and bicycles, banners between lampposts",
    "hospital_ward": "bright friendly teaching-hospital ward corridor, pastel walls, nurse station with clipboards, big windows, potted plants, gentle sunlight",
    "psych_lab": "cozy university psychology lab, eye-tracking computer stations, whiteboard full of diagrams, bookshelf with journals, one-way mirror window, warm desk lamps",
    "town_hall": "charming small-town hall interior, wooden counters, notice board with flyers, marble floor, tall arched windows, warm afternoon light",
    "courthouse": "stately but warm courthouse hallway, wooden benches, tall columns, brass lamps, high windows with sunbeams",
    "park": "lovely town park, winding gravel path, duck pond, blossoming trees, wooden bench, distant bandstand, golden hour light",
    "street": "pleasant residential street connecting apartment houses and small shops, cobblestones, bicycles, flower boxes, cafe awnings, morning light",
    "campus_cafe_empty": "sunny university campus café interior, espresso machine behind a wooden counter, chalkboard menu, small round tables with chairs, big windows onto a leafy campus",
    "italian_restaurant_empty": "warm little Italian restaurant interior in the evening, red-checkered tablecloths, candles in wine bottles, strings of garlic and dried herbs, chalkboard with pasta specials, soft golden lamplight",
}
fails = []
for name, prompt in LOCS.items():
    out = f"assets/locations/{name}.png"
    if os.path.exists(out):
        print("skip", name); continue
    r = subprocess.run([sys.executable, "scripts/gen_image.py", prompt + SUFFIX, out, "--aspect", "16:9"])
    if r.returncode != 0:
        fails.append(name)
        print("FAIL", name)
print("DONE. fails:", fails or "none")
