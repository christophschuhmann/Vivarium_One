#!/usr/bin/env python3
"""Generate an image via hyprlab nano-banana-2. Supports optional reference images
for character consistency (passed as data-URL strings in `image` field)."""
import base64, json, os, sys, urllib.request

API_KEY = os.environ["HYPRLAB_API_KEY"]  # required — set it in .env / the shell

def gen(prompt, out_path, aspect="2:3", refs=None, model="nano-banana-2"):
    body = {
        "model": model,
        "prompt": prompt,
        "aspect_ratio": aspect,
        "resolution": "1K",
        "google_search": False,
        "image_search": False,
        "response_format": "b64_json",
    }
    if refs:
        imgs = []
        for r in refs:
            with open(r, "rb") as f:
                imgs.append("data:image/png;base64," + base64.b64encode(f.read()).decode())
        body["image"] = imgs if len(imgs) > 1 else imgs[0]
    req = urllib.request.Request(
        "https://api.hyprlab.io/v1/images/generations",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read())
    b64 = data["data"][0]["b64_json"]
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"OK {out_path} ({len(b64)*3//4//1024} KB)")

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("prompt")
    p.add_argument("out")
    p.add_argument("--aspect", default="2:3")
    p.add_argument("--ref", action="append", default=[])
    args = p.parse_args()
    try:
        gen(args.prompt, args.out, args.aspect, args.ref or None)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:2000], file=sys.stderr)
        sys.exit(1)
