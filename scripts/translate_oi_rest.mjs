import { db } from '../server/db.js';
import * as gm from '../server/gm.js';
const wid = 'w_ocdb1tauG8W-';
const user = db.prepare("SELECT * FROM users WHERE email='demo@vivarium.local'").get();
const w = db.prepare('SELECT * FROM worlds WHERE id=?').get(wid);
const idxs = db.prepare("SELECT idx, narration FROM ticks WHERE world_id=? AND seq IS NOT NULL ORDER BY idx").all(wid)
  .filter(t => { const n = JSON.parse(t.narration); return ['de','fr','es'].some(lg => !n.every(x => x.i18n?.[lg])); }).map(t => t.idx);
console.log('scenes needing work:', idxs.join(',') || 'none');
if (idxs.length) { const r = await gm.translateIntro(user, w, idxs, ['de','fr','es']); console.log('TRANSLATE DONE', JSON.stringify(r)); } else console.log('TRANSLATE DONE nothing');
