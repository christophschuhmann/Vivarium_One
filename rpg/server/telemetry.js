// Full-fidelity logging of every provider call (LLM, image, TTS, ASR) for later
// per-user analysis — separate from the credit ledger, which only tracks cost.
import { db, uid, now, j } from './db.js';

export function logCall({ userId, worldId = null, tickRef = null, kind, surface = null, request = null, response = null, assetId = null, provider = null, model = null, rawUsd = 0, meter = {}, meta = {} }) {
  db.prepare(`INSERT INTO provider_calls(id,user_id,world_id,tick_ref,kind,surface,request,response,asset_id,provider,model,raw_cost_usd,meter,meta,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid('pc_'), userId, worldId, tickRef, kind, surface, request != null ? j(request) : null, response != null ? j(response) : null,
      assetId, provider, model, rawUsd, j(meter), j(meta), now());
}
