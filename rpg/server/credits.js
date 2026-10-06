// Credit accounting: append-only ledger, atomic balance updates, guardrails.
// 1 credit = 1_000_000 micro-credits. 100 credits ≈ $1 retail (markup over raw).
import { db, uid, now, j, getSetting } from './db.js';

export const MICRO = 1_000_000;
export const toMicro = (credits) => Math.round(credits * MICRO);
export const toCredits = (micro) => micro / MICRO;

export function usdToMicro(rawUsd) {
  const p = getSetting('pricing');
  return Math.ceil(rawUsd * p.markup * p.credits_per_usd * MICRO);
}

export class CreditError extends Error {
  constructor(code, message) { super(message); this.code = code; this.statusCode = 402; }
}

export function balance(userId) {
  return db.prepare('SELECT credit_balance FROM users WHERE id=?').get(userId)?.credit_balance ?? 0;
}

export function spentToday(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const r = db.prepare(`SELECT COALESCE(SUM(-delta),0) s FROM credit_ledger WHERE user_id=? AND delta<0 AND created_at>=?`)
    .get(userId, start.toISOString());
  return r.s;
}

// Throws if the user cannot afford an action estimated at estMicro.
export function preflight(userId, estMicro) {
  const u = db.prepare('SELECT credit_balance, daily_cap, status FROM users WHERE id=?').get(userId);
  if (!u) throw new CreditError('NO_USER', 'user not found');
  if (u.status !== 'active') throw new CreditError('SUSPENDED', 'account suspended');
  if (u.credit_balance < estMicro) throw new CreditError('INSUFFICIENT_CREDITS', `Not enough credits — this needs ~${Math.ceil(toCredits(estMicro))} and you have ${Math.floor(toCredits(u.credit_balance))}. Ask your admin for a top-up.`);
  if (spentToday(userId) + estMicro > u.daily_cap) throw new CreditError('DAILY_CAP', 'Daily spend cap reached — try again tomorrow or ask your admin to raise it.');
}

const applyTx = db.transaction((userId, delta, row) => {
  db.prepare(`INSERT INTO credit_ledger(id,user_id,world_id,tick_ref,delta,reason,provider,model,raw_cost_usd,meter,created_by,created_at)
              VALUES (@id,@user_id,@world_id,@tick_ref,@delta,@reason,@provider,@model,@raw_cost_usd,@meter,@created_by,@created_at)`).run(row);
  db.prepare('UPDATE users SET credit_balance = credit_balance + ? WHERE id=?').run(delta, userId);
});

export function record(userId, { delta, reason, provider = null, model = null, rawUsd = 0, meter = {}, worldId = null, tickRef = null, createdBy = 'system' }) {
  const row = {
    id: uid('lg_'), user_id: userId, world_id: worldId, tick_ref: tickRef,
    delta, reason, provider, model, raw_cost_usd: rawUsd, meter: j(meter),
    created_by: createdBy, created_at: now(),
  };
  applyTx(userId, delta, row);
  return row;
}

// Debit for a completed provider call (rawUsd measured).
export function debitCall(userId, callResult, reason, ctx = {}) {
  const micro = usdToMicro(callResult.rawUsd || 0);
  record(userId, { delta: -micro, reason, provider: callResult.provider, model: callResult.model, rawUsd: callResult.rawUsd || 0, meter: callResult.meter || callResult.usage || {}, ...ctx });
  return micro;
}

// Rough pre-flight estimates in micro-credits
export const EST = {
  tick: () => usdToMicro(0.03),
  image: () => usdToMicro(0.025),
  tts: () => usdToMicro(0.006),
  asr: () => usdToMicro(0.002),
  chat: () => usdToMicro(0.01),
};
