// Asset store: content on disk, metadata in DB, chroma-matting via the Python sidecar.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db, uid, now, j, ASSET_DIR } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/webm': 'webm' };

export function saveAsset({ userId, worldId = null, kind, ownerRef = null, prompt = null, buffer, mime, meta = {} }) {
  const hash = createHash('sha256').update(kind).update(prompt || '').update(buffer.subarray(0, 256)).digest('hex').slice(0, 24);
  const id = uid('a_');
  const file = `${id}.${EXT[mime] || 'bin'}`;
  fs.writeFileSync(path.join(ASSET_DIR, file), buffer);
  db.prepare(`INSERT INTO assets(id,user_id,world_id,kind,owner_ref,prompt,prompt_hash,file,mime,meta,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, worldId, kind, ownerRef, prompt, hash, file, mime, j(meta), now());
  return getAsset(id);
}

export function importAssetFile({ userId, worldId = null, kind, ownerRef = null, prompt = null, filePath, mime, meta = {} }) {
  return saveAsset({ userId, worldId, kind, ownerRef, prompt, buffer: fs.readFileSync(filePath), mime, meta });
}

export function getAsset(id) { return db.prepare('SELECT * FROM assets WHERE id=?').get(id); }
export function assetPath(asset) { return path.join(ASSET_DIR, asset.file); }

export function findCached(kind, prompt, preferUserId = null) {
  // preferUserId: /api/assets/:id enforces per-user ownership, so when several users hold a
  // copy of the same cached clip, hand back the REQUESTER's own row first (tts_service
  // copies a cross-user hit exactly once — without this preference the copies ping-pong).
  if (preferUserId) return db.prepare('SELECT * FROM assets WHERE kind=? AND prompt=? ORDER BY (user_id=?) DESC, created_at DESC').get(kind, prompt || '', preferUserId);
  return db.prepare('SELECT * FROM assets WHERE kind=? AND prompt=? ORDER BY created_at DESC').get(kind, prompt || '');
}

// Run the proven Python chroma matte on a green-screen PNG buffer → RGBA cut-out buffer.
export function matte(buffer) {
  return new Promise((resolve, reject) => {
    const inFile = path.join(ASSET_DIR, `tmp_${uid()}.png`);
    const outFile = inFile.replace('.png', '_cut.png');
    fs.writeFileSync(inFile, buffer);
    const py = spawn('python3', [path.join(ROOT, 'scripts', 'matte.py'), inFile, outFile]);
    let err = '';
    py.stderr.on('data', d => err += d);
    py.on('close', code => {
      try {
        if (code !== 0) return reject(new Error('matte failed: ' + err.slice(0, 300)));
        const out = fs.readFileSync(outFile);
        resolve(out);
      } catch (e) { reject(e); }
      finally { fs.rmSync(inFile, { force: true }); fs.rmSync(outFile, { force: true }); }
    });
  });
}
