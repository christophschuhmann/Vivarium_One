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
    # Despill: pull green channel down toward avg(R,B) where matte is soft
    spill = (alpha < 1) & (g_dom > 0)
    avg_rb = (img[:, :, 0] + img[:, :, 2]) / 2
    img[:, :, 1] = np.where(spill, np.minimum(img[:, :, 1], avg_rb + (img[:, :, 1] - avg_rb) * alpha), img[:, :, 1])
    out = np.dstack([img.clip(0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
    Image.fromarray(out, "RGBA").save(dst)
    solid = (alpha > 0.99).mean()
    print(f"OK {dst} — {solid*100:.1f}% solid, key RGB={key.astype(int).tolist()}")

if __name__ == "__main__":
    cutout(sys.argv[1], sys.argv[2])
