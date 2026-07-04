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
    <div class="admin-tabs">${['overview', 'users', 'models', 'mailbox', 'audit'].map(t => `<button class="${TAB === t ? 'active' : ''}" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div id="tabc"></div>
  </div>`;
  $('#alogout').onclick = async () => { await api('/admin/api/logout', { method: 'POST' }); loginScreen(); };
  $$('.admin-tabs button').forEach(b => b.onclick = () => { TAB = b.dataset.t; render(); });
  ({ overview, users, models, mailbox, audit })[TAB]();
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
