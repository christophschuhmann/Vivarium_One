/* Vivarium Operator Console */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts = {}) {
  // Only send a JSON Content-Type when there's actually a JSON body — Fastify's
  // JSON parser rejects an empty body sent with that header (e.g. bodyless POSTs
  // like logout).
  const hasJsonBody = opts.body != null;
  const res = await fetch(path, { headers: hasJsonBody ? { 'Content-Type': 'application/json' } : {}, credentials: 'same-origin', ...opts, body: hasJsonBody ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || res.statusText); e.code = data.error?.code; throw e; }
  return data;
}
function toast(msg, cls = '') { const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3600); }
const fail = (e) => toast(e.message, 'err');

let ADMIN = null, TAB = 'overview';

async function boot() {
  try { ADMIN = (await api('/admin/api/me')).admin; render(); }
  catch { loginScreen(); }
}
function loginScreen() {
  app.innerHTML = `<div id="auth-wrap"><div class="auth-card">
    <div class="logo-dot" style="background:linear-gradient(135deg,var(--gold),#c98a17)"></div>
    <h1>Operator Console</h1>
    <p class="serif" style="color:var(--soft);font-style:italic">Admins only beyond this point.</p>
    <div class="field" style="margin-top:16px"><input id="a-email" placeholder="admin email" value=""></div>
    <div class="field"><input id="a-pw" type="password" placeholder="password"></div>
    <div class="err" id="aerr"></div>
    <button class="btn btn-primary" style="width:100%;background:linear-gradient(180deg,#ffc45e,var(--gold) 55%,#c98a17);box-shadow:0 8px 18px rgba(240,169,46,.4)" id="ago">Enter the control room</button>
  </div></div>`;
  $('#ago').onclick = async () => {
    try { ADMIN = (await api('/admin/api/login', { method: 'POST', body: { email: $('#a-email').value, password: $('#a-pw').value } })).admin; render(); }
    catch (e) { $('#aerr').textContent = e.message; }
  };
  $('#a-pw').onkeydown = (e) => { if (e.key === 'Enter') $('#ago').click(); };
}

function render() {
  app.innerHTML = `
  <div id="topbar">
    <div class="glasschip"><div class="logo-dot" style="background:linear-gradient(135deg,var(--gold),#c98a17)"></div><div class="chip-title"><b>Vivarium · Operator</b><span>${esc(ADMIN.email)}</span></div></div>
    <button class="glasschip" id="alogout">Sign out</button>
  </div>
  <div class="admin-shell">
    <div class="admin-tabs">${['overview', 'users', 'models', 'context', 'prompts', 'mailbox', 'audit'].map(t => `<button class="${TAB === t ? 'active' : ''}" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div id="tabc"></div>
  </div>`;
  $('#alogout').onclick = async () => { await api('/admin/api/logout', { method: 'POST' }); loginScreen(); };
  $$('.admin-tabs button').forEach(b => b.onclick = () => { TAB = b.dataset.t; render(); });
  ({ overview, users, models, context, prompts, mailbox, audit })[TAB]();
}

async function overview() {
  const s = await api('/admin/api/stats').catch(e => { fail(e); return null; }); if (!s) return;
  const maxDay = Math.max(...s.byDay.map(d => d.spent), 1);
  $('#tabc').innerHTML = `
    <div class="stat-cards">
      <div class="stat"><b>${s.users}</b><br><small>players</small></div>
      <div class="stat"><b>${s.worlds}</b><br><small>worlds</small></div>
      <div class="stat"><b>${s.ticks}</b><br><small>ticks simulated</small></div>
      <div class="stat"><b>${s.spend.reduce((a, x) => a + x.credits, 0).toFixed(0)}</b><br><small>credits consumed</small></div>
      <div class="stat"><b>$${s.spend.reduce((a, x) => a + x.rawUsd, 0).toFixed(2)}</b><br><small>raw provider cost</small></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="panel"><b style="font-size:14px">Spend by feature</b>
        <table style="margin-top:10px"><tr><th>Reason</th><th>Calls</th><th>Credits</th><th>Raw $</th></tr>
        ${s.spend.map(x => `<tr><td>${esc(x.reason)}</td><td>${x.calls}</td><td>${x.credits.toFixed(1)}</td><td>$${x.rawUsd.toFixed(3)}</td></tr>`).join('') || '<tr><td colspan=4>No spend yet</td></tr>'}</table>
      </div>
      <div class="panel"><b style="font-size:14px">Last 14 days (credits)</b>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:7px">
          ${s.byDay.map(d => `<div style="display:flex;align-items:center;gap:9px;font-size:11px"><span style="width:70px;color:var(--soft)">${d.day.slice(5)}</span><div class="bar" style="flex:1"><div style="width:${(d.spent / maxDay * 100) | 0}%"></div></div><b style="width:46px;text-align:right">${d.spent.toFixed(1)}</b></div>`).join('') || '<small>quiet so far</small>'}
        </div>
        <b style="font-size:13px;display:block;margin-top:16px">Top spenders</b>
        ${s.topUsers.map(u => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(u.email)}</span><b>${u.credits.toFixed(1)}</b></div>`).join('') || '<small>—</small>'}
      </div>
    </div>
    <div class="panel" style="margin-top:16px"><b style="font-size:14px">Pricing policy</b>
      <div style="display:flex;gap:12px;align-items:center;margin-top:10px;font-size:12.5px;flex-wrap:wrap">
        markup ×<input id="p-markup" value="${s.pricing.markup}" style="width:60px;border:1px solid var(--line);border-radius:8px;padding:5px 8px">
        signup bonus <input id="p-bonus" value="${s.pricing.signup_bonus_credits}" style="width:70px;border:1px solid var(--line);border-radius:8px;padding:5px 8px"> cr
        default daily cap <input id="p-cap" value="${s.pricing.default_daily_cap_credits}" style="width:70px;border:1px solid var(--line);border-radius:8px;padding:5px 8px"> cr
        <button class="btn btn-soft small" id="p-save">Save</button>
      </div></div>`;
  $('#p-save').onclick = async () => {
    await api('/admin/api/pricing', { method: 'PATCH', body: { markup: +$('#p-markup').value, signup_bonus_credits: +$('#p-bonus').value, default_daily_cap_credits: +$('#p-cap').value } }).then(() => toast('Pricing updated')).catch(fail);
  };
}

async function users() {
  const draw = async (q = '') => {
    const { users } = await api('/admin/api/users?q=' + encodeURIComponent(q));
    $('#u-table').innerHTML = `<table><tr><th>User</th><th>Status</th><th>Credits</th><th>Daily cap</th><th>Lifetime spend</th><th>Worlds</th><th>Actions</th></tr>
      ${users.map(u => `<tr data-id="${u.id}">
        <td><b>${esc(u.displayName)}</b><br><small style="color:var(--soft)">${esc(u.email)}${u.role === 'admin' ? ' · <b style="color:#a86f0d">admin</b>' : ''}</small></td>
        <td>${u.status === 'active' ? (u.verified ? '<span class="tag t">active</span>' : '<span class="tag g">unverified</span>') : '<span class="tag c">suspended</span>'}</td>
        <td><b>${u.credits.toFixed(1)}</b></td><td>${u.dailyCap}</td><td>${u.lifetimeSpend.toFixed(1)}</td><td>${u.worlds}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-soft small" data-topup>+ credits</button>
          <button class="btn btn-ghost small" data-cap>cap</button>
          <button class="btn btn-ghost small" data-ledger>ledger</button>
          <button class="btn btn-ghost small" data-explore>🔍 data</button>
          ${u.role !== 'admin' ? `<button class="btn btn-ghost small" data-suspend>${u.status === 'active' ? 'suspend' : 'unsuspend'}</button>
          <button class="btn btn-ghost small" data-del title="delete">🗑</button>` : ''}
          ${!u.verified ? '<button class="btn btn-ghost small" data-verify>verify</button>' : ''}
        </td></tr>`).join('')}</table>`;
    $$('#u-table tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      const u = users.find(x => x.id === id);
      const rt = $('[data-rating]', tr);
      if (rt) rt.onclick = async () => {
        const next = u.rating === 'teen' ? 'adult' : 'teen';
        if (!confirm(`Switch ${u.email} to a ${next.toUpperCase()} account?${next === 'teen' ? ' Stories become PG (explicit content fades to black).' : ' Stories become adult-rated.'}`)) return;
        await api(`/admin/api/users/${id}`, { method: 'PATCH', body: { rating: next } }).then(() => { toast(`${u.email} → ${next}`); draw($('#u-q').value); }).catch(fail);
      };
      $('[data-topup]', tr).onclick = async () => {
        const amt = prompt(`Credits to grant to ${u.email} (negative to revoke):`, '100'); if (!amt) return;
        const reason = prompt('Reason (for the audit log):', 'manual top-up') || '';
        try { const r = await api(`/admin/api/users/${id}/credits`, { method: 'POST', body: { credits: +amt, reason } }); toast(`New balance: ${r.newBalance.toFixed(1)} cr`, 'gold'); draw($('#u-q').value); } catch (e) { fail(e); }
      };
      $('[data-cap]', tr).onclick = async () => {
        const cap = prompt('New daily cap (credits):', String(u.dailyCap)); if (!cap) return;
        await api(`/admin/api/users/${id}`, { method: 'PATCH', body: { dailyCapCredits: +cap } }).then(() => draw($('#u-q').value)).catch(fail);
      };
      $('[data-ledger]', tr).onclick = async () => {
        const { ledger } = await api(`/admin/api/users/${id}/ledger`);
        const m = document.createElement('div'); m.className = 'modal-bg';
        m.innerHTML = `<div class="modal" style="width:640px"><div class="modal-head violet"><div><b>Ledger — ${esc(u.email)}</b><small>every billable call & grant</small></div><span class="x">✕</span></div>
          <div class="modal-body" style="max-height:60vh;overflow-y:auto"><table><tr><th>When</th><th>Reason</th><th>Model</th><th>Credits</th><th>Raw $</th><th>Meter</th></tr>
          ${ledger.map(l => `<tr><td>${l.at.slice(5, 16).replace('T', ' ')}</td><td>${esc(l.reason)}</td><td>${esc(l.model || '—')}</td><td style="color:${l.credits < 0 ? '#d92e66' : '#0d9463'}"><b>${l.credits > 0 ? '+' : ''}${l.credits.toFixed(2)}</b></td><td>${l.rawUsd ? '$' + l.rawUsd.toFixed(4) : '—'}</td><td style="font-size:10px;color:var(--soft)">${esc(JSON.stringify(l.meter)).slice(0, 60)}</td></tr>`).join('')}</table></div></div>`;
        document.body.appendChild(m); m.onclick = (e) => { if (e.target === m) m.remove(); }; $('.x', m).onclick = () => m.remove();
      };
      $('[data-explore]', tr).onclick = () => dataExplorerModal(id, u);
      const susBtn = $('[data-suspend]', tr); if (susBtn) susBtn.onclick = async () => {
        await api(`/admin/api/users/${id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'suspended' : 'active' } }).then(() => draw($('#u-q').value)).catch(fail);
      };
      const delBtn = $('[data-del]', tr); if (delBtn) delBtn.onclick = async () => {
        if (confirm(`Really DELETE ${u.email} and all their worlds & assets?`)) await api(`/admin/api/users/${id}`, { method: 'DELETE' }).then(() => draw($('#u-q').value)).catch(fail);
      };
      const verBtn = $('[data-verify]', tr); if (verBtn) verBtn.onclick = async () => {
        await api(`/admin/api/users/${id}`, { method: 'PATCH', body: { verify: true } }).then(() => draw($('#u-q').value)).catch(fail);
      };
    });
  };
  $('#tabc').innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">
      <div class="field" style="flex:1;max-width:340px"><input id="u-q" placeholder="Search by email or name…"></div>
      <button class="btn btn-primary small" id="u-new">+ Create user</button>
    </div><div id="u-table"></div>`;
  $('#u-q').oninput = () => draw($('#u-q').value);
  $('#u-new').onclick = async () => {
    const email = prompt('New user email:'); if (!email) return;
    const name = prompt('Display name:', email.split('@')[0]) || 'New player';
    const pw = prompt('Initial password (they can change later):', 'welcome-' + Math.random().toString(36).slice(2, 8));
    try { await api('/admin/api/users', { method: 'POST', body: { email, password: pw, displayName: name, preVerified: true } }); toast('User created — tell them their password: ' + pw, 'gold'); draw(); } catch (e) { fail(e); }
  };
  draw();
}

async function dataExplorerModal(userId, u) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:900px;max-height:88vh"><div class="modal-head violet">
    <div><b>🔍 Everything ${esc(u.email)} has generated</b><small>provider calls, conversations, worlds & assets — for analysis or export</small></div><span class="x">✕</span></div>
    <div class="modal-body" style="max-height:74vh;overflow-y:auto">
      <div id="de-summary" class="stat-cards"></div>
      <div class="admin-tabs" id="de-tabs" style="margin:14px 0">
        ${['calls', 'chats', 'worlds'].map((t, i) => `<button class="${i === 0 ? 'active' : ''}" data-dt="${t}">${{ calls: 'Provider calls', chats: 'Conversations', worlds: 'Worlds & assets' }[t]}</button>`).join('')}
      </div>
      <div id="de-body"></div>
      <div style="display:flex;gap:9px;margin-top:16px">
        <a class="btn btn-primary small" href="/admin/api/users/${userId}/export" target="_blank">⬇ Export all as JSON</a>
        <span style="font-size:11px;color:var(--soft);align-self:center">Full structured dump — worlds, ticks, prompts, responses, ledger, assets refs. Safe to move to another server for analysis.</span>
      </div>
    </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();

  const { counts, worlds, assets, chatTurns } = await api(`/admin/api/users/${userId}/summary`);
  const callTotal = counts.reduce((a, c) => a + c.n, 0);
  const usdTotal = counts.reduce((a, c) => a + (c.usd || 0), 0);
  $('#de-summary', m).innerHTML = `
    <div class="stat"><b>${callTotal}</b><br><small>provider calls logged</small></div>
    <div class="stat"><b>$${usdTotal.toFixed(3)}</b><br><small>raw cost, all time</small></div>
    <div class="stat"><b>${worlds.length}</b><br><small>worlds</small></div>
    <div class="stat"><b>${chatTurns}</b><br><small>chat turns (Forge/Populate)</small></div>
    ${counts.map(c => `<div class="stat"><b>${c.n}</b><br><small>${esc(c.kind)} calls</small></div>`).join('')}`;

  let dtab = 'calls';
  const drawTab = async () => {
    $$('#de-tabs button', m).forEach(b => b.classList.toggle('active', b.dataset.dt === dtab));
    if (dtab === 'calls') {
      const KINDS = ['', 'llm', 'image', 'tts', 'asr', 'video'];
      $('#de-body', m).innerHTML = `<div style="display:flex;gap:6px;margin-bottom:10px">${KINDS.map(k => `<span class="tag ${k === '' ? 'v' : 'grey'}" data-kf="${k}" style="cursor:pointer">${k || 'all'}</span>`).join('')}</div><div id="de-calls"></div>`;
      const drawCalls = async (kind) => {
        const { calls } = await api(`/admin/api/users/${userId}/calls${kind ? '?kind=' + kind : ''}`);
        $('#de-calls', m).innerHTML = `<table><tr><th>When</th><th>Kind</th><th>Surface</th><th>Model</th><th>$</th><th>Request</th><th>Response</th><th></th></tr>
          ${calls.map(c => `<tr><td>${c.created_at.slice(5, 16).replace('T', ' ')}</td><td><span class="tag t">${esc(c.kind)}</span></td><td>${esc(c.surface || '—')}</td>
            <td style="font-size:10.5px">${esc(c.model || '—')}</td><td>${c.raw_cost_usd ? '$' + c.raw_cost_usd.toFixed(4) : '—'}</td>
            <td style="font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.request_preview)}">${esc(c.request_preview || '')}</td>
            <td style="font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.response_preview)}">${esc(c.response_preview || '')}</td>
            <td><button class="btn btn-ghost small" data-fullcall="${c.id}" style="padding:2px 8px">view</button>${c.asset_id ? `<a class="btn btn-ghost small" href="/admin/api/assets/${c.asset_id}" target="_blank" style="padding:2px 8px">asset</a>` : ''}</td></tr>`).join('') || '<tr><td colspan=8>Nothing yet</td></tr>'}</table>`;
        $$('[data-fullcall]', m).forEach(b => b.onclick = async () => {
          const { call } = await api(`/admin/api/calls/${b.dataset.fullcall}`);
          const fm = document.createElement('div'); fm.className = 'modal-bg';
          fm.innerHTML = `<div class="modal" style="width:760px"><div class="modal-head coral"><div><b>${esc(call.kind)} · ${esc(call.surface || '')}</b><small>${esc(call.created_at)}</small></div><span class="x">✕</span></div>
            <div class="modal-body" style="max-height:70vh;overflow-y:auto">
              <b style="font-size:12px">Request</b><pre style="background:#f6f4fd;border-radius:10px;padding:10px;font-size:11px;white-space:pre-wrap;max-height:220px;overflow-y:auto">${esc(JSON.stringify(call.request, null, 1))}</pre>
              <b style="font-size:12px">Response</b><pre style="background:#f6f4fd;border-radius:10px;padding:10px;font-size:11px;white-space:pre-wrap;max-height:220px;overflow-y:auto">${esc(JSON.stringify(call.response, null, 1))}</pre>
              ${call.asset_id ? `<a class="btn btn-soft small" href="/admin/api/assets/${call.asset_id}" target="_blank">⬇ Open generated asset</a>` : ''}
            </div></div>`;
          document.body.appendChild(fm); fm.onclick = (e) => { if (e.target === fm) fm.remove(); }; $('.x', fm).onclick = () => fm.remove();
        });
      };
      $$('[data-kf]', m).forEach(t => t.onclick = () => { $$('[data-kf]', m).forEach(x => x.className = 'tag grey'); t.className = 'tag v'; drawCalls(t.dataset.kf); });
      drawCalls('');
    } else if (dtab === 'chats') {
      const { logs } = await api(`/admin/api/users/${userId}/chatlogs`);
      $('#de-body', m).innerHTML = `<table><tr><th>When</th><th>Surface</th><th>Role</th><th>Content</th></tr>
        ${logs.map(l => `<tr><td>${l.created_at.slice(5, 16).replace('T', ' ')}</td><td>${esc(l.surface)}</td><td><span class="tag ${l.role === 'user' ? 'v' : 't'}">${esc(l.role)}</span></td><td style="font-size:11.5px">${esc(l.content)}</td></tr>`).join('') || '<tr><td colspan=4>No conversations yet</td></tr>'}</table>`;
    } else if (dtab === 'worlds') {
      $('#de-body', m).innerHTML = `<table><tr><th>World</th><th>Ticks</th><th>Status</th><th>Created</th></tr>
        ${worlds.map(w => `<tr><td><b>${esc(w.title)}</b></td><td>${w.tick_index}</td><td>${esc(w.status)}</td><td>${w.created_at.slice(0, 10)}</td></tr>`).join('') || '<tr><td colspan=4>No worlds yet</td></tr>'}</table>
        <b style="font-size:13px;display:block;margin:14px 0 6px">Assets</b>
        <table><tr><th>Kind</th><th>Count</th></tr>${assets.map(a => `<tr><td>${esc(a.kind)}</td><td>${a.n}</td></tr>`).join('') || '<tr><td colspan=2>None</td></tr>'}</table>`;
    }
  };
  $$('#de-tabs button', m).forEach(b => b.onclick = () => { dtab = b.dataset.dt; drawTab(); });
  drawTab();
}

async function models() {
  const { routes, ttsProvider } = await api('/admin/api/model-routes');
  $('#tabc').innerHTML = `
    <!-- TTS engine switch: Gemini (prebuilt voices) vs LAIONBox (self-hosted voice cloning).
         Switching to LAIONBox health-probes the box first (server-side) and changes the whole
         player experience: characters then need reference-voice clips instead of voice names. -->
    <div class="panel" style="margin-bottom:14px"><b style="font-size:14px">🔊 TTS engine</b>
      <p style="font-size:12px;color:var(--soft)">Which speech engine the game uses. <b>Gemini</b>: 30 prebuilt voices, hosted. <b>LAIONBox</b>: self-hosted expressive voice-acting model — every character gets a <i>cloned reference voice</i> (generated from a description or uploaded by the player); lines run raw → Chatterbox voice-conversion → Sidon restoration.</p>
      <div style="display:flex;gap:9px;margin-top:8px">
        <button class="btn ${ttsProvider === 'gemini' ? 'btn-primary' : 'btn-soft'} small" data-prov="gemini">Gemini TTS ${ttsProvider === 'gemini' ? '· active' : ''}</button>
        <button class="btn ${ttsProvider === 'laionbox' ? 'btn-primary' : 'btn-soft'} small" data-prov="laionbox">LAIONBox TTS ${ttsProvider === 'laionbox' ? '· active' : ''}</button>
      </div>
    </div>
    <div class="panel"><b style="font-size:14px">Model & endpoint registry</b>
    <p style="font-size:12px;color:var(--soft)">Swap a model or change unit costs without a deploy. Keys stay server-side (referenced by env name).</p>
    <!-- One-click presets for the reasoning_llm row: every HyprLab chat model speaks the same
         /v1/chat/completions format (verified live for all three), so switching = model string
         + unit costs. Prices are HyprLab's discounted per-1M-token rates as of 2026-07-04;
         pasting any other model id into the row directly also works — same format. -->
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:4px 0 10px">
      <span style="font-size:11.5px;color:var(--soft)">LLM presets:</span>
      ${[
        { m: 'gemini-3.5-flash', cost: { in_per_mtok: 0.75, out_per_mtok: 4.5 } },
        { m: 'glm-5.2', cost: { in_per_mtok: 0.7, out_per_mtok: 2.2 } },
        { m: 'claude-sonnet-5', cost: { in_per_mtok: 1.8, out_per_mtok: 9 } },
      ].map(p => `<button class="btn btn-soft small" data-preset="${p.m}" data-cost='${JSON.stringify(p.cost)}' style="padding:3px 10px;font-size:11.5px">${p.m}</button>`).join('')}
    </div>
    <table style="margin-top:8px"><tr><th>Role</th><th>Model</th><th>Base URL</th><th>Unit costs</th><th>Enabled</th><th></th></tr>
    ${routes.map(r => `<tr data-role="${r.role}">
      <td><b>${esc(r.role)}</b></td>
      <td><input value="${esc(r.model)}" data-f="model" style="width:170px;border:1px solid var(--line);border-radius:8px;padding:4px 8px"></td>
      <td><input value="${esc(r.base_url)}" data-f="base" style="width:220px;border:1px solid var(--line);border-radius:8px;padding:4px 8px"></td>
      <td><input value='${esc(JSON.stringify(r.unit_cost))}' data-f="cost" style="width:220px;border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-family:monospace;font-size:11px"></td>
      <td><input type="checkbox" ${r.enabled ? 'checked' : ''} data-f="on"></td>
      <td><button class="btn btn-soft small" data-save>Save</button></td></tr>`).join('')}</table></div>`;
  // LLM presets: fill the reasoning_llm row's model + unit-cost fields and save immediately
  $$('#tabc [data-preset]').forEach(b => b.onclick = async () => {
    const tr = $('#tabc tr[data-role="reasoning_llm"]');
    if (!tr) return;
    $('[data-f=model]', tr).value = b.dataset.preset;
    $('[data-f=cost]', tr).value = b.dataset.cost;
    try {
      await api(`/admin/api/model-routes/reasoning_llm`, { method: 'PATCH', body: {
        model: b.dataset.preset, baseUrl: $('[data-f=base]', tr).value,
        unitCost: JSON.parse(b.dataset.cost), enabled: $('[data-f=on]', tr).checked } });
      toast('LLM → ' + b.dataset.preset, 'gold');
    } catch (e) { fail(e); }
  });
  // provider switch — server validates LAIONBox health before accepting
  $$('#tabc [data-prov]').forEach(b => b.onclick = async () => {
    try {
      const r = await api('/admin/api/tts-provider', { method: 'PATCH', body: { provider: b.dataset.prov } });
      toast('TTS engine: ' + r.ttsProvider, 'gold');
      models();
    } catch (e) { fail(e); }
  });
  $$('#tabc tr[data-role]').forEach(tr => {
    $('[data-save]', tr).onclick = async () => {
      try {
        await api(`/admin/api/model-routes/${tr.dataset.role}`, { method: 'PATCH', body: {
          model: $('[data-f=model]', tr).value, baseUrl: $('[data-f=base]', tr).value,
          unitCost: JSON.parse($('[data-f=cost]', tr).value), enabled: $('[data-f=on]', tr).checked } });
        toast('Route saved');
      } catch (e) { fail(e); }
    };
  });
}

/* ── Context / memory tuning page ──────────────────────────────────────────────
   Shows how the per-tick LLM context is built (part-by-part token breakdown for a
   chosen world), the real average tokens per tick from the usage ledger, and the
   hierarchical-compression status — plus editable knobs (how many recent ticks stay
   verbatim, chunk size, token budget, compression ratio) that take effect on the
   very next tick (server/gm.js ctxConfig reads them live). */
async function context() {
  const d = await api('/admin/api/context');
  const c = d.config;
  const fmt = n => n.toLocaleString();
  $('#tabc').innerHTML = `
    <!-- knobs: written to settings.context_config; gm.js reads them live, no restart -->
    <div class="panel"><b style="font-size:14px">🧠 Context & memory parameters</b>
      <p style="font-size:12px;color:var(--soft)">How the Game Master's per-tick context is assembled. Changes apply on the next tick — no restart.</p>
      <div style="display:grid;grid-template-columns:1fr;gap:16px;margin-top:12px;max-width:640px">
        <label><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600">Recent ticks kept VERBATIM <span><input id="cx-tw-n" type="number" min="2" max="500" value="${c.tickWindow}" style="width:70px;border:1px solid var(--line);border-radius:8px;padding:3px 7px;text-align:right"></span></div>
          <input id="cx-tw" type="range" min="2" max="200" value="${Math.min(200, c.tickWindow)}" style="width:100%">
          <div style="font-size:11px;color:var(--soft)">The last N ticks stay word-for-word in context. Older ones get summarised. Higher = better memory, more tokens/cost. <b>Default 50.</b></div></label>
        <label><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600">Summary chunk size <span><input id="cx-mc" type="number" min="2" max="50" value="${c.memChunk}" style="width:70px;border:1px solid var(--line);border-radius:8px;padding:3px 7px;text-align:right"></span></div>
          <div style="font-size:11px;color:var(--soft)">Ticks folded into ONE level-1 summary — and how many same-level summaries collapse into the next level up.</div></label>
        <label><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600">Context token budget <span><input id="cx-cb" type="number" min="10000" step="10000" value="${c.contextBudget}" style="width:100px;border:1px solid var(--line);border-radius:8px;padding:3px 7px;text-align:right"></span></div>
          <div style="font-size:11px;color:var(--soft)">Hard ceiling (~chars/4). While the assembled context exceeds this, the oldest summaries compact a level up.</div></label>
        <label><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600">Compression ratio <span id="cx-cr-v">${Math.round(c.compressionRatio * 100)}%</span></div>
          <input id="cx-cr" type="range" min="0.2" max="0.9" step="0.05" value="${c.compressionRatio}" style="width:100%">
          <div style="font-size:11px;color:var(--soft)">Target length of each summary vs its source. Lower = more aggressive compression.</div></label>
      </div>
      <button class="btn btn-primary small" id="cx-save" style="margin-top:14px">Save parameters</button>
      <span id="cx-saved" style="font-size:12px;color:#0d9463;margin-left:10px"></span>
    </div>

    ${d.usage ? `<div class="panel" style="margin-top:14px"><b style="font-size:14px">📊 Real tokens per tick</b>
      <p style="font-size:12px;color:var(--soft)">API-reported usage across the last ${d.usage.samples} ticks (all worlds).</p>
      <div style="display:flex;gap:20px;margin-top:8px">
        <div><div style="font-size:22px;font-weight:700;color:var(--violet)">${fmt(d.usage.avgInput)}</div><small style="color:var(--soft)">avg input tokens</small></div>
        <div><div style="font-size:22px;font-weight:700;color:var(--teal)">${fmt(d.usage.avgOutput)}</div><small style="color:var(--soft)">avg output tokens</small></div>
        <div><div style="font-size:22px;font-weight:700">${fmt(d.usage.avgTotal)}</div><small style="color:var(--soft)">avg total / tick</small></div>
      </div></div>` : ''}

    <div class="panel" style="margin-top:14px"><b style="font-size:14px">🔍 Next-tick context breakdown</b>
      <p style="font-size:12px;color:var(--soft)">Estimated tokens (~chars/4) for the world's very next tick. The real tokenizer runs ~25-30% higher.</p>
      <select id="cx-world" style="margin-top:6px;border:1px solid var(--line);border-radius:9px;padding:6px 9px;background:#fff;max-width:100%">
        ${d.worlds.map(w => `<option value="${w.id}">${esc(w.title)} — tick ${w.tick_index} · ${esc(w.email)}</option>`).join('')}
      </select>
      <div id="cx-breakdown" style="margin-top:12px"></div>
    </div>

    <div class="panel" style="margin-top:14px"><b style="font-size:14px">📖 How the memory compression works</b>
      <div style="font-size:12.5px;color:#3c3763;line-height:1.65;margin-top:6px">
        <p><b>1. Verbatim window.</b> The most recent <b>${c.tickWindow}</b> ticks are always in context word-for-word — full narration, character end-states, interventions. This is the GM's short-term memory.</p>
        <p style="margin-top:8px"><b>2. Rolling summarisation.</b> Once a tick falls outside that window, it waits until a full group of <b>${c.memChunk}</b> such ticks has accumulated, then those ${c.memChunk} are rewritten as one <i>level-1 summary</i> (past-tense prose at ~${Math.round(c.compressionRatio * 100)}% length, keeping events, decisions, emotional beats, and where everyone ended up).</p>
        <p style="margin-top:8px"><b>3. Hierarchical compaction.</b> Only if the whole assembled context still exceeds the <b>${fmt(c.contextBudget)}</b>-token budget, the ${c.memChunk} oldest same-level summaries collapse into one summary a level up (again ~${Math.round(c.compressionRatio * 100)}%). This repeats — level 2, 3, … — so ancient history keeps shrinking while recent events stay sharp. A world could run thousands of ticks and still fit.</p>
        <p style="margin-top:8px"><b>Per-branch.</b> Each timeline branch keeps its own memory; undo/redo/branching never mix histories. Everything runs in the background right after each tick.</p>
        <p style="margin-top:8px"><b>Character state is git-like.</b> Every character carries an accumulated <code>attributes</code> working-tree (conditions, beliefs, goals, skills…) built from per-tick <code>state_patches</code>. A change on tick 12 persists to tick 40 unless a later patch removes it — the full patch history is the append-only "git log", the attributes tree is the current "working copy". It carries through undo/branch with the rest of the state.</p>
      </div>
    </div>`;

  // sliders ↔ number boxes stay in sync
  const twR = $('#cx-tw'), twN = $('#cx-tw-n');
  twR.oninput = () => { twN.value = twR.value; };
  twN.oninput = () => { twR.value = Math.min(200, +twN.value || 2); };
  const cr = $('#cx-cr'); cr.oninput = () => { $('#cx-cr-v').textContent = Math.round(+cr.value * 100) + '%'; };

  $('#cx-save').onclick = async () => {
    try {
      const r = await api('/admin/api/context', { method: 'PATCH', body: {
        tickWindow: +twN.value, memChunk: +$('#cx-mc').value,
        contextBudget: +$('#cx-cb').value, compressionRatio: +cr.value } });
      $('#cx-saved').textContent = 'saved ✓ — applies next tick';
      setTimeout(() => { $('#cx-saved').textContent = ''; }, 3000);
      loadBreakdown();  // refresh the breakdown with the new window
    } catch (e) { fail(e); }
  };

  const loadBreakdown = async () => {
    const wid = $('#cx-world').value;
    if (!wid) { $('#cx-breakdown').innerHTML = '<small style="color:var(--soft)">No worlds yet.</small>'; return; }
    $('#cx-breakdown').innerHTML = '<small style="color:var(--soft)">loading…</small>';
    try {
      const b = await api(`/admin/api/context/${wid}`);
      const labels = { system_prompt: 'System prompt (schema + rules)', characters: 'Characters (profiles + git-like state)', locations: 'Locations', relationships: 'Relationships', recent_ticks_verbatim: `Recent ticks verbatim (${b.windowTicks} in window)`, long_term_memory: 'Long-term memory (summaries)', wrappers_clock: 'Clock + intervention + wrappers' };
      const max = Math.max(...Object.values(b.parts));
      $('#cx-breakdown').innerHTML = `
        <table style="width:100%"><tr><th>Part</th><th style="text-align:right">~tokens</th><th style="width:40%">share</th></tr>
        ${Object.entries(b.parts).sort((a, x) => x[1] - a[1]).map(([k, v]) => `<tr>
          <td>${esc(labels[k] || k)}</td><td style="text-align:right">${fmt(v)}</td>
          <td><div style="height:9px;background:var(--tint);border-radius:5px"><div style="height:100%;width:${Math.round(100 * v / max)}%;background:var(--violet);border-radius:5px"></div></div></td></tr>`).join('')}
        <tr style="font-weight:700"><td>TOTAL (estimated)</td><td style="text-align:right">${fmt(b.estTotalTokens)}</td><td style="font-size:11px;color:var(--soft)">${b.budgetUsedPct}% of ${fmt(b.budget)} budget</td></tr>
        </table>
        <div style="font-size:12px;color:#3c3763;margin-top:10px">
          <b>${b.world.lineage_length}</b> ticks on this branch · <b>${b.compression.summarised_ticks}</b> already summarised · <b>${b.memoryChunks.length}</b> memory chunk${b.memoryChunks.length === 1 ? '' : 's'}${b.memoryChunks.length ? ` (levels ${[...new Set(b.memoryChunks.map(m => m.level))].join(', ')})` : ''}.
          ${b.compression.ticks_until_next_summary === 0 ? ' A summary is due on the next maintenance pass.' : ` Next summary in ~<b>${b.compression.ticks_until_next_summary}</b> tick(s).`}
          ${b.compression.will_compact ? ' <span style="color:#d92e66">Over budget — chunks will compact.</span>' : ''}
        </div>`;
    } catch (e) { $('#cx-breakdown').innerHTML = `<small style="color:#d92e66">${esc(e.message)}</small>`; }
  };
  $('#cx-world').onchange = loadBreakdown;
  loadBreakdown();
}

/* ── Prompts page: full transparency into every template sent to the models, plus an
   editor for the storytelling core block injected into every tick's system prompt. ── */
async function prompts() {
  const d = await api('/admin/api/prompts');
  const pre = (t) => `<pre style="white-space:pre-wrap;background:var(--ink);color:#dcd6ff;border-radius:12px;padding:12px 14px;font-size:11.5px;line-height:1.5;max-height:340px;overflow:auto">${esc(t || '(none yet)')}</pre>`;
  $('#tabc').innerHTML = `
    <div class="panel"><b style="font-size:14px">✍️ Storytelling core (editable)</b>
      <p style="font-size:12px;color:var(--soft)">Injected into EVERY tick's system prompt. Applies on the next tick — no restart. Clear the box and save to return to the built-in default.</p>
      <textarea id="pr-core" rows="10" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:monospace;font-size:12px;margin-top:8px">${esc(d.gmCore.current)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="btn btn-primary small" id="pr-save">Save</button>
        <button class="btn btn-ghost small" id="pr-reset">↺ Reset to default</button>
        <span id="pr-msg" style="font-size:12px;color:#0d9463"></span>
        ${d.gmCore.customised ? '<span class="tag g">customised</span>' : '<span class="tag grey">default</span>'}
      </div>
    </div>

    <div class="panel" style="margin-top:14px"><b style="font-size:14px">🎙 TTS delivery templates (read-only)</b>
      <p style="font-size:12px;color:var(--soft)">The two engines get OPPOSITE coaching. These are the defaults; players can override per-browser in Account → Voice.</p>
      <h5 style="margin:10px 0 4px;color:var(--violet);font-size:11px;letter-spacing:.08em">GEMINI — ${esc(d.tts.gemini.note)}</h5>
      <b style="font-size:12px">Narrator</b>${pre(d.tts.gemini.narrator)}
      <b style="font-size:12px">Character</b>${pre(d.tts.gemini.character)}
      <h5 style="margin:12px 0 4px;color:var(--teal);font-size:11px;letter-spacing:.08em">LAIONBOX — ${esc(d.tts.laionbox.note)}</h5>
      <b style="font-size:12px">Narrator</b>${pre(d.tts.laionbox.narrator)}
      <b style="font-size:12px">Character</b>${pre(d.tts.laionbox.character)}
      <b style="font-size:12px">Thought suffix (both engines)</b>${pre(d.tts.thoughtSuffix)}
    </div>

    <div class="panel" style="margin-top:14px"><b style="font-size:14px">🧾 The most recent REAL tick prompt (from telemetry)</b>
      <p style="font-size:12px;color:var(--soft)">Exactly what was sent on the last tick — zero documentation drift. The user message is previewed (first 4000 chars).</p>
      <b style="font-size:12px">System prompt</b>${pre(d.lastTick.system)}
      <b style="font-size:12px">User message (preview)</b>${pre(d.lastTick.userPreview)}
    </div>`;
  $('#pr-save').onclick = async () => {
    try {
      await api('/admin/api/prompts', { method: 'PATCH', body: { gmCore: $('#pr-core').value } });
      $('#pr-msg').textContent = 'saved ✓ — applies next tick';
      setTimeout(() => $('#pr-msg').textContent = '', 3000);
    } catch (e) { fail(e); }
  };
  $('#pr-reset').onclick = async () => {
    try {
      const r = await api('/admin/api/prompts', { method: 'PATCH', body: { gmCore: '' } });
      $('#pr-core').value = r.gmCore.current;
      $('#pr-msg').textContent = 'reset to default ✓';
      setTimeout(() => $('#pr-msg').textContent = '', 3000);
    } catch (e) { fail(e); }
  };
}

async function mailbox() {
  const { mailbox } = await api('/admin/api/mailbox');
  $('#tabc').innerHTML = `<div class="panel"><b style="font-size:14px">Dev mailbox</b>
    <p style="font-size:12px;color:var(--soft)">No SMTP configured — verification emails land here so you can onboard users by hand.</p>
    <table style="margin-top:8px"><tr><th>When</th><th>To</th><th>Subject</th><th>Code</th></tr>
    ${mailbox.map(m => `<tr><td>${m.at.slice(5, 16).replace('T', ' ')}</td><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td><b style="font-size:15px;letter-spacing:.15em">${esc(m.code || '—')}</b></td></tr>`).join('') || '<tr><td colspan=4>Empty</td></tr>'}</table></div>`;
}

async function audit() {
  const { audit } = await api('/admin/api/audit');
  $('#tabc').innerHTML = `<div class="panel"><b style="font-size:14px">Audit log</b>
    <table style="margin-top:8px"><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Payload</th></tr>
    ${audit.map(a => `<tr><td>${a.created_at.slice(5, 16).replace('T', ' ')}</td><td>${esc(a.admin_id.slice(0, 10))}</td><td><b>${esc(a.action)}</b></td><td>${esc(a.target || '')}</td><td style="font-size:10.5px;color:var(--soft)">${esc(JSON.stringify(a.payload)).slice(0, 80)}</td></tr>`).join('') || '<tr><td colspan=5>Nothing yet</td></tr>'}</table></div>`;
}

boot();
