#!/usr/bin/env python3
"""Chroma-key a flat green-screen portrait to a transparent PNG cut-out.
Estimates the exact green tone from the image borders, builds a soft alpha
matte with distance-based feathering, and despills green from edge pixels."""
import sys
import numpy as np
from PIL import Image

def cutout(src, dst):
    img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = img.shape
    # Estimate key colour from the border ring (robust to vignettes)
    ring = np.concatenate([
        img[:20].reshape(-1, 3), img[-20:].reshape(-1, 3),
        img[:, :20].reshape(-1, 3), img[:, -20:].reshape(-1, 3)])
    key = np.median(ring, axis=0)
    # Distance in a green-weighted space
    d = np.sqrt(((img - key) ** 2 * np.array([1.0, 2.0, 1.0])).sum(axis=2))
    # Also require pixel to be "greenish" like the key to be removed
    g_dom = (img[:, :, 1] - np.maximum(img[:, :, 0], img[:, :, 2]))
    key_dom = key[1] - max(key[0], key[2])
    greenish = np.clip(g_dom / max(key_dom * 0.5, 1e-3), 0, 1)
    lo, hi = 40.0, 110.0
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    alpha = 1 - (1 - alpha) * greenish          # only key out green-like pixels
    # FULL green despill on every FEATHER pixel (alpha<1): the silhouette edge picks up
    # semi-transparent green-screen spill that, faint in the source, becomes a visible teal
    # fringe line when the sprite is scaled up over a warm background. Clamping green all the
    # way to avg(R,B) here neutralises it; solid interior pixels (alpha==1) are untouched so
    # legitimately-green clothing keeps its colour.
    avg_rb = (img[:, :, 0] + img[:, :, 2]) / 2
    feather = (alpha < 0.98) & (g_dom > 0)
    img[:, :, 1] = np.where(feather, np.minimum(img[:, :, 1], avg_rb), img[:, :, 1])
    # Erode the matte by TWO pixels so the outermost contaminated ring — including any cyan/
    # teal rim-light the generator painted on the silhouette edge — is dropped entirely.
    def erode(a):
        return np.minimum.reduce([a,
            np.pad(a[1:], ((0,1),(0,0)), constant_values=0),
            np.pad(a[:-1], ((1,0),(0,0)), constant_values=0),
            np.pad(a[:, 1:], ((0,0),(0,1)), constant_values=0),
            np.pad(a[:, :-1], ((0,0),(1,0)), constant_values=0)])
    alpha = erode(alpha)
    # Kill saturated teal/cyan (g and b both well above r) in the whole feather band — rim
    # light is bluish-green, not just green, so the green-only despill above misses it.
    tealish = (alpha < 0.98) & (img[:, :, 1] > img[:, :, 0] + 20) & (img[:, :, 2] > img[:, :, 0] + 20)
    img[:, :, 1] = np.where(tealish, img[:, :, 0], img[:, :, 1])
    img[:, :, 2] = np.where(tealish, img[:, :, 0], img[:, :, 2])
    # GHOST-KILL: the green key leaves faint despilled-green (now teal) pixels at PARTIAL
    # alpha across the background region — invisible on a light preview, but a floating teal
    # watermark over a real scene backdrop (and it follows the sprite's transparent canvas on
    # resize). Any low-alpha pixel that is still green/teal-leaning is background residue:
    # force it fully transparent. Real subject content is opaque (alpha~1), so it is untouched.
    # residue = low-alpha pixel where GREEN clearly dominates red (despilled key colour).
    # Tight threshold so neutral/dark clothing soft edges (r~=g~=b) are NOT eaten — that was
    # over-aggressive and hardened every silhouette.
    residue = (alpha < 0.5) & (img[:, :, 1] > img[:, :, 0] + 14)
    alpha = np.where(residue, 0.0, alpha)
    # ISLAND REMOVAL: the subject is ONE connected blob. Any separate island of opaque pixels
    # floating away from it is a chroma-key artifact (a stray reflection, a bit of the backdrop
    # the key missed). Label connected components of the solid mask, keep the largest, and drop
    # every island smaller than 20% of it — the disconnected floating watermark the player saw
    # pop in as sprites loaded.
    try:
        from scipy import ndimage
        # The real subject is OPAQUE (alpha~1); chroma-key artifacts are FAINT and/or float
        # away from it. So anchor on the largest OPAQUE blob: label opaque components, keep the
        # biggest (plus any legit opaque part >=20% of it — a separated limb/held object), then
        # keep only what's connected to that core — dilated a few px to recover its own soft
        # feathered edge. Everything else (faint arcs, floating blobs, stray reflections the
        # key missed) is dropped, no matter how large or faint.
        opaque = alpha > 0.6
        labeled, ncomp = ndimage.label(opaque, structure=np.ones((3, 3)))
        if ncomp > 1:
            sizes = np.bincount(labeled.ravel())
            sizes[0] = 0
            biggest = sizes.max()
            core = np.zeros_like(opaque)
            for cid in range(1, ncomp + 1):
                if sizes[cid] >= 0.20 * biggest:
                    core |= (labeled == cid)
            keep = ndimage.binary_dilation(core, iterations=4)   # recover the feather halo
            drop = ~keep
            dropped = int((drop & (alpha > 0.02)).sum())
            if dropped:
                alpha = np.where(drop, 0.0, alpha)
                print(f"   island-removal: kept {int((sizes[1:] >= 0.20 * biggest).sum())} opaque region(s), dropped ~{dropped} floating px")
    except Exception as e:
        print(f"   island-removal skipped: {e}")
    # Zero the RGB of every (near-)transparent pixel so no non-premultiplied renderer can show
    # its colour as a ghost, and so ffmpeg ?w= scaling can't bleed it into neighbours.
    clearRGB = alpha < 0.06
    for ch in range(3):
        img[:, :, ch] = np.where(clearRGB, 0, img[:, :, ch])
    out = np.dstack([img.clip(0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
    Image.fromarray(out, "RGBA").save(dst)
    solid = (alpha > 0.99).mean()
    print(f"OK {dst} — {solid*100:.1f}% solid, key RGB={key.astype(int).tolist()}")

if __name__ == "__main__":
    cutout(sys.argv[1], sys.argv[2])
