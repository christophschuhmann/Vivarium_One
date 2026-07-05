/* Vivarium SPA — no build step, design per Screen Design Guide. */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = { user: null, world: null, worldData: null, forge: { history: [], draft: null, portraitId: null, cutoutId: null, busy: false } };

/* ───────── i18n ─────────────────────────────────────────────────────────────
   UI language for the app chrome (EN default; DE/FR/ES). Two distinct concerns:
     1. UI STRINGS — looked up via t('key'); the dictionary below covers the main
        surfaces (dock, auth, home, stage controls, share, settings). Untranslated
        keys fall back to English, so partial coverage degrades gracefully.
     2. GAME LANGUAGE — the SAME preference is sent with every tick / forge call
        (`lang` in the request body); the Game Master then writes all narration,
        dialogue and thoughts in that language (see server/gm.js LANGUAGE rule).
        Under LAIONBox TTS the DramaBox instruction stays English while the quoted
        spoken text is whatever language the narration was written in — that is
        exactly the prompt convention the model expects (see laionbox-tts.txt).
   Preference persists in localStorage 'viv_lang'; the 🌐 chip in the top bar cycles it. */
const LANGS = ['en', 'de', 'fr', 'es'];
const I18N = {
  en: {}, // English text lives inline in t() call sites as the fallback
  de: {
    home: 'Start', cast: 'Figuren', bonds: 'Bande', world: 'Welt', play: 'Spielen', share: 'Teilen',
    my_worlds: 'Meine Welten', new_world: '+ Neue Welt', import_save: '⬆ Spielstand laden', your_studio: 'Dein Studio',
    resume: 'Weiter', continue_building: 'Weiterbauen', create_world: 'Welt erschaffen', wizard: '🧙 Welten-Assistent',
    sign_in: 'Anmelden', create_account: 'Konto erstellen', step_inside: 'Eintreten', advance: '▶ Weiter',
    intervene: '⚡ Eingreifen', character: 'Figur', location: 'Ort', custom: 'eigene', listen_hint: '💡 Zeile anklicken zum Anhören',
    first_page: 'Lass die Zeit voranschreiten, um die erste Seite aufzuschlagen…', voice: 'Stimme', settings_voice: '🔊 Stimme & Erzählung',
    sign_out: 'Abmelden', credits: 'Guthaben', spent_today: 'heute verbraucht',
  },
  fr: {
    home: 'Accueil', cast: 'Personnages', bonds: 'Liens', world: 'Monde', play: 'Jouer', share: 'Partager',
    my_worlds: 'Mes mondes', new_world: '+ Nouveau monde', import_save: '⬆ Importer une sauvegarde', your_studio: 'Ton atelier',
    resume: 'Reprendre', continue_building: 'Continuer', create_world: 'Créer un monde', wizard: '🧙 Assistant de mondes',
    sign_in: 'Connexion', create_account: 'Créer un compte', step_inside: 'Entrer', advance: '▶ Avancer',
    intervene: '⚡ Intervenir', character: 'Personnage', location: 'Lieu', custom: 'perso', listen_hint: '💡 cliquez une ligne pour l\'écouter',
    first_page: 'Faites avancer le temps pour tourner la première page…', voice: 'Voix', settings_voice: '🔊 Voix & narration',
    sign_out: 'Déconnexion', credits: 'crédits', spent_today: 'dépensé aujourd\'hui',
  },
  es: {
    home: 'Inicio', cast: 'Personajes', bonds: 'Vínculos', world: 'Mundo', play: 'Jugar', share: 'Compartir',
    my_worlds: 'Mis mundos', new_world: '+ Nuevo mundo', import_save: '⬆ Importar partida', your_studio: 'Tu estudio',
    resume: 'Continuar', continue_building: 'Seguir creando', create_world: 'Crear un mundo', wizard: '🧙 Asistente de mundos',
    sign_in: 'Iniciar sesión', create_account: 'Crear cuenta', step_inside: 'Entrar', advance: '▶ Avanzar',
    intervene: '⚡ Intervenir', character: 'Personaje', location: 'Lugar', custom: 'propio', listen_hint: '💡 pulsa una línea para escucharla',
    first_page: 'Avanza el tiempo para pasar la primera página…', voice: 'Voz', settings_voice: '🔊 Voz y narración',
    sign_out: 'Cerrar sesión', credits: 'créditos', spent_today: 'gastado hoy',
  },
};
const getLang = () => { const l = localStorage.getItem('viv_lang'); return LANGS.includes(l) ? l : 'en'; };
const setLang = (l) => localStorage.setItem('viv_lang', l);
// t('key', 'English fallback') — dictionary lookup with graceful English fallback.
const t = (key, fallback) => (I18N[getLang()] || {})[key] || fallback || key;

/* ───────── helpers ───────── */
async function api(path, opts = {}) {
  // Only send a JSON Content-Type when there's actually a JSON body — Fastify's
  // JSON parser rejects an empty body sent with that header (e.g. bodyless POSTs
  // like logout or "render video").
  const isForm = opts.body instanceof FormData;
  const hasJsonBody = !isForm && opts.body != null;
  const res = await fetch(path, { headers: hasJsonBody ? { 'Content-Type': 'application/json' } : {}, credentials: 'same-origin', ...opts, body: isForm ? opts.body : hasJsonBody ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || res.statusText); e.code = data.error?.code; throw e; }
  return data;
}
function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 3400);
}
const fail = (e) => toast(e.message || 'Something went wrong', 'err');
async function refreshMe() {
  // Also captures which TTS engine the admin has activated ('gemini' | 'laionbox') —
  // the voice UI adapts to it (prebuilt-voice pickers vs reference-clip management).
  try { const me = await api('/api/me'); S.user = me.user; S.ttsProvider = me.ttsProvider || 'gemini'; const c = $('#credits-num'); if (c) c.textContent = me.user.credits; } catch { S.user = null; }
  return S.user;
}
const assetUrl = (id) => id ? `/api/assets/${id}` : '';
// Based on the winner of a controlled experiment (scripts/tts_narrator_experiment.py,
// 2026-07-02; results: scripts/tts_experiment_summary.md), hand-tuned 2026-07-04 ("audio
// book" framing + explicit no-emphasis close). BYTE-IDENTICAL to server/export_cues.js
// NARRATOR_STYLE — the shared-cache contract; change both together or not at all.
const DEFAULT_NARRATOR_STYLE = 'Speak in a plain, measured, matter-of-fact audio book narrator tone — calm and pleasant but emotionally reserved, the way a documentary narrator or audiobook reader speaks. No dramatization, no character acting, no exaggerated emotional inflection, no vocal bursts of any kind (no gasping, laughing, sighing aloud). Even, steady pacing throughout. Meassured speech without any emphasis!';
const DEFAULT_CHARACTER_STYLE = 'In character (currently feeling {mood}). Natural, conversational, believably human delivery with mild, real-feeling emotion — like a real person talking, not a stage performance.';
// Iapetus scored the best-supported voice reliability (87.5% hit-rate over 8 independent
// draws with this prompt, vs. Algenib's 0/3) — see scripts/tts_experiment_summary.md.
// prepare: start generating the first narration line the moment a tick lands (before play
//          is pressed) — under LAIONBox the box is single-GPU/serialized, so early queueing
//          is exactly what keeps playback gapless.
// autoplay: narration starts speaking by itself right after each tick; while line n plays,
//           lines n+1 and n+2 are already generating (see setupNarrationPlayer's prefetch).
// Superseded narrator defaults: saving ANY setting once persisted the then-current default
// into localStorage, which would silently shadow every future default improvement. Stored
// styles matching a known old default are treated as unset so users pick up the new one
// (a genuinely customised style is untouched).
const OLD_NARRATOR_DEFAULTS = [
  'Speak in a plain, measured, matter-of-fact narrator tone — calm and pleasant but emotionally reserved, the way a documentary narrator or news reader speaks. No dramatization, no character acting, no exaggerated emotional inflection, no vocal bursts of any kind (no gasping, laughing, sighing aloud). Even, steady pacing throughout.',
];
const ttsPrefs = () => {
  const stored = JSON.parse(localStorage.getItem('viv_tts') || '{}');
  if (OLD_NARRATOR_DEFAULTS.includes(stored.narratorStyle)) delete stored.narratorStyle;
  return { narrator: 'Iapetus', prepare: true, autoplay: true, narratorStyle: DEFAULT_NARRATOR_STYLE, characterStyle: DEFAULT_CHARACTER_STYLE, custom: '', ...stored };
};
// Time-skip settings (Account → Time skips). animate: large skips play as a scene-by-scene
// FILM (the server plans the events; see server/gm.js runChapter) — off = classic single
// summarised tick. detail: 'full' = main plot AND side plots (bond moments, character
// development); 'main' = only plot-critical events (a skip may then have no scenes at all).
const skipPrefs = () => ({ animate: true, detail: 'full', ...JSON.parse(localStorage.getItem('viv_skip') || '{}') });
const saveSkipPrefs = (p) => localStorage.setItem('viv_skip', JSON.stringify({ ...skipPrefs(), ...p }));
const saveTtsPrefs = (p) => localStorage.setItem('viv_tts', JSON.stringify({ ...ttsPrefs(), ...p }));
const fmtClock = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cutoutFor = (ch) => { const o = (ch.state.outfits || []).find(o => o.name === (ch.state.outfit || 'everyday')) || (ch.state.outfits || [])[0]; return o?.cutout_asset_id; };

/* ── mic component: 🎙 → record (pulse+✕) → click again → transcribe → insert ── */
function attachMic(field, input) {
  const btn = document.createElement('button');
  btn.className = 'micbtn'; btn.type = 'button'; btn.title = 'Speak instead of typing';
  btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>';
  let rec = null, chunks = [], cancelBtn = null, cancelled = false;
  btn.onclick = async () => {
    if (btn.classList.contains('busy')) return;
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined });
      chunks = []; cancelled = false;
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('rec'); cancelBtn?.remove(); const localRec = rec; rec = null;
        if (cancelled) return;
        btn.classList.add('busy');
        try {
          const blob = new Blob(chunks, { type: localRec.mimeType || 'audio/webm' });
          const fd = new FormData(); fd.append('file', blob, 'clip.webm');
          const { text } = await api('/api/asr', { method: 'POST', body: fd });
          input.value = (input.value ? input.value + ' ' : '') + text;
          input.dispatchEvent(new Event('input')); input.focus();
          refreshMe();
        } catch (e) { fail(e); } finally { btn.classList.remove('busy'); }
      };
      rec.start(); btn.classList.add('rec'); btn.title = 'Click to stop & transcribe';
      cancelBtn = document.createElement('button');
      cancelBtn.className = 'cancelrec'; cancelBtn.type = 'button'; cancelBtn.textContent = '✕'; cancelBtn.title = 'Discard recording';
      cancelBtn.onclick = () => { cancelled = true; rec?.stop(); };
      field.prepend(cancelBtn);
      setTimeout(() => { if (rec) rec.stop(); }, 60000);
    } catch { toast('Microphone unavailable — you can type instead', 'err'); }
  };
  field.appendChild(btn);
  return btn;
}

/* ───────── chrome ───────── */
const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5"/></svg>',
  cast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>',
  bonds: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="6" r="2.5"/><circle cx="18.5" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 7.5 10.5 16M16.5 7.5 13.5 16M8 6h8"/></svg>',
  world: '<svg viewBox="0 0 24 24"><path d="m9 20-5.5-2.5v-13L9 7l6-2.5L20.5 7v13L15 17.5 9 20zM9 7v13M15 4.5v13"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5.5v13l11-6.5z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/></svg>',
};
// Localised dock labels — falls back to English via t() for any missing key.
const dockLabel = (k) => t(k, { home: 'Home', cast: 'Cast', bonds: 'Bonds', world: 'World', play: 'Play', share: 'Share' }[k]);

function chrome(active, { worldTitle = null, sub = null, showDock = true } = {}) {
  const wq = S.world ? `?w=${S.world}` : '';
  return `
  <div id="topbar">
    <div class="glasschip"><div class="logo-dot"></div><div class="chip-title"><b>${esc(worldTitle || 'Vivarium')}</b><span>${esc(sub || t('your_studio', 'your studio'))}</span></div></div>
    <div style="display:flex;gap:9px">
      ${S.world ? '<button class="glasschip" id="tl-chip" title="Timeline — scroll through every scene, replay or branch">🕰</button><button class="glasschip" id="gm-chip" title="Talk to the Game Master — ask anything, change anything">💬 GM</button>' : ''}
      <button class="glasschip" id="lang-chip" title="Language / Sprache / Langue / Idioma">🌐 ${getLang().toUpperCase()}</button>
      <div class="glasschip" id="credits-chip" title="Your credits"><div class="coin"></div><span id="credits-num">${S.user?.credits ?? '–'}</span></div>
      <button class="glasschip" id="avatar-chip" title="Account & usage">${esc((S.user?.displayName || '?')[0].toUpperCase())}</button>
    </div>
  </div>
  ${showDock ? `<nav id="dock">${['home', 'cast', 'bonds', 'world', 'play', 'share'].map(k => `
    <button class="dock-btn ${active === k ? 'active' : ''}" data-nav="${k}" ${k !== 'home' && !S.world ? 'disabled' : ''}>${ICONS[k]}<span>${dockLabel(k)}</span></button>`).join('')}
  </nav>` : ''}`;
}
function bindChrome() {
  $$('#dock .dock-btn').forEach(b => b.onclick = () => {
    const k = b.dataset.nav;
    if (k === 'home') return nav('#/home');
    if (!S.world) return;
    if (k === 'share') return shareModal();
    if (k === 'play') return nav(S.worldData?.world.status === 'live' ? `#/stage?w=${S.world}` : `#/genesis?w=${S.world}`);
    nav(`#/${{ cast: 'cast', bonds: 'bonds', world: 'atlas' }[k]}?w=${S.world}`);
  });
  const av = $('#avatar-chip'); if (av) av.onclick = accountModal;
  const gmc = $('#gm-chip'); if (gmc) gmc.onclick = gmChatOverlay;
  const tlc = $('#tl-chip'); if (tlc) tlc.onclick = () => timelineModal();
  // 🌐 chip cycles EN→DE→FR→ES and re-renders the current screen. From the next tick on,
  // the Game Master also writes the story in the chosen language (lang rides in tick calls).
  const lc = $('#lang-chip');
  if (lc) lc.onclick = () => {
    const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
    setLang(next);
    toast('🌐 ' + { en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español' }[next]);
    route(); // re-render the active screen with the new language
  };
}

/* ───────── router ───────── */
const nav = (h) => { location.hash = h; };
window.addEventListener('hashchange', route);
async function route() {
  if (typeof stopNarration === 'function') stopNarration();
  const [path, q] = location.hash.slice(2).split('?');
  const params = new URLSearchParams(q || '');
  if (params.get('w')) S.world = params.get('w');
  if (!S.user) await refreshMe();
  if (!S.user && path !== 'auth') return nav('#/auth');
  const screens = { auth: authScreen, home: homeScreen, forge: forgeScreen, cast: castScreen, bonds: bondsScreen, atlas: atlasScreen, genesis: genesisScreen, stage: stageScreen, populate: populateScreen, wizard: wizardScreen };
  (screens[path] || homeScreen)();
}
async function loadWorld(force = false) {
  if (!force && S.worldData?.world.id === S.world) return S.worldData;
  S.worldData = await api(`/api/worlds/${S.world}`);
  return S.worldData;
}

/* ───────── auth ───────── */
function authScreen() {
  let mode = 'signin', pendingEmail = null;
  const render = () => {
    app.innerHTML = `<div id="auth-wrap"><div class="auth-card">
      <div class="logo-dot"></div>
      <h1>Vivarium</h1>
      <p class="serif" style="color:var(--soft);font-style:italic;margin:0 0 4px">Little worlds, waiting for you.</p>
      ${mode === 'verify' ? `
        <p style="font-size:13px;color:var(--soft)">We sent a 6-digit code to<br><b style="color:var(--ink)">${esc(pendingEmail)}</b></p>
        <div class="code-inputs">${Array.from({ length: 6 }, (_, i) => `<input maxlength="1" inputmode="numeric" data-i="${i}">`).join('')}</div>
        <div class="err" id="autherr"></div>
        <button class="btn btn-primary" style="width:100%" id="verifybtn">Verify & step inside</button>
        <button class="btn btn-ghost small" style="margin-top:8px" id="resend">Resend code</button>` : `
        <div class="auth-tabs">
          <button class="${mode === 'signin' ? 'active' : ''}" data-m="signin">Sign in</button>
          <button class="${mode === 'signup' ? 'active' : ''}" data-m="signup">Create account</button>
        </div>
        <button class="btn btn-soft oauth-btn" id="google"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg> Continue with Google</button>
        <div class="divider">or with email</div>
        ${mode === 'signup' ? `<div class="field"><input id="f-name" placeholder="What should we call you?"></div>` : ''}
        <div class="field"><input id="f-email" type="email" placeholder="you@somewhere.com"></div>
        <div class="field"><input id="f-pw" type="password" placeholder="${mode === 'signup' ? 'Choose a password (8+ chars)' : 'Password'}"></div>
        ${mode === 'signup' ? `<div style="display:flex;gap:8px;margin:2px 0 4px">
          <button type="button" class="tchip sel" id="r-adult" style="flex:1">🧑 Adult account</button>
          <button type="button" class="tchip" id="r-teen" style="flex:1">🌱 Teen account</button>
        </div>
        <p style="font-size:10.5px;color:var(--soft);margin:0 0 6px" id="r-hint">Full stories, rated for adults.</p>` : ''}
        <div class="err" id="autherr"></div>
        <button class="btn btn-primary" style="width:100%" id="go">${mode === 'signup' ? 'Create my account' : 'Step inside'}</button>
        ${mode === 'signup' ? '<p style="font-size:11px;color:var(--soft);margin:12px 0 0">New accounts get a <b style="color:#a86f0d">200-credit</b> welcome gift ✨</p>' : ''}`}
    </div></div>`;
    $$('.auth-tabs button').forEach(b => b.onclick = () => { mode = b.dataset.m; render(); });
    const err = (m) => { $('#autherr').textContent = m; };
    if (mode === 'verify') {
      const inputs = $$('.code-inputs input');
      inputs[0].focus();
      inputs.forEach((inp, i) => {
        inp.oninput = () => { if (inp.value && i < 5) inputs[i + 1].focus(); };
        inp.onkeydown = (e) => { if (e.key === 'Backspace' && !inp.value && i) inputs[i - 1].focus(); };
        inp.onpaste = (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, ''); if (t.length >= 6) { inputs.forEach((x, j) => x.value = t[j] || ''); e.preventDefault(); } };
      });
      $('#verifybtn').onclick = async () => {
        try {
          const code = inputs.map(i => i.value).join('');
          const { user } = await api('/api/auth/verify', { method: 'POST', body: { email: pendingEmail, code } });
          S.user = user; refreshMe(); // also fetches S.ttsProvider (voice UI depends on it)
          toast(`Welcome, ${user.displayName}! 🌱 ${user.credits} credits in your pocket.`, 'gold');
          nav('#/home');
        } catch (e) { err(e.message); }
      };
      $('#resend').onclick = () => api('/api/auth/resend', { method: 'POST', body: { email: pendingEmail } }).then(() => toast('Code re-sent ✉️')).catch(fail);
      return;
    }
    $('#google').onclick = async () => { try { await api('/api/auth/google'); } catch (e) { err(e.message); } };
    const rAdult = $('#r-adult'), rTeen = $('#r-teen');
  if (rAdult && rTeen) {
    // account content rating: teen keeps every story PG (fade-to-black prompts server-side)
    const pick = (r) => {
      window.__signupRating = r;
      rAdult.classList.toggle('sel', r === 'adult'); rTeen.classList.toggle('sel', r === 'teen');
      $('#r-hint').textContent = r === 'teen' ? 'PG-rated stories — romance & kisses fine, everything explicit fades to black.' : 'Full stories, rated for adults.';
    };
    rAdult.onclick = () => pick('adult'); rTeen.onclick = () => pick('teen');
  }
  $('#go').onclick = async () => {
      const email = $('#f-email').value, password = $('#f-pw').value;
      try {
        if (mode === 'signup') {
          await api('/api/auth/signup', { method: 'POST', body: { email, password, displayName: $('#f-name').value, rating: window.__signupRating || 'adult' } });
          pendingEmail = email; mode = 'verify'; render();
        } else {
          const { user } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
          S.user = user; refreshMe(); // also fetches S.ttsProvider (voice UI depends on it)
          nav('#/home');
        }
      } catch (e) {
        if (e.code === 'NOT_VERIFIED') { pendingEmail = email; mode = 'verify'; render(); }
        else err(e.message);
      }
    };
    $('#f-pw').onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); };
  };
  render();
}

/* ───────── home / dashboard ───────── */
async function homeScreen() {
  app.innerHTML = chrome('home') + `<div class="screen"><div class="container" id="home-c"><div class="shimmer" style="height:220px"></div></div></div>`;
  bindChrome();
  try {
    const { worlds } = await api('/api/worlds');
    const featured = worlds[0];
    $('#home-c').innerHTML = `
      <p class="eyebrow">${t('your_studio', 'Your studio')}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h1 class="title" style="margin:0">${t('my_worlds', 'My Worlds')}</h1>
        <div style="display:flex;gap:9px">
          <button class="btn btn-teal" id="wizardbtn" title="Chat a whole new scenario into being">${t('wizard', '🧙 World Wizard')}</button>
          <button class="btn btn-soft" id="importworld" title="Restore a saved game from a .vivarium.zip">${t('import_save', '⬆ Import save')}</button>
          <button class="btn btn-primary" id="newworld">${t('new_world', '+ New world')}</button>
        </div>
      </div>
      <div class="world-grid" style="margin-top:18px">
        ${featured ? worldCard(featured, true) : ''}
        ${worlds.slice(1).map(w => worldCard(w)).join('')}
        <div class="create-card" id="create2"><div class="plus">+</div>Create a world<span style="font-weight:400;font-size:11px;color:var(--soft)">from scratch — or talk one into being</span></div>
      </div>
      ${!worlds.length ? '<div class="empty-hint"><div class="big">🌱</div>No worlds yet. Create one and talk your first character into existence.</div>' : ''}`;
    const create = async () => {
      const title = prompt('Name your world:', 'A quiet season'); if (!title) return;
      try { const { world } = await api('/api/worlds', { method: 'POST', body: { title } }); S.world = world.id; S.worldData = null; toast('World created — now forge your first character ✨'); nav(`#/forge?w=${world.id}`); } catch (e) { fail(e); }
    };
    $('#newworld').onclick = create; $('#create2').onclick = create;
    $('#importworld').onclick = () => importGamePicker();
    $('#wizardbtn').onclick = () => nav('#/wizard');
    $$('.world-card').forEach(c => {
      c.onclick = async (e) => {
        if (e.target.closest('[data-del]')) { if (confirm('Delete this world forever?')) { await api(`/api/worlds/${c.dataset.id}`, { method: 'DELETE' }); homeScreen(); } return; }
        S.world = c.dataset.id; S.worldData = null;
        const w = worlds.find(x => x.id === c.dataset.id);
        nav(w.status === 'live' ? `#/stage?w=${c.dataset.id}` : (w.characters.length ? `#/cast?w=${c.dataset.id}` : `#/forge?w=${c.dataset.id}`));
      };
    });
  } catch (e) { fail(e); }
}
function worldCard(w, featured = false) {
  return `<div class="world-card ${featured ? 'featured' : ''}" data-id="${w.id}">
    <div class="cover" style="${w.cover_asset_id ? `background-image:url(${assetUrl(w.cover_asset_id)})` : ''}"></div>
    <div class="body">
      ${featured ? '<span class="tag c" style="margin-bottom:6px">Continue playing</span>' : ''}
      <b>${esc(w.title)}</b>
      <div class="meta">Tick ${w.tick_index} · ${w.characters.map(c => esc(c.name)).join(', ') || 'no cast yet'} · ${w.status === 'live' ? '🟢 live' : '🛠 authoring'}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-primary small" style="flex:1">▶ ${w.status === 'live' ? t('resume', 'Resume') : t('continue_building', 'Continue building')}</button><button class="btn btn-ghost small" data-del title="Delete">🗑</button></div>
    </div></div>`;
}

/* ───────── forge ───────── */
async function forgeScreen() {
  await loadWorld();
  // Forge state is scoped to one world+draft; starting a Forge elsewhere begins fresh.
  if (S.forge.worldId !== S.world) S.forge = { worldId: S.world, history: [], draft: null, portraitId: null, cutoutId: null };
  const F = S.forge;
  app.innerHTML = chrome('cast', { worldTitle: 'The Forge', sub: S.worldData.world.title + ' · new character' }) + `
  <div class="screen"><div class="container">
    <div class="forge-layout">
      <div class="chatpanel">
        <div style="padding:13px 16px;border-bottom:1px solid var(--line)"><b style="font-size:14px">Describe a person</b><div style="font-size:11px;color:var(--soft)">Talk them into existence — I'll interview you.</div></div>
        <div class="chatlog" id="chatlog">
          <div class="msg assistant">Who are we bringing to life? Name, age, how they feel to be around — just talk to me. 🎨</div>
        </div>
        <div class="chat-inputrow"><div class="field" id="forge-field"><input id="forge-in" placeholder="Type or speak…"><button class="btn btn-primary small" id="forge-send">Send</button></div></div>
      </div>
      <div class="panel portrait-stage">
        <div style="display:flex;gap:6px"><span class="tag v">Anime</span><span class="tag grey">green-screen cut-out · transparent</span></div>
        <div class="checker" id="portrait-box" style="width:100%;display:flex;justify-content:center"><div class="ph">The portrait appears here once the draft feels ready — or press Paint now.</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-soft small" id="paint">🎨 Paint portrait</button>
          <button class="btn btn-soft small" id="voicebtn">🔊 Voice preview</button>
        </div>
        <div id="paint-hint" style="display:none;font-size:11.5px;color:var(--violet);font-weight:500">👆 Ready to see them? Hit <b>Paint portrait</b>.</div>
        <div style="display:flex;gap:10px;margin-top:2px">
          <button class="btn btn-ghost" id="discard">Discard</button>
          <button class="btn btn-primary" id="accept" disabled>+ Accept & add to cast</button>
        </div>
      </div>
      <div class="attr-panel" id="attrs"><div class="empty-hint" style="padding:30px 6px;font-size:12px">Attributes fill in as you talk…</div></div>
    </div>
  </div></div>`;
  bindChrome();
  const log = $('#chatlog');
  const addMsg = (cls, text) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  F.history.forEach(m => addMsg(m.role, m.content));
  if (F.draft) renderDraft();
  if (F.cutoutId) showPortrait();
  attachMic($('#forge-field'), $('#forge-in'));
  // Cast-suggestion handoff: arriving via the storyteller's "introduce X?" overlay, the
  // seeded first message is auto-sent so the assistant drafts the character immediately.
  if (F.seed) { const s = F.seed; F.seed = null; $('#forge-in').value = s; setTimeout(send, 50); }

  function renderDraft() {
    const d = F.draft; if (!d) return;
    $('#attrs').innerHTML = ['personality', 'goals', 'fears', 'coping', 'backstory', 'voice'].map(k => d[k] ? `
      <div class="attr"><h5>${k === 'goals' ? 'Goals & dreams' : k}</h5><p>${esc(Array.isArray(d[k]) ? d[k].join(' · ') : d[k])}</p></div>` : '').join('') +
      (d.name ? `<div class="attr" style="border-color:#bfeff1;background:#f2fbfc"><h5 style="color:#0d7e83">Identity</h5><p><b>${esc(d.name)}</b> · ${esc(d.age ?? '?')} · ${esc(d.pronouns || '')}${d.home_location ? `<br>📍 first appears at <b>${esc(d.home_location)}</b> <span style="color:var(--soft)">(you confirm on accept)</span>` : ''}</p></div>` : '');
    $('#accept').disabled = !(d.name && F.cutoutId);
    // invite the click once we have enough to draw but haven't yet
    const paintable = d.name && d.appearance && !F.cutoutId && !F.painting;
    const pb = $('#paint'), hint = $('#paint-hint');
    if (pb) { pb.classList.toggle('btn-primary', !!paintable); pb.classList.toggle('btn-soft', !paintable); pb.style.animation = paintable ? 'pulsev 1.6s infinite' : ''; }
    if (hint) hint.style.display = paintable ? 'block' : 'none';
  }
  function showPortrait() {
    $('#portrait-box').innerHTML = `<img src="${assetUrl(F.cutoutId)}" alt="portrait">`;
    const pb = $('#paint'); if (pb) { pb.classList.remove('btn-primary'); pb.classList.add('btn-soft'); pb.style.animation = ''; pb.textContent = '↻ Regenerate'; }
    const hint = $('#paint-hint'); if (hint) hint.style.display = 'none';
    if (F.draft?.name) $('#accept').disabled = false;
  }
  async function send() {
    const text = $('#forge-in').value.trim(); if (!text || F.busy) return;
    $('#forge-in').value = ''; F.busy = true;
    addMsg('user', text); F.history.push({ role: 'user', content: text });
    const status = addMsg('status', '✨ thinking…');
    try {
      const out = await api(`/api/worlds/${S.world}/forge/chat`, { method: 'POST', body: { message: text, history: F.history.slice(0, -1), lang: getLang() } });
      status.remove();
      addMsg('assistant', out.reply || '…'); F.history.push({ role: 'assistant', content: out.reply || '' });
      if (out.draft) { F.draft = { ...F.draft, ...out.draft }; renderDraft(); }
      refreshMe();
      // The assistant may recognise "draw them now" in any phrasing, or decide the draft is ready.
      if ((out.wants_portrait || (out.ready && !F.cutoutId)) && !F.painting) {
        if (F.draft?.name && F.draft?.appearance) paint();
        else if (out.wants_portrait) addMsg('assistant', "I'd love to — just tell me a little about how they look first (hair, eyes, build, colours) and I'll paint them right away. 🎨");
      }
    } catch (e) { status.remove(); addMsg('assistant', `😔 I hit a snag reaching my studio: ${e.message}. Give it another try in a moment?`); }
    F.busy = false;
  }
  $('#forge-send').onclick = send;
  $('#forge-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };

  const GEN_STAGES = [
    { at: 0, txt: '✏️ Sketching the pose…', sub: 'composing on a green screen' },
    { at: 4, txt: '🎨 Painting the details…', sub: 'hair, eyes, outfit, expression' },
    { at: 11, txt: '✂️ Cutting out the background…', sub: 'keying green to transparency' },
    { at: 22, txt: '✨ Almost there…', sub: 'this one is taking a little longer' },
  ];
  function renderGenProgress() {
    const name = esc(F.draft?.name || 'your character');
    $('#portrait-box').innerHTML = `<div class="genprog">
      <div class="gen-silhouette"><div class="gen-sweep"></div></div>
      <div class="gen-stage-txt" id="gen-txt">✏️ Sketching the pose…</div>
      <div class="gen-sub" id="gen-sub">painting <b>${name}</b> on a green screen</div>
      <div class="gen-steps" id="gen-steps">${GEN_STAGES.map((_, i) => `<span class="dot ${i === 0 ? 'on' : ''}"></span>`).join('')}</div>
      <div class="gen-elapsed" id="gen-elapsed">0.0s</div></div>`;
  }
  async function paint() {
    if (F.painting) return;
    if (!F.draft?.name || !F.draft?.appearance) {
      addMsg('assistant', "Before I can paint them I need a sense of how they look — their hair, eyes, build, the colours they wear. Tell me a little and I'll draw them straight away. 🎨");
      toast('Describe how they look first 🎨', 'err');
      return;
    }
    F.painting = true;
    $('#paint').disabled = true;
    renderGenProgress();
    const t0 = performance.now();
    let stageIdx = 0;
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const el = $('#gen-elapsed'); if (el) el.textContent = s.toFixed(1) + 's';
      let ni = 0; GEN_STAGES.forEach((st, i) => { if (s >= st.at) ni = i; });
      if (ni !== stageIdx && $('#gen-txt')) {
        stageIdx = ni;
        $('#gen-txt').textContent = GEN_STAGES[ni].txt;
        $('#gen-sub').innerHTML = GEN_STAGES[ni].sub;
        $$('#gen-steps .dot').forEach((d, i) => { d.className = 'dot' + (i < ni ? ' done' : i === ni ? ' on' : ''); });
      }
    }, 100);
    try {
      const { portraitId, cutoutId } = await api(`/api/worlds/${S.world}/forge/portrait`, { method: 'POST', body: { draft: F.draft } });
      clearInterval(timer);
      F.portraitId = portraitId; F.cutoutId = cutoutId; showPortrait(); refreshMe();
      addMsg('status', `🖼 ${esc(F.draft.name)} is on the canvas in ${((performance.now() - t0) / 1000).toFixed(0)}s — regenerate or tweak the look anytime.`);
    } catch (e) {
      clearInterval(timer);
      $('#portrait-box').innerHTML = `<div class="ph" style="flex-direction:column;gap:12px"><div style="font-size:30px">🎨💔</div><div>The portrait didn't come through.</div><button class="btn btn-soft small" id="retry-paint">↻ Try again</button></div>`;
      const rb = $('#retry-paint'); if (rb) rb.onclick = paint;
      const reason = e.code === 'INSUFFICIENT_CREDITS' ? e.message : e.code === 'RATE_LIMITED' ? 'the studio is busy right now — give it a few seconds.' : `${e.message}`;
      addMsg('assistant', `😔 I couldn't finish the portrait: ${reason} You can hit "🎨 Paint portrait" to try again whenever you like.`);
    }
    F.painting = false;
    const pb = $('#paint'); if (pb) pb.disabled = false;
  }
  $('#paint').onclick = paint;
  $('#voicebtn').onclick = async () => {
    if (!F.draft?.name) return toast('Draft someone first', 'err');
    try {
      const { assetId } = await api('/api/tts', { method: 'POST', body: { text: `Hi, I'm ${F.draft.name}. ${(F.draft.personality || '').split(';')[0]}.`, voice: (F.draft.voice || 'Sulafat').split(' ')[0], style: 'warm and in character' } });
      new Audio(assetUrl(assetId)).play(); refreshMe();
    } catch (e) { fail(e); }
  };
  $('#discard').onclick = () => { S.forge = { worldId: S.world, history: [], draft: null, portraitId: null, cutoutId: null }; forgeScreen(); };
  // Accepting asks WHERE the character first appears: the assistant suggests a sensible
  // location in the draft (home_location, a location name); the player confirms or picks
  // another before the character enters the world.
  $('#accept').onclick = async () => {
    if ($('#spawn-go')) return;   // spawn modal already open — never stack a second one
    const locs = S.worldData?.locations || [];
    const suggested = locs.find(l => l.name.toLowerCase() === String(F.draft.home_location || '').toLowerCase());
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" style="width:420px"><div class="modal-head teal">
      <div><b>📍 Where does ${esc(F.draft.name)} first appear?</b><small>${suggested ? 'the assistant suggests a spot — confirm or change it' : 'pick a starting place'}</small></div><span class="x">✕</span></div>
    <div class="modal-body">
      ${suggested ? `<p style="font-size:12px;color:var(--soft);margin-bottom:8px">Suggested: <b>${esc(suggested.name)}</b> — fits how the story knows them.</p>` : ''}
      <select id="spawn-loc" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:9px 10px;background:#fff;margin-bottom:12px">
        ${locs.map(l => `<option value="${l.id}" ${l.id === suggested?.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="spawn-go" style="width:100%">✓ Add ${esc(F.draft.name)} here</button>
    </div></div>`;
    document.body.appendChild(m);
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    $('.x', m).onclick = () => m.remove();
    $('#spawn-go', m).onclick = async () => {
      // Adding takes a while (bond drafting is an LLM call, ~10-20s) — lock the button and
      // SAY SO, or impatient clicks fire duplicate requests (the server also 409s repeats,
      // but the player should never get that far).
      const btn = $('#spawn-go', m);
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = `⏳ Adding ${F.draft.name}… weaving their bonds to the cast (~15s)`;
      try {
        const r = await api(`/api/worlds/${S.world}/characters`, { method: 'POST', body: { draft: F.draft, portraitId: F.portraitId, cutoutId: F.cutoutId, homeLocationId: $('#spawn-loc', m).value } });
        toast(`${F.draft.name} joined the cast 🎉${r.bondsCreated ? ` — ${r.bondsCreated} bonds formed` : ''}`, 'gold');
        m.remove();
        S.forge = { worldId: S.world, history: [], draft: null, portraitId: null, cutoutId: null };
        S.worldData = null; nav(`#/cast?w=${S.world}`);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = `✓ Add ${esc(F.draft.name)} here`;
        fail(e);   // a duplicate shows the server's clear "already in the cast" message
      }
    };
  };
}

/* ───────── cast ───────── */
async function castScreen() {
  const { world, characters } = await loadWorld(true);
  app.innerHTML = chrome('cast', { worldTitle: 'The Cast', sub: `${world.title} · ${characters.length} character${characters.length === 1 ? '' : 's'}` }) + `
  <div class="screen"><div class="container">
    <p class="eyebrow">Everyone in this world</p>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h1 class="title" style="margin:0">The Cast</h1>
      <div style="display:flex;gap:9px">
        <button class="btn btn-teal" id="populate">✨ Populate</button>
        <button class="btn btn-primary" id="newchar">+ New character</button>
      </div>
    </div>
    <div class="cast-grid" style="margin-top:22px">
      ${characters.map(c => `
        <div class="cast-tile" data-id="${c.id}">
          <div class="ring"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div>
          <b>${esc(c.name)}</b>
          <div class="mood">${esc(c.state.mood || '—')}</div>
          <span class="tag t">${esc(locName(c.state.location_id))}</span>
        </div>`).join('')}
      <div class="cast-tile" id="addtile"><div class="ring" style="background:#ded7f5"><div style="display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--violet)">+</div></div><b style="color:var(--soft)">Add someone</b></div>
    </div>
    ${characters.length > 1 ? '<div class="cast-hint">💡 Tip: click a portrait to open it — or <b>drag from one portrait to another</b> to draw a new bond.</div>' : ''}
    ${!characters.length ? '<div class="empty-hint"><div class="big">🎭</div>An empty stage. Forge your first character!</div>' : ''}
  </div></div>`;
  bindChrome();
  $('#newchar').onclick = () => nav(`#/forge?w=${S.world}`);
  $('#addtile').onclick = () => nav(`#/forge?w=${S.world}`);
  $('#populate').onclick = () => nav(`#/populate?w=${S.world}`);
  setupCastDragConnect(characters);
}

// Click a portrait to open it; press-and-drag from one portrait to another to draw a bond.
let castDragHandlers = null;
function setupCastDragConnect(characters) {
  if (castDragHandlers) { window.removeEventListener('pointermove', castDragHandlers.move); window.removeEventListener('pointerup', castDragHandlers.up); }
  const tiles = $$('.cast-tile[data-id]');
  let src = null, dragging = false, sx = 0, sy = 0, arrow = null, hoverTile = null;
  const centerOf = (el) => { const r = el.querySelector('.ring').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const tileUnder = (x, y) => document.elementFromPoint(x, y)?.closest('.cast-tile[data-id]');
  tiles.forEach(t => {
    t.style.touchAction = 'none';
    t.addEventListener('pointerdown', (e) => { src = t; sx = e.clientX; sy = e.clientY; dragging = false; });
  });
  const move = (e) => {
    if (!src) return;
    if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
      dragging = true; src.classList.add('drag-src');
      arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.id = 'drag-arrow';
      arrow.innerHTML = `<defs><marker id="dragh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ff5b8f"/></marker></defs><path stroke="#ff5b8f" stroke-width="3" fill="none" stroke-dasharray="7 5" marker-end="url(#dragh)"/>`;
      document.body.appendChild(arrow);
    }
    if (dragging) {
      const p = centerOf(src);
      arrow.querySelector('path').setAttribute('d', `M${p.x},${p.y} L${e.clientX},${e.clientY}`);
      const over = tileUnder(e.clientX, e.clientY);
      if (over !== hoverTile) { hoverTile?.classList.remove('drag-hover'); hoverTile = (over && over !== src) ? over : null; hoverTile?.classList.add('drag-hover'); }
    }
  };
  const up = (e) => {
    if (!src) return;
    const wasDragging = dragging, srcId = src.dataset.id;
    const target = wasDragging ? tileUnder(e.clientX, e.clientY) : null;
    arrow?.remove(); arrow = null;
    tiles.forEach(t => t.classList.remove('drag-src', 'drag-hover')); hoverTile = null;
    src = null; dragging = false;
    if (!wasDragging) { profileDrawer(srcId); return; }
    if (target && target.dataset.id && target.dataset.id !== srcId) {
      bondBuilderModal(characters, () => { S.worldData = null; castScreen(); }, { fromId: srcId, toId: target.dataset.id });
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  castDragHandlers = { move, up };
}
const locName = (id) => S.worldData?.locations.find(l => l.id === id)?.name || 'nowhere yet';

/* ───────── profile drawer ───────── */
async function profileDrawer(charId) {
  const { characters, world } = await loadWorld();
  const c = characters.find(x => x.id === charId); if (!c) return;
  const { patches } = await api(`/api/characters/${charId}/patches`);
  const CAT = { condition: '🩺', emotion: '💭', belief: '🔮', strategy: '🧩', skill: '⭐', goal: '🎯', physical: '✂️', relationship: '💞' };
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  bg.innerHTML = `<div class="drawer">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div><span class="tag v">Base profile</span> <span class="tag grey">immutable · time-zero</span></div>
      <div style="display:flex;gap:8px"><button class="btn btn-ghost small" id="delchar" style="color:#d92e66">🗑 Remove</button><button class="btn btn-ghost small" id="closedrawer">✕ close</button></div>
    </div>
    <div class="profile-cols">
      <div class="panel" style="text-align:center">
        <button class="tag t" id="movebtn" style="margin-bottom:8px;cursor:pointer" title="Teleport to another location">📍 ${esc(locName(c.state.location_id))} · ${esc(c.state.activity || 'here')} · <b>Move</b></button>
        <div class="checker" style="margin:10px 0"><img id="bigportrait" src="${assetUrl(cutoutFor(c))}" style="max-width:100%;max-height:300px"></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px"><b style="font-size:19px">${esc(c.name)}</b><button class="btn btn-ghost small" id="renamebtn" title="Rename" style="padding:2px 7px">✏️</button></div>
        <!-- Voice line adapts to the active TTS engine: Gemini shows the prebuilt voice name;
             LAIONBox shows the multilingual voice-profile (or custom-upload) status. -->
        <div style="font-size:11.5px;color:var(--soft)">${esc(c.base.age ?? '')} · ${esc(c.base.pronouns || '')} · ${S.ttsProvider === 'laionbox'
          ? (c.voice_ref_asset_id ? 'custom voice 🎙 (uploaded)' : 'voice profile 🎙 ' + esc(c.voice))
          : 'voice ' + esc(c.voice)}</div>
        <div class="outfit-strip" style="justify-content:center">
          ${(c.state.outfits || []).map(o => `<div class="outfit-thumb ${o.name === c.state.outfit ? 'sel' : ''}" title="${esc(o.name)} — click to view & manage" data-cut="${o.cutout_asset_id}" data-oname="${esc(o.name)}" style="background-image:url(${assetUrl(o.cutout_asset_id)})"></div>`).join('')}
          <div class="outfit-thumb add" id="addoutfit" title="Commission a new outfit">+</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
          <button class="btn btn-soft small" id="hearvoice">🔊 Voice</button>
          ${S.ttsProvider === 'laionbox' ? `<button class="btn btn-soft small" id="setupvoice">🎙 Change voice</button>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${['personality', 'goals', 'fears', 'coping', 'backstory', 'speaking_style'].map(k => c.base[k] ? `
          <div class="attr"><h5>${k.replace('_', ' ')}</h5><p>${esc(Array.isArray(c.base[k]) ? c.base[k].join(' · ') : c.base[k])}</p></div>` : '').join('')}
        <div class="attr" style="border:1.5px dashed #9fdfe2;background:#f2fbfc"><h5 style="color:#0d7e83">Now · materialised state</h5>
          <p>${esc(c.state.mood || '')} · ${esc(c.state.activity || '')}${c.state.thought ? ` · <i>"${esc(c.state.thought)}"</i>` : ''}${(c.state.conditions || []).length ? ' · ' + c.state.conditions.map(esc).join(', ') : ''}</p>
          ${(c.state.emotions || []).length ? `<p style="margin-top:5px">${c.state.emotions.map(e => `<span class="tag c" style="margin:0 3px 3px 0">${esc(e.name)} ${Math.round((e.intensity ?? 0.5) * 100)}%</span>`).join('')}</p>` : ''}
          ${(c.state.intentions || []).length ? `<p style="margin-top:4px">${c.state.intentions.map(i => `<span class="intent-chip">→ ${esc(i)}</span>`).join('')}</p>` : ''}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-coral small" id="godedit">⚡ God-edit</button><button class="btn btn-soft small" id="openmind">🧠 Mind</button></div>
      </div>
      <div class="panel">
        <b style="font-size:14px">Life so far</b>
        <div style="font-size:10.5px;color:var(--soft);margin-bottom:10px">git-like history · newest first</div>
        <div class="timeline">
          ${patches.map(p => `<div class="tl-item"><div class="tl-dot">${CAT[p.category] || '•'}</div>
            <div class="tl-body">${esc(p.reason || p.category)}${p.value && p.value !== 'time-zero base' ? ` → <b>${esc(typeof p.value === 'string' ? p.value : JSON.stringify(p.value))}</b>` : ''}<br><small>tick ${p.tick_ref ?? 0} · ${esc(p.author)}</small></div></div>`).join('') || '<small style="color:var(--soft)">No changes yet — their story starts at the first tick.</small>'}
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
  $('#closedrawer', bg).onclick = () => bg.remove();
  $('#delchar', bg).onclick = async () => {
    if (!confirm(`Remove ${c.name} from the cast? This also deletes their bonds and history.`)) return;
    try { await api(`/api/characters/${c.id}`, { method: 'DELETE' }); toast(`${c.name} left the cast`); S.worldData = null; bg.remove(); if (location.hash.includes('cast')) castScreen(); } catch (e) { fail(e); }
  };
  // Sprite manager: clicking a thumb previews it AND offers regenerate/delete for it.
  let manageBar = null;
  $$('.outfit-thumb[data-cut]', bg).forEach(t => t.onclick = () => {
    $('#bigportrait', bg).src = assetUrl(t.dataset.cut);
    $$('.outfit-thumb', bg).forEach(x => x.classList.remove('sel'));
    t.classList.add('sel');
    const oname = t.dataset.oname;
    const o = (c.state.outfits || []).find(x => x.name === oname);
    if (manageBar) manageBar.remove();
    manageBar = document.createElement('div');
    manageBar.style.cssText = 'margin-top:9px;padding:9px 11px;background:#f7f5fe;border:1.5px dashed #d9d2f5;border-radius:12px;text-align:left;width:100%;box-sizing:border-box';
    manageBar.innerHTML = `
      <div style="font-size:11px;font-weight:700;margin-bottom:5px">🎨 Sprite “${esc(oname)}”</div>
      <input id="sm-cap" value="${esc(o?.description || oname)}" placeholder="new caption / instruction for the image" style="width:100%;border:1.5px solid var(--line);border-radius:9px;padding:6px 9px;font-size:12px">
      <div style="display:flex;gap:7px;margin-top:7px;flex-wrap:wrap">
        <button class="btn btn-soft small" id="sm-regen" style="flex:1 1 auto;min-width:0;white-space:nowrap">🔁 Regenerate</button>
        <button class="btn btn-ghost small" id="sm-del" style="flex:none;color:#d92e66" title="Delete this sprite">🗑</button>
      </div>`;
    $('.outfit-strip', bg).after(manageBar);   // sits inside the column, right under the sprite strip
    $('#sm-regen', manageBar).onclick = async (e) => {
      const btn = e.target; if (btn.disabled) return;
      btn.disabled = true; btn.textContent = '⏳ painting…';
      try {
        await api(`/api/characters/${c.id}/outfits`, { method: 'POST', body: { name: oname, description: $('#sm-cap', manageBar).value, replace: true, ...(o?.emotion ? { emotion: o.emotion } : {}) } });
        toast(`“${oname}” repainted ✨`, 'gold');
        S.worldData = null; bg.remove(); profileDrawer(charId); refreshMe();
      } catch (e2) { btn.disabled = false; btn.textContent = '🔁 Regenerate'; fail(e2); }
    };
    $('#sm-del', manageBar).onclick = async () => {
      if (!confirm(`Delete the “${oname}” sprite? (The image stays in your asset archive.)`)) return;
      try {
        await api(`/api/characters/${c.id}/outfits/${encodeURIComponent(oname)}`, { method: 'DELETE' });
        toast(`“${oname}” removed`);
        S.worldData = null; bg.remove(); profileDrawer(charId);
      } catch (e2) { fail(e2); }
    };
  });
  $('#hearvoice', bg).onclick = async () => {
    try {
      const { assetId } = await api('/api/tts', { method: 'POST', body: { text: c.state.thought || `Hello. I'm ${c.name}.`, voice: c.voice, style: `in character: ${c.state.mood || 'calm'}`, characterId: c.id, lang: getLang() } });
      new Audio(assetUrl(assetId)).play(); refreshMe();
    } catch (e) {
      // LAIONBox without a reference clip → jump straight into voice setup
      if (e.code === 'VOICE_REF_MISSING') { bg.remove(); voiceRefModal(c.id, () => profileDrawer(charId)); return; }
      fail(e);
    }
  };
  const setupBtn = $('#setupvoice', bg);
  if (setupBtn) setupBtn.onclick = () => { bg.remove(); voiceRefModal(c.id, () => profileDrawer(charId)); };
  $('#addoutfit', bg).onclick = async () => {
    const desc = prompt(`Describe ${c.name}'s new outfit:`, 'cozy winter coat and scarf'); if (!desc) return;
    toast('🎨 Tailoring — this takes ~30s…');
    try { await api(`/api/characters/${c.id}/outfits`, { method: 'POST', body: { name: desc.slice(0, 24), description: desc } }); S.worldData = null; bg.remove(); profileDrawer(charId); refreshMe(); } catch (e) { fail(e); }
  };
  $('#renamebtn', bg).onclick = async () => {
    const name = prompt(`Rename ${c.name} to:`, c.name); if (name == null || !name.trim() || name.trim() === c.name) return;
    try { await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { name: name.trim() } }); toast(`Renamed to ${name.trim()}`); S.worldData = null; bg.remove(); profileDrawer(charId); } catch (e) { fail(e); }
  };
  $('#movebtn', bg).onclick = () => {
    locationPickerModal(world && S.worldData.locations, characters, c.state.location_id, async (l) => {
      try { await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { location_id: l.id } }); toast(`${c.name} moved to ${l.name} 📍`); S.worldData = null; bg.remove(); profileDrawer(charId); } catch (e) { fail(e); }
    }, { title: `📍 Move ${c.name}`, sub: 'teleport them to any location' });
  };
  $('#godedit', bg).onclick = () => {
    bg.remove();
    godEditModal(c, () => { S.worldData = null; profileDrawer(charId); });
  };
  $('#openmind', bg).onclick = () => { bg.remove(); mindModal(charId); };
}
function godEditModal(c, done) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><div class="modal-head coral"><div><b>⚡ God-edit ${esc(c.name)}</b><small>a divine intervention, written into their patch log</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div class="kind-tabs">${['condition', 'emotion', 'belief', 'goal', 'physical'].map((k, i) => `<button class="tag ${i ? 'grey' : 'c'}" data-k="${k}">${k}</button>`).join('')}</div>
    <div class="field" style="margin-bottom:9px"><input id="ge-value" placeholder="e.g. hungry · hopeful · believes the world may be a simulation"></div>
    <div class="field" id="ge-field"><input id="ge-reason" placeholder="Why? (the story reason)"></div>
    <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:14px"><button class="btn btn-ghost" id="ge-cancel">Cancel</button><button class="btn btn-coral" id="ge-apply">Apply</button></div>
  </div></div>`;
  document.body.appendChild(m);
  attachMic($('#ge-field', m), $('#ge-reason', m));
  let kind = 'condition';
  $$('.kind-tabs .tag', m).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('.kind-tabs .tag', m).forEach(x => x.className = 'tag grey'); b.className = 'tag c'; });
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove(); $('#ge-cancel', m).onclick = () => m.remove();
  $('#ge-apply', m).onclick = async () => {
    try {
      await api(`/api/characters/${c.id}/patches`, { method: 'POST', body: { category: kind, op: 'set', path: `/${kind}`, value: $('#ge-value', m).value, reason: $('#ge-reason', m).value || 'divine whim' } });
      toast('⚡ Written into their becoming'); m.remove(); done?.();
    } catch (e) { fail(e); }
  };
}

/* ───────── populate ───────── */
async function populateScreen() {
  const { world } = await loadWorld();
  app.innerHTML = chrome('cast', { worldTitle: 'Populate', sub: world.title + ' · AI casting' }) + `
  <div class="screen"><div class="container" style="max-width:880px">
    <p class="eyebrow" style="text-align:center">Let the agent fill the blanks</p>
    <h1 class="title" style="text-align:center">Populate</h1>
    <div class="field" id="pop-field" style="padding:6px 8px 6px 16px"><input id="pop-in" placeholder='"Give Bob a difficult study-group rival" · "Invent the café barista"'><button class="btn btn-primary" id="pop-go">✨ Generate</button></div>
    <div id="pop-progress" style="margin:12px 4px;font-size:12px;color:var(--soft)"></div>
    <div id="pop-cards" class="world-grid"></div>
  </div></div>`;
  bindChrome();
  attachMic($('#pop-field'), $('#pop-in'));
  $('#pop-go').onclick = async () => {
    const reqText = $('#pop-in').value.trim(); if (!reqText) return;
    $('#pop-progress').innerHTML = '<span class="spinner dark"></span> drafting profiles · wiring relationships…';
    try {
      const { suggestions } = await api(`/api/worlds/${S.world}/populate`, { method: 'POST', body: { request: reqText } });
      refreshMe();
      $('#pop-progress').textContent = suggestions.length ? `${suggestions.length} character${suggestions.length > 1 ? 's' : ''} drafted — approve to paint & add:` : 'Nothing came to mind — try rephrasing.';
      $('#pop-cards').innerHTML = suggestions.map((s, i) => `
        <div class="world-card" style="cursor:default"><div class="body">
          <b>${esc(s.name)}</b> <span class="tag grey">${esc(s.age ?? '')}</span>
          <div class="meta">${esc(s.personality || '')}</div>
          <div style="font-size:11.5px;color:#4b4573;margin-bottom:9px">${(s.bonds || []).map(b => `<span class="tag c" style="margin:2px 2px 0 0">${esc(b.description)}</span>`).join('')}</div>
          <button class="btn btn-primary small" data-approve="${i}" style="width:100%">+ Approve (paints portrait)</button>
        </div></div>`).join('');
      $$('[data-approve]').forEach(b => b.onclick = async () => {
        const s = suggestions[+b.dataset.approve];
        b.disabled = true; b.innerHTML = '<span class="spinner"></span> painting…';
        try {
          const { portraitId, cutoutId } = await api(`/api/worlds/${S.world}/forge/portrait`, { method: 'POST', body: { draft: s } });
          const { character } = await api(`/api/worlds/${S.world}/characters`, { method: 'POST', body: { draft: s, portraitId, cutoutId } });
          for (const bond of s.bonds || []) {
            if (bond.to_id) {
              await api(`/api/worlds/${S.world}/relationships`, { method: 'POST', body: { fromId: character.id, toId: bond.to_id, description: bond.description } }).catch(() => {});
              if (bond.reverse_description) await api(`/api/worlds/${S.world}/relationships`, { method: 'POST', body: { fromId: bond.to_id, toId: character.id, description: bond.reverse_description } }).catch(() => {});
            }
          }
          b.textContent = '✓ joined the cast'; S.worldData = null; refreshMe();
        } catch (e) { b.disabled = false; b.textContent = '+ Approve (paints portrait)'; fail(e); }
      });
    } catch (e) { $('#pop-progress').textContent = ''; fail(e); }
  };
}

/* ───────── World Wizard ─────────────────────────────────────────────────────
   Chat-driven scenario generator (server: server/wizard.js). The player describes
   the world they want; the assistant iterates a full structured plan (characters,
   locations, bonds, tone) shown in the right panel together with a SERVER-computed
   credit estimate. "Build" fires the agentic background job; this screen then
   polls the job and streams its build diary (incl. retries / moderation rewrites)
   until the world goes live. Wizard chat state is kept in-memory per session.   */
const W = { history: [], plan: null, estimate: null, jobId: null, busy: false };
async function wizardScreen() {
  app.innerHTML = chrome('home', { worldTitle: t('wizard', '🧙 World Wizard'), sub: 'dream a scenario into being' }) + `
  <div class="screen"><div class="container">
    <div class="forge-layout" style="grid-template-columns:minmax(320px,1fr) minmax(300px,420px)">
      <div class="chatpanel">
        <div style="padding:13px 16px;border-bottom:1px solid var(--line)"><b style="font-size:14px">Describe the world you want</b><div style="font-size:11px;color:var(--soft)">genre, characters, places — I'll draft the whole scenario and refine it with you</div></div>
        <div class="chatlog" id="wz-log">
          <div class="msg assistant">Where are we going? A medieval keep, a space freighter, a sleepy seaside town? Tell me the world you want and roughly who lives in it — I'll draft everything. 🧙</div>
        </div>
        <div class="chat-inputrow"><div class="field" id="wz-field"><input id="wz-in" placeholder="e.g. a medieval scenario with a knight, a mage, and the knight's jealous brother…"><button class="btn btn-primary small" id="wz-send">Send</button></div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;overflow-y:auto">
        <div class="panel" id="wz-plan"><div class="empty-hint" style="padding:24px 8px;font-size:12px">The plan appears here as we talk…</div></div>
        <div class="panel" id="wz-build" style="display:none"></div>
      </div>
    </div>
  </div></div>`;
  bindChrome();
  const log = $('#wz-log');
  const addMsg = (cls, text) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  W.history.forEach(m => addMsg(m.role, m.content));
  if (W.plan) renderPlan();
  if (W.jobId) pollBuild(); // resume watching an in-flight build after navigation
  attachMic($('#wz-field'), $('#wz-in'));

  // Right panel: readable plan summary + itemised cost + the approval button.
  function renderPlan() {
    const p = W.plan, e = W.estimate;
    if (!p) return;
    $('#wz-plan').innerHTML = `
      <b style="font-size:15px">${esc(p.title || 'Untitled world')}</b>
      <div style="font-size:11px;color:var(--soft);margin:2px 0 8px">${esc(p.genre || '')} · ${esc(p.mood || '')}</div>
      <h5 style="font-size:10px;letter-spacing:.12em;color:var(--violet);margin:8px 0 4px">CAST (${(p.characters || []).length})</h5>
      ${(p.characters || []).map(c => `<div style="font-size:12px;margin-bottom:3px"><b>${esc(c.name)}</b> <span style="color:var(--soft)">· ${esc(c.age ?? '')} · ${esc((c.personality || '').slice(0, 60))}</span></div>`).join('')}
      <h5 style="font-size:10px;letter-spacing:.12em;color:var(--violet);margin:10px 0 4px">PLACES (${(p.locations || []).length})</h5>
      <div style="font-size:11.5px;color:#3c3763">${(p.locations || []).map(l => esc(l.name)).join(' · ')}</div>
      <h5 style="font-size:10px;letter-spacing:.12em;color:var(--violet);margin:10px 0 4px">BONDS (${(p.relationships || []).length})</h5>
      <div style="font-size:11.5px;color:#3c3763">${(p.relationships || []).slice(0, 6).map(r => `${esc(r.from)} → ${esc(r.to)}`).join(' · ')}${(p.relationships || []).length > 6 ? ' …' : ''}</div>
      ${e ? `
      <div class="attr" style="margin-top:12px;background:#fdf3e0;border-color:#f4d79a"><h5 style="color:#a86f0d">ESTIMATED COST</h5>
        <p style="font-size:11.5px">${e.images} images (${e.portraits} portraits + ${e.outfitVariants} outfits + ${e.backgrounds} backgrounds)${e.voiceRefs ? ` · ${e.voiceRefs} cloned voices` : ''} ≈ <b>${e.estCredits} credits</b><br>
        <span style="color:var(--soft)">an upper estimate — you're billed per actual generation; you have ${S.user?.credits ?? '?'} credits</span></p></div>
      <button class="btn btn-coral" id="wz-go" style="width:100%;margin-top:10px">🚀 Build this world · ≈${e.estCredits} credits</button>` : ''}`;
    const go = $('#wz-go');
    if (go) go.onclick = startBuild;
  }

  async function send() {
    const text = $('#wz-in').value.trim(); if (!text || W.busy) return;
    $('#wz-in').value = ''; W.busy = true;
    addMsg('user', text); W.history.push({ role: 'user', content: text });
    const status = addMsg('status', '🧙 conjuring…');
    try {
      const out = await api('/api/wizard/chat', { method: 'POST', body: { message: text, history: W.history.slice(0, -1), lang: getLang() } });
      status.remove();
      addMsg('assistant', out.reply || '…'); W.history.push({ role: 'assistant', content: out.reply || '' });
      if (out.plan) { W.plan = out.plan; W.estimate = out.estimate; renderPlan(); }
      refreshMe();
    } catch (e) { status.remove(); addMsg('assistant', '😔 I lost my train of thought: ' + e.message); }
    W.busy = false;
  }
  $('#wz-send').onclick = send;
  $('#wz-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };

  // Approval → background build → poll + stream the build diary until the world is live.
  async function startBuild() {
    try {
      const { jobId } = await api('/api/wizard/build', { method: 'POST', body: { plan: W.plan, lang: getLang() } });
      W.jobId = jobId;
      addMsg('status', '🏗 building — grab a tea, this takes a few minutes. You can leave this screen; the build continues.');
      pollBuild();
    } catch (e) { fail(e); }
  }
  async function pollBuild() {
    const panel = $('#wz-build'); if (!panel) return;
    panel.style.display = 'block';
    try {
      const { job } = await api(`/api/wizard/jobs/${W.jobId}`);
      panel.innerHTML = `
        <b style="font-size:13px">🏗 ${job.status === 'done' ? 'World ready!' : job.status === 'error' ? 'Build failed' : 'Building…'}</b>
        <div style="font-size:11px;color:var(--soft);margin:3px 0 6px">${esc(job.stage || '')}</div>
        <div class="strength"><div style="width:${Math.round((job.progress || 0) * 100)}%"></div></div>
        <div style="font-size:10.5px;color:#4b4573;max-height:180px;overflow-y:auto;margin-top:8px;font-family:monospace">${(job.log || []).slice(-25).map(esc).join('<br>')}</div>
        ${job.status === 'done' && job.worldId ? `<button class="btn btn-primary" id="wz-open" style="width:100%;margin-top:10px">▶ Open "${esc(W.plan?.title || 'the world')}"</button>` : ''}
        ${job.status === 'error' ? `<div style="font-size:11.5px;color:#d92e66;margin-top:8px">${esc(job.error || '')}</div>` : ''}`;
      refreshMe();
      if (job.status === 'done') {
        const open = $('#wz-open');
        if (open) open.onclick = () => { W.history = []; W.plan = null; W.estimate = null; W.jobId = null; S.world = job.worldId; S.worldData = null; nav(`#/stage?w=${job.worldId}`); };
        toast('Your world is ready 🌍', 'gold');
        return;
      }
      if (job.status === 'error') return;
      if (location.hash.includes('wizard')) setTimeout(pollBuild, 3000);
    } catch (e) { /* job polling is best-effort; the build continues server-side regardless */ }
  }
}

/* ───────── pan/zoom helper ───────── */
function panZoom(wrap, viewport, opts = {}) {
  let tx = opts.x ?? 40, ty = opts.y ?? 40, scale = opts.scale ?? 1;
  const apply = () => viewport.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  apply();
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => { if (e.button === 2 || e.target.closest('.gnode,.lnode,.gedge,.gedge-label')) return; drag = { x: e.clientX - tx, y: e.clientY - ty }; wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener('pointermove', (e) => { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
  wrap.addEventListener('pointerup', () => drag = null);
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    const ns = Math.min(2.5, Math.max(0.3, scale * f));
    const r = wrap.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    tx = mx - (mx - tx) * (ns / scale); ty = my - (my - ty) * (ns / scale); scale = ns; apply();
  }, { passive: false });
  return { zoom: (f) => { scale = Math.min(2.5, Math.max(0.3, scale * f)); apply(); }, getScale: () => scale, cancelDrag: () => { drag = null; } };
}

/* ───────── bonds (the Web) ───────── */
async function bondsScreen() {
  const { world, characters, relationships } = await loadWorld(true);
  app.innerHTML = chrome('bonds', { worldTitle: 'The Web', sub: 'bonds · who feels what about whom' }) + `
  <div class="screen bare"><div class="canvas-wrap" id="wrap">
    <svg id="gsvg"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#6d4aff"/></marker></defs><g id="vp"></g></svg>
  </div></div>
  <div class="floating-toolbar"><button class="btn btn-primary small" id="newbond">+ New bond</button><button class="btn btn-soft small" id="zin">+</button><button class="btn btn-soft small" id="zout">-</button></div>
  <div class="side-panel" id="bondpanel" style="display:none"></div>`;
  bindChrome();
  const vp = $('#vp');
  // simple layout: circle
  const N = characters.length, cx = 430, cy = 300, R = Math.max(240, N * 62);
  const pos = {};
  characters.forEach((c, i) => { const a = (i / Math.max(N, 1)) * Math.PI * 2 + Math.PI; pos[c.id] = { x: cx + R * Math.cos(a), y: cy + R * 0.62 * Math.sin(a) }; });
  // lane assignment: every bond between the same pair gets its own arc + label slot
  const lanes = {};
  {
    const byPair = {};
    relationships.forEach(r => { const k = [r.from_id, r.to_id].sort().join('|'); (byPair[k] = byPair[k] || []).push(r); });
    Object.values(byPair).forEach(list => {
      const rankBySide = {};
      list.forEach(r => {
        const side = r.from_id < r.to_id ? 1 : -1;
        const rank = rankBySide[side] = (rankBySide[side] ?? -1) + 1;
        lanes[r.id] = { side, rank, solo: list.length === 1 };
      });
    });
  }
  const shrink = (from, toward, dist) => { const dx = toward.x - from.x, dy = toward.y - from.y, l = Math.hypot(dx, dy) || 1; return { x: from.x + dx / l * dist, y: from.y + dy / l * dist }; };
  const edgePath = (r) => {
    const a = pos[r.from_id], b = pos[r.to_id]; if (!a || !b) return null;
    const { side, rank, solo } = lanes[r.id];
    const off = solo ? 16 * side : side * (34 + rank * 40);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // canonical normal (independent of edge direction) so opposing bonds bulge to opposite sides
    const a0 = r.from_id < r.to_id ? a : b, b0 = r.from_id < r.to_id ? b : a;
    const ndx = b0.x - a0.x, ndy = b0.y - a0.y, len = Math.hypot(ndx, ndy) || 1;
    const px = mx - (ndy / len) * off, py = my + (ndx / len) * off;
    const sa = shrink(a, { x: px, y: py }, 52), sb = shrink(b, { x: px, y: py }, 56);
    // each lane's label sits at a different point along its own arc; opposing directions mirror
    const t = side > 0 ? Math.min(0.5, 0.26 + rank * 0.18) : Math.max(0.5, 0.74 - rank * 0.18);
    const u = 1 - t;
    const lx = u * u * sa.x + 2 * u * t * px + t * t * sb.x;
    const ly = u * u * sa.y + 2 * u * t * py + t * t * sb.y;
    return { d: `M${sa.x},${sa.y} Q${px},${py} ${sb.x},${sb.y}`, lx, ly };
  };
  const labelPill = (r, e) => {
    const txt = `"${r.description.slice(0, 34)}${r.description.length > 34 ? '…' : ''}"`;
    const w = txt.length * 5.3 + 18, h = 20;
    return `<g class="gedge-labelg" data-id="${r.id}" style="cursor:pointer">
      <rect x="${e.lx - w / 2}" y="${e.ly - h / 2 - 4}" width="${w}" height="${h}" rx="10"
        fill="#fff" stroke="#d9d2f5" stroke-width="1.2" filter="drop-shadow(0 2px 4px rgba(34,31,69,.14))"/>
      <text class="gedge-label" x="${e.lx}" y="${e.ly + 1}">${esc(txt)}</text></g>`;
  };
  vp.innerHTML = relationships.map(r => { const e = edgePath(r); return e ? `<path class="gedge" data-id="${r.id}" d="${e.d}"/>` : ''; }).join('') +
    relationships.map(r => { const e = edgePath(r); return e ? labelPill(r, e) : ''; }).join('') +
    characters.map(c => {
      const nw = c.name.length * 8.5 + 24;
      return `<g class="gnode" data-id="${c.id}" transform="translate(${pos[c.id].x},${pos[c.id].y})" style="cursor:pointer">
      <circle class="body" r="46" stroke="${['#6d4aff', '#14b8bf', '#ff5b8f', '#f0a92e'][characters.indexOf(c) % 4]}"/>
      <image href="${assetUrl(cutoutFor(c))}" x="-46" y="-42" width="92" height="130" preserveAspectRatio="xMidYMin slice"/>
      <rect x="${-nw / 2}" y="54" width="${nw}" height="24" rx="12" fill="#fff" stroke="#e7e2f7" filter="drop-shadow(0 2px 4px rgba(34,31,69,.12))"/>
      <text y="70">${esc(c.name)}</text></g>`;
    }).join('');
  const pz = panZoom($('#wrap'), vp);
  $('#zin').onclick = () => pz.zoom(1.2); $('#zout').onclick = () => pz.zoom(0.84);
  $$('.gnode').forEach(n => n.onclick = () => profileDrawer(n.dataset.id));
  const openBond = (id) => {
    const r = relationships.find(x => x.id === id); if (!r) return;
    const from = characters.find(c => c.id === r.from_id), to = characters.find(c => c.id === r.to_id);
    const at = r.attributes || {};
    $$('.gedge').forEach(x => x.classList.toggle('sel', x.dataset.id === id));
    const p = $('#bondpanel'); p.style.display = 'block';
    p.innerHTML = `<h4>Selected bond</h4><div class="sub">${esc(from?.name)} → ${esc(to?.name)}${at.nature ? ` · <b style="color:#d92e66">${esc(at.nature)}</b>` : ''}</div>
      <div class="attr" style="background:#fff2f6;border-color:#ffd6e3"><p class="serif" style="font-style:italic">"${esc(r.description)}"</p></div>
      <div class="battr">
        <h6>Strength</h6><div class="strength"><div style="width:${(r.strength * 100) | 0}%"></div></div>
        ${(at.common_goals || []).length ? `<h6>🎯 Common goals</h6>${at.common_goals.map(g => `<div class="item">${esc(g)}</div>`).join('')}` : ''}
        ${(at.conflicts || []).length ? `<h6>⚡ Frictions</h6>${at.conflicts.map(g => `<div class="item">${esc(g)}</div>`).join('')}` : ''}
        ${(at.shared_experiences || []).length ? `<h6>📸 Shared experiences</h6>${at.shared_experiences.slice(-5).reverse().map(sx => `<div class="item"><small style="color:var(--soft)">tick ${sx.tick} · </small>${esc(sx.text)}</div>`).join('')}` : ''}
        <h6>🕰 History</h6>
        ${(r.history || []).slice(-6).reverse().map(h => `<div class="item"><small style="color:var(--soft)">tick ${h.tick} · </small>${esc(h.note)}</div>`).join('') || '<small style="color:var(--soft)">No shifts yet — bonds evolve as the story runs.</small>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-soft small" id="editbond">✏️ Edit</button><button class="btn btn-ghost small" id="delbond">🗑</button></div>`;
    $('#editbond').onclick = () => bondEditModal(r, from, to, () => { S.worldData = null; bondsScreen(); });
    $('#delbond').onclick = async () => { if (confirm('Remove this bond?')) { await api(`/api/relationships/${r.id}`, { method: 'DELETE' }); S.worldData = null; bondsScreen(); } };
  };
  $$('.gedge,.gedge-labelg').forEach(e => e.onclick = () => openBond(e.dataset.id));
  $('#newbond').onclick = () => bondBuilderModal(characters, () => { S.worldData = null; bondsScreen(); });
  if (!characters.length) $('#wrap').insertAdjacentHTML('beforeend', '<div class="empty-hint" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center"><div class="big">🕸</div>Forge characters first, then wire their bonds here.</div>');
}
function bondEditModal(r, from, to, done) {
  const at = r.attributes || {};
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><div class="modal-head coral"><div><b>✏️ ${esc(from?.name)} → ${esc(to?.name)}</b><small>edit this bond — the storyteller honours it from the next tick</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="display:flex;flex-direction:column;gap:9px;font-size:12.5px">
    <label>How ${esc(from?.name)} feels (their own words)
      <div class="field" id="be-descf" style="margin-top:4px"><input id="be-desc" value="${esc(r.description)}"></div></label>
    <label>Nature of the bond <input id="be-nature" value="${esc(at.nature || '')}" placeholder="e.g. childhood friends turned rivals" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:7px 11px;margin-top:4px"></label>
    <label>Strength <input type="range" id="be-str" min="0" max="1" step="0.05" value="${r.strength}"></label>
    <label>Common goals (one per line)<textarea id="be-goals" rows="2" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:7px 11px;margin-top:4px">${esc((at.common_goals || []).join('\n'))}</textarea></label>
    <label>Frictions / conflicts (one per line)<textarea id="be-conf" rows="2" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:7px 11px;margin-top:4px">${esc((at.conflicts || []).join('\n'))}</textarea></label>
    <div style="display:flex;justify-content:flex-end;gap:9px"><button class="btn btn-ghost" id="be-cancel">Cancel</button><button class="btn btn-coral" id="be-save">Save bond</button></div>
  </div></div>`;
  document.body.appendChild(m);
  attachMic($('#be-descf', m), $('#be-desc', m));
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove(); $('#be-cancel', m).onclick = () => m.remove();
  $('#be-save', m).onclick = async () => {
    const lines = (el) => $(el, m).value.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      await api(`/api/relationships/${r.id}`, { method: 'PATCH', body: {
        description: $('#be-desc', m).value, strength: +$('#be-str', m).value,
        attributes: { nature: $('#be-nature', m).value, common_goals: lines('#be-goals'), conflicts: lines('#be-conf') } } });
      toast('Bond rewritten 💞'); m.remove(); done?.();
    } catch (e) { fail(e); }
  };
}

// Pick two characters (from → to) by clicking their portraits, then describe the bond.
function bondBuilderModal(characters, done, seed = {}) {
  if (characters.length < 2) return toast('You need at least two characters', 'err');
  let fromId = seed.fromId || null, toId = seed.toId || null;
  const m = document.createElement('div');
  m.className = 'modal-bg';
  const tile = (c) => `<div class="cast-tile bond-pick" data-id="${c.id}">
      <div class="ring"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div>
      <b>${esc(c.name)}</b><div class="mood">${esc(c.state.mood || '')}</div></div>`;
  m.innerHTML = `<div class="modal big"><div class="modal-head coral"><div><b>🔗 New bond</b><small>click who it's <b>from</b>, then who it points <b>to</b></small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div class="bond-slots">
      <div class="bond-slot" id="slot-from"><div class="ph">From…</div></div>
      <div class="bond-arrow">→</div>
      <div class="bond-slot" id="slot-to"><div class="ph">To…</div></div>
    </div>
    <div id="bond-step" style="text-align:center;font-size:12.5px;color:var(--violet);font-weight:600;margin:4px 0 12px">Step 1 — click who the bond is <b>from</b></div>
    <div class="jump-cast" id="bond-grid">${characters.map(tile).join('')}</div>
    <div id="bond-desc-wrap" style="display:none;max-width:520px;margin:16px auto 0">
      <label style="font-size:12.5px;font-weight:600" id="bond-desc-label">How do they feel?</label>
      <div class="field" id="bond-descf" style="margin-top:6px"><input id="bond-desc" placeholder="in their own words — e.g. secretly in love; sees them as a rival"></div>
      <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px"><button class="btn btn-ghost" id="bond-reset">↺ Start over</button><button class="btn btn-coral" id="bond-create">Create bond 💞</button></div>
    </div>
  </div></div>`;
  document.body.appendChild(m);
  attachMic($('#bond-descf', m), $('#bond-desc', m));
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  const charById = (id) => characters.find(c => c.id === id);
  const fillSlot = (slot, c) => { $(slot, m).innerHTML = c ? `<div class="ring" style="width:70px;height:70px"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div><b style="font-size:13px">${esc(c.name)}</b>` : `<div class="ph">${slot.includes('from') ? 'From…' : 'To…'}</div>`; };
  function refresh() {
    $$('.bond-pick', m).forEach(t => { t.classList.toggle('sel-from', t.dataset.id === fromId); t.classList.toggle('sel-to', t.dataset.id === toId); });
    fillSlot('#slot-from', charById(fromId)); fillSlot('#slot-to', charById(toId));
    const step = $('#bond-step', m), wrap = $('#bond-desc-wrap', m);
    if (!fromId) { step.innerHTML = 'Step 1 — click who the bond is <b>from</b>'; wrap.style.display = 'none'; }
    else if (!toId) { step.innerHTML = `Step 2 — click who <b>${esc(charById(fromId).name)}</b>'s bond points <b>to</b>`; wrap.style.display = 'none'; }
    else {
      step.innerHTML = `<b>${esc(charById(fromId).name)}</b> → <b>${esc(charById(toId).name)}</b>`;
      $('#bond-desc-label', m).innerHTML = `How does <b>${esc(charById(fromId).name)}</b> feel about <b>${esc(charById(toId).name)}</b>?`;
      wrap.style.display = 'block'; $('#bond-desc', m).focus();
    }
  }
  $$('.bond-pick', m).forEach(t => t.onclick = () => {
    const id = t.dataset.id;
    if (!fromId) fromId = id;
    else if (id === fromId) fromId = null;               // click the from again to deselect
    else if (!toId) toId = id;
    else if (id === toId) toId = null;
    else toId = id;                                       // re-pick target
    refresh();
  });
  $('#bond-reset', m).onclick = () => { fromId = seed.lockFrom ? fromId : null; toId = null; refresh(); };
  $('#bond-create', m).onclick = async () => {
    const desc = $('#bond-desc', m).value.trim() || 'a new connection';
    try { await api(`/api/worlds/${S.world}/relationships`, { method: 'POST', body: { fromId, toId, description: desc } }); toast('Bond created 💞'); m.remove(); done?.(); } catch (e) { fail(e); }
  };
  refresh();
}

/* ───────── atlas ───────── */
/* ── 🎬 World Direction modal ──────────────────────────────────────────────────
   Edits the world's tone knobs (genre, mood, pacing) and its standing DIRECTIVES —
   the free-text block that rides in every tick's world bible. New worlds start with
   DEFAULT_WORLD_DIRECTIVES (rich social fabric, cinematic amplification, mature
   content only when story-serving); this modal lets the player rewrite all of it,
   with a reset back to that default (fetched from the server so it never drifts). */
async function worldDirectionModal(world) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:640px"><div class="modal-head teal">
    <div><b>🎬 World Direction</b><small>the standing instructions every scene is written under</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <label style="font-size:12px;font-weight:600">Genre <input id="wd-genre" value="${esc(world.genre || '')}" style="display:block;border:1px solid var(--line);border-radius:9px;padding:6px 9px;width:170px"></label>
      <label style="font-size:12px;font-weight:600">Mood <input id="wd-mood" value="${esc(world.mood || '')}" style="display:block;border:1px solid var(--line);border-radius:9px;padding:6px 9px;width:150px"></label>
      <label style="font-size:12px;font-weight:600">Pacing <span id="wd-pv" style="font-weight:400;color:var(--soft)">${Math.round((world.pacing ?? 0.4) * 100)}%</span>
        <input id="wd-pacing" type="range" min="0" max="1" step="0.05" value="${world.pacing ?? 0.4}" style="display:block;width:170px"></label>
    </div>
    <label style="font-size:12px;font-weight:600">Directives — how this world and its story should behave</label>
    <textarea id="wd-dir" rows="12" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:9px 11px;font-size:12.5px;margin-top:4px">${esc(world.directives || '')}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" id="wd-save" style="flex:1">Save direction</button>
      <button class="btn btn-ghost" id="wd-reset">↺ Reset to default</button>
    </div>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  $('#wd-pacing', m).oninput = () => { $('#wd-pv', m).textContent = Math.round(+$('#wd-pacing', m).value * 100) + '%'; };
  $('#wd-reset', m).onclick = async () => {
    const { directives } = await api('/api/world-direction-default');
    $('#wd-dir', m).value = directives;
  };
  $('#wd-save', m).onclick = async () => {
    try {
      await api(`/api/worlds/${S.world}`, { method: 'PATCH', body: {
        genre: $('#wd-genre', m).value, mood: $('#wd-mood', m).value,
        pacing: +$('#wd-pacing', m).value, directives: $('#wd-dir', m).value } });
      toast('World direction saved 🎬', 'gold');
      S.worldData = null; m.remove();
    } catch (e) { fail(e); }
  };
}

async function atlasScreen() {
  const { world, locations, paths, characters } = await loadWorld(true);
  app.innerHTML = chrome('world', { worldTitle: 'The Atlas', sub: 'world · places & paths' }) + `
  <div class="screen bare"><div class="canvas-wrap" id="wrap"><svg id="asvg"><g id="vp"></g></svg></div></div>
  <div class="floating-toolbar"><button class="btn btn-primary small" id="newloc">+ Location</button><button class="btn btn-soft small" id="newpath">🔗 Connect</button><button class="btn btn-teal small" id="direction">🎬 Direction</button><button class="btn btn-soft small" id="curiosity">💡 Curiosity</button><button class="btn btn-soft small" id="zin">+</button><button class="btn btn-soft small" id="zout">-</button></div>
  <div class="side-panel" id="locpanel" style="display:none"></div>`;
  bindChrome();
  $('#direction').onclick = () => worldDirectionModal(world);
  $('#curiosity').onclick = curiosityModal;
  const vp = $('#vp');
  const NW = 130, NH = 92;
  const groups = {};
  locations.forEach(l => { if (l.place_group) (groups[l.place_group] = groups[l.place_group] || []).push(l); });
  const groupRects = Object.entries(groups).map(([name, ls]) => {
    const xs = ls.map(l => l.x), ys = ls.map(l => l.y);
    return { name, x: Math.min(...xs) - 26, y: Math.min(...ys) - 40, w: Math.max(...xs) - Math.min(...xs) + NW + 52, h: Math.max(...ys) - Math.min(...ys) + NH + 66 };
  });
  const center = (l) => ({ x: l.x + NW / 2, y: l.y + NH / 2 });
  const who = (lid) => characters.filter(c => c.state.location_id === lid);
  vp.innerHTML =
    groupRects.map(g => `<g class="lgroup" data-g="${esc(g.name)}"><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="18"/><text x="${g.x + 14}" y="${g.y + 22}">${esc(g.name)}</text></g>`).join('') +
    paths.map(p => { const a = locations.find(l => l.id === p.from_id), b = locations.find(l => l.id === p.to_id); if (!a || !b) return ''; const ca = center(a), cb = center(b); return `<path class="lpath" d="M${ca.x},${ca.y} L${cb.x},${cb.y}"/>`; }).join('') +
    locations.map(l => `<g class="lnode" data-id="${l.id}" transform="translate(${l.x},${l.y})" style="cursor:pointer">
      <rect class="frame" width="${NW}" height="${NH}" rx="14"/>
      ${l.background_asset_id ? `<image href="${assetUrl(l.background_asset_id)}" x="5" y="5" width="${NW - 10}" height="${NH - 28}" preserveAspectRatio="xMidYMid slice" style="clip-path:inset(0 round 9px)"/>` : `<rect x="5" y="5" width="${NW - 10}" height="${NH - 28}" rx="9" fill="#efecfb"/>`}
      <text x="${NW / 2}" y="${NH - 8}">${esc(l.name)}</text>
      ${who(l.id).map((c, i) => `<image class="avatar-badge" href="${assetUrl(cutoutFor(c))}" x="${NW - 26 - i * 20}" y="-12" width="24" height="24" preserveAspectRatio="xMidYMin slice"><title>${esc(c.name)}</title></image>`).join('')}
    </g>`).join('');
  const pz = panZoom($('#wrap'), vp, { x: 30, y: 60, scale: 0.9 });
  $('#zin').onclick = () => pz.zoom(1.2); $('#zout').onclick = () => pz.zoom(0.84);

  /* ── Group unclutter-drag ────────────────────────────────────────────────
     Place groups sometimes overlap. Two ways to move a whole group (all its
     member locations shift together; positions persist):
       desktop — hold the RIGHT mouse button on a group frame and drag;
       mobile  — press and HOLD a group frame ~1s until it lights up, then
                 drag. (A short touch-drag still pans the map as usual.)   */
  const wrapEl = $('#wrap');
  wrapEl.addEventListener('contextmenu', (e) => { if (e.target.closest('.lgroup')) e.preventDefault(); });
  let gdrag = null;      // { name, members, startX, startY, dx, dy, el }
  let holdTimer = null;
  const startGroupDrag = (gEl, e) => {
    const name = gEl.dataset.g;
    gdrag = { name, members: groups[name] || [], startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, el: gEl };
    gEl.classList.add('grabbed');
    pz.cancelDrag();     // if a pan had started on this touch, stop it
  };
  const moveGroupDrag = (e) => {
    if (!gdrag) return;
    const s = pz.getScale();
    gdrag.dx = (e.clientX - gdrag.startX) / s;
    gdrag.dy = (e.clientY - gdrag.startY) / s;
    gdrag.el.setAttribute('transform', `translate(${gdrag.dx},${gdrag.dy})`);
    for (const l of gdrag.members) {
      const node = vp.querySelector(`.lnode[data-id="${l.id}"]`);
      if (node) node.setAttribute('transform', `translate(${l.x + gdrag.dx},${l.y + gdrag.dy})`);
    }
  };
  const endGroupDrag = async () => {
    if (!gdrag) return;
    const { members, dx, dy, el } = gdrag;
    gdrag = null;
    el.classList.remove('grabbed');
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;                    // just a tap
    await Promise.all(members.map(l => api(`/api/locations/${l.id}`, { method: 'PATCH', body: { x: l.x + dx, y: l.y + dy } }).catch(fail)));
    S.worldData = null; atlasScreen();                                    // re-render paths cleanly
  };
  wrapEl.addEventListener('pointerdown', (e) => {
    const gEl = e.target.closest('.lgroup');
    if (!gEl) return;
    if (e.button === 2) { e.preventDefault(); e.stopPropagation(); startGroupDrag(gEl, e); return; }
    if (e.pointerType === 'touch') {
      // long-press to grab; any early movement > 12px means the user is panning
      const sx = e.clientX, sy = e.clientY;
      holdTimer = setTimeout(() => { startGroupDrag(gEl, { clientX: sx, clientY: sy }); if (navigator.vibrate) navigator.vibrate(30); }, 900);
      const cancel = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) { clearTimeout(holdTimer); wrapEl.removeEventListener('pointermove', cancel); } };
      wrapEl.addEventListener('pointermove', cancel);
      wrapEl.addEventListener('pointerup', () => { clearTimeout(holdTimer); wrapEl.removeEventListener('pointermove', cancel); }, { once: true });
    }
  }, true);
  wrapEl.addEventListener('pointermove', moveGroupDrag);
  wrapEl.addEventListener('pointerup', endGroupDrag);
  wrapEl.addEventListener('pointercancel', () => { clearTimeout(holdTimer); endGroupDrag(); });
  const openLoc = (id) => {
    const l = locations.find(x => x.id === id); if (!l) return;
    $$('.lnode').forEach(n => n.classList.toggle('sel', n.dataset.id === id));
    const conns = paths.filter(p => p.from_id === id || p.to_id === id)
      .map(p => locations.find(x => x.id === (p.from_id === id ? p.to_id : p.from_id))?.name).filter(Boolean);
    const p = $('#locpanel'); p.style.display = 'block';
    p.innerHTML = `<h4>Selected location</h4><div class="sub">${esc(l.type)} · ${esc(l.place_group || 'unclustered')}</div>
      ${l.background_asset_id ? `<img class="bgprev" src="${assetUrl(l.background_asset_id)}">` : '<div class="shimmer" style="height:120px"></div>'}
      <h4 style="margin-top:10px">${esc(l.name)}</h4>
      <p style="font-size:12px;color:#4b4573">${esc(l.description || '')}</p>
      <button class="btn btn-teal small" id="genbg" style="width:100%;margin:4px 0 12px">${l.background_asset_id ? '↻ Regenerate background' : '🎨 Generate background'}</button>
      <h5 style="font-size:10px;letter-spacing:.12em;color:var(--violet);margin:0 0 5px">GROUP</h5>
      <select id="locgroup" style="width:100%;border:1.5px solid var(--line);border-radius:9px;padding:7px 9px;font-family:inherit;font-size:12px;margin-bottom:12px">
        <option value="">— no group —</option>
        ${[...new Set(locations.map(x => x.place_group).filter(Boolean))].map(g => `<option ${g === l.place_group ? 'selected' : ''}>${esc(g)}</option>`).join('')}
        <option value="__new__">＋ new group…</option>
      </select>
      <h5 style="font-size:10px;letter-spacing:.12em;color:var(--violet);margin:0 0 5px">CONNECTS TO</h5>
      <div>${conns.map(n => `<span class="tag t" style="margin:0 4px 4px 0">${esc(n)}</span>`).join('') || '<small style="color:var(--soft)">nothing yet</small>'}</div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-soft small" id="editloc">✏️ Edit</button></div>
      <div style="margin-top:10px">${who(l.id).map(c => `<span class="tag g" style="margin:0 4px 4px 0">👤 ${esc(c.name)}</span>`).join('')}</div>`;
    $('#genbg').onclick = async () => {
      $('#genbg').disabled = true; $('#genbg').innerHTML = '<span class="spinner"></span> painting…';
      try { await api(`/api/locations/${l.id}/background`, { method: 'POST' }); S.worldData = null; refreshMe(); atlasScreen(); } catch (e) { fail(e); $('#genbg').disabled = false; $('#genbg').textContent = '🎨 Generate background'; }
    };
    // Assign this location to a cluster after the fact (its frame on the map updates live).
    $('#locgroup').onchange = async () => {
      let g = $('#locgroup').value;
      if (g === '__new__') {
        g = (prompt('Name the new group:', '') || '').trim();
        if (!g) { $('#locgroup').value = l.place_group || ''; return; }
      }
      try {
        await api(`/api/locations/${l.id}`, { method: 'PATCH', body: { placeGroup: g } });
        toast(g ? `${l.name} → ${g}` : `${l.name} removed from its group`);
        S.worldData = null; atlasScreen();
      } catch (e) { fail(e); }
    };
    $('#editloc').onclick = async () => {
      const name = prompt('Location name:', l.name); if (name == null) return;
      const desc = prompt('Description (feeds the art prompt):', l.description || '');
      await api(`/api/locations/${l.id}`, { method: 'PATCH', body: { name, description: desc } }).catch(fail);
      S.worldData = null; atlasScreen();
    };
  };
  $$('.lnode').forEach(n => n.onclick = () => openLoc(n.dataset.id));
  $('#newloc').onclick = async () => {
    const name = prompt('Name the place:', 'The corner bakery'); if (!name) return;
    const group = prompt('Place group (cluster), or leave empty:', '');
    const desc = prompt('Short description (feeds the art prompt):', '');
    await api(`/api/worlds/${S.world}/locations`, { method: 'POST', body: { name, placeGroup: group, description: desc } }).catch(fail);
    S.worldData = null; atlasScreen();
  };
  $('#newpath').onclick = async () => {
    const list = locations.map((l, i) => `${i + 1}. ${l.name}`).join('\n');
    const a = prompt('Connect FROM:\n' + list, '1'), b = prompt('…TO:\n' + list, '2');
    const la = locations[+a - 1], lb = locations[+b - 1];
    if (!la || !lb || la === lb) return;
    await api(`/api/worlds/${S.world}/paths`, { method: 'POST', body: { fromId: la.id, toId: lb.id } }).catch(fail);
    S.worldData = null; atlasScreen();
  };
  if (!locations.length) $('#wrap').insertAdjacentHTML('beforeend', '<div class="empty-hint" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center"><div class="big">🗺</div>Add your first location — a room, a café, anywhere life happens.</div>');
}

/* ───────── genesis ───────── */
async function genesisScreen() {
  const { world, characters, locations } = await loadWorld(true);
  const GENRES = ['Slice-of-life', 'Romance', 'Mystery', 'Sci-fi', 'Comedy', 'Horror'];
  const MOODS = ['cosy', 'bittersweet', 'tense', 'whimsical', 'melancholic'];
  app.innerHTML = chrome('play', { worldTitle: 'Genesis', sub: world.title + ' · set the tone & begin' }) + `
  <div class="screen"><div class="container" style="max-width:940px">
    <div class="genesis-layout">
      <div class="panel">
        <p class="eyebrow">Set the tone</p><h2 style="margin:0 0 10px;font-size:22px">Story settings</h2>
        <h5 style="font-size:10px;letter-spacing:.14em;color:var(--violet)">GENRE</h5>
        <div class="genre-cards">${GENRES.map(g => `<div class="genre-card ${world.genre === g.toLowerCase() ? 'sel' : ''}" data-g="${g.toLowerCase()}">${g}</div>`).join('')}</div>
        <h5 style="font-size:10px;letter-spacing:.14em;color:var(--violet)">MOOD</h5>
        <div class="mood-chips">${MOODS.map(mo => `<div class="mood-chip ${world.mood === mo ? 'sel' : ''}" data-m="${mo}">${mo}</div>`).join('')}</div>
        <h5 style="font-size:10px;letter-spacing:.14em;color:var(--violet)">PACING</h5>
        <input type="range" id="pacing" min="0" max="1" step="0.1" value="${world.pacing}">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--soft)"><span>slow & quiet</span><span>eventful</span></div>
        <h5 style="font-size:10px;letter-spacing:.14em;color:var(--violet);margin-top:14px">DIRECTIVES · ride with the storyteller every tick</h5>
        <div class="field" id="dir-field" style="align-items:flex-start"><textarea id="directives" rows="3" class="serif" style="font-style:italic">${esc(world.directives || '')}</textarea></div>
      </div>
      <div class="panel">
        <p class="eyebrow">Where does everyone begin?</p><h2 style="margin:0 0 12px;font-size:22px">Placement</h2>
        <div id="placerows">${characters.map(c => `
          <div class="place-row" data-c="${c.id}">
            <div class="face" style="background-image:url(${assetUrl(cutoutFor(c))})"></div>
            <b style="font-size:13px;width:60px">${esc(c.name)}</b>
            <select>${locations.map(l => `<option value="${l.id}" ${c.state.location_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
            <input placeholder="doing what?" value="${esc(c.state.activity || '')}">
          </div>`).join('')}</div>
        <div style="font-size:11.5px;color:var(--soft);margin:10px 2px">${characters.length} character${characters.length === 1 ? '' : 's'} · ${locations.length} locations · tone ${world.status === 'live' ? 'set ✓' : 'pending'}</div>
        <button class="btn btn-primary" id="begin" style="width:100%;padding:13px;font-size:15px">▶ ${world.status === 'live' ? 'Apply & return to the Stage' : 'Begin the story'}</button>
      </div>
    </div>
  </div></div>`;
  bindChrome();
  let genre = world.genre, mood = world.mood;
  $$('.genre-card').forEach(g => g.onclick = () => { genre = g.dataset.g; $$('.genre-card').forEach(x => x.classList.remove('sel')); g.classList.add('sel'); });
  $$('.mood-chip').forEach(mc => mc.onclick = () => { mood = mc.dataset.m; $$('.mood-chip').forEach(x => x.classList.remove('sel')); mc.classList.add('sel'); });
  $('#begin').onclick = async () => {
    try {
      await api(`/api/worlds/${S.world}`, { method: 'PATCH', body: { genre, mood, pacing: +$('#pacing').value, directives: $('#directives').value } });
      const placement = $$('.place-row').map(r => ({ characterId: r.dataset.c, locationId: $('select', r).value, activity: $('input', r).value }));
      await api(`/api/worlds/${S.world}/genesis`, { method: 'POST', body: { placement } });
      S.worldData = null; toast('🌅 The clock starts now.');
      nav(`#/stage?w=${S.world}`);
    } catch (e) { fail(e); }
  };
}

/* ───────── stage ───────── */
let stageState = { pov: null, playing: null, castSugs: [] };
async function stageScreen() {
  const { world, characters, locations } = await loadWorld(true);
  if (world.status !== 'live') return nav(`#/genesis?w=${S.world}`);
  const [{ ticks }, branchInfo] = await Promise.all([
    api(`/api/worlds/${S.world}/ticks?after=${Math.max(-1, world.tick_index - 2)}`),
    api(`/api/worlds/${S.world}/branches`),
  ]);
  const lastTick = ticks[ticks.length - 1] || null;
  if (!stageState.pov || (stageState.pov.type === 'character' && !characters.find(c => c.id === stageState.pov.id)))
    stageState.pov = { type: 'character', id: characters[0]?.id };

  stageState.delta = stageState.delta || '+1m';
  const povChar = stageState.pov.type === 'character' ? characters.find(c => c.id === stageState.pov.id) : null;
  const locId = stageState.pov.type === 'location' ? stageState.pov.id : povChar?.state.location_id;
  const loc = locations.find(l => l.id === locId) || locations[0];
  const present = characters.filter(c => c.state.location_id === loc?.id);
  const scene = buildScene(lastTick, loc, present, povChar);

  app.innerHTML = `
  <div id="stage-root">
    <div class="stage-bg" style="background-image:url(${assetUrl(loc?.background_asset_id)})"></div>
    <div class="stage-vignette"></div>
    <div class="stage-cast" id="stage-cast">
      ${present.map((c, i) => {
        const n = present.length, x = n === 1 ? 50 : 24 + (52 / Math.max(n - 1, 1)) * i;
        const isPov = c.id === povChar?.id;
        return `<div class="stage-char ${isPov ? 'pov' : ''}" data-id="${c.id}" style="left:${x}%;height:${isPov ? 76 : 71}%">
          <img src="${assetUrl(cutoutFor(c))}" alt="${esc(c.name)}">
          ${c.state.dialogue ? `<div class="bubble talk" data-say="${esc(c.state.dialogue)}" data-c="${c.id}">${esc(c.state.dialogue)}</div>`
            : (isPov && c.state.thought ? `<div class="bubble think" data-say="${esc(c.state.thought)}" data-c="${c.id}">${esc(c.state.thought)}</div>` : '')}
        </div>`;
      }).join('')}
      ${!present.length ? `<div class="empty-hint" style="position:absolute;inset:30% 0;color:#cfc9f2">Nobody is at ${esc(loc?.name || 'this place')} right now.</div>` : ''}
    </div>
    <div id="veil"></div>
  </div>
  <div class="stage-hud" style="display:flex;gap:9px;align-items:center">
    <div class="glasschip" style="color:#efeaff;background:rgba(34,31,69,.6);border-color:rgba(255,255,255,.15)">
      <b>${esc(world.title)}</b><span style="opacity:.75">· ${esc(loc?.name || '')} · tick ${world.tick_index}</span><span style="opacity:.75">🕐 ${fmtClock(world.sim_time)}</span></div>
    <div class="glasschip" style="background:rgba(34,31,69,.6);border-color:rgba(255,255,255,.15);gap:2px;padding:4px">
      <button class="tchip" id="undobtn" title="Undo the last tick" ${branchInfo.canUndo ? '' : 'disabled style="opacity:.35"'}>⟲</button>
      <button class="tchip" id="redobtn" title="Redo" ${branchInfo.canRedo ? '' : 'disabled style="opacity:.35"'}>⟳</button>
      <button class="tchip" id="timelinebtn" title="See the whole timeline & branches">🌿</button>
    </div>
  </div>
  <div id="topbar" style="justify-content:flex-end"><div style="display:flex;gap:9px">
    <button class="glasschip" id="tl-chip" title="Timeline — scroll through every scene, replay or branch">🕰</button>
    <button class="glasschip" id="gm-chip" title="Talk to the Game Master — ask anything, change anything">💬 GM</button>
    <button class="glasschip" id="lang-chip" title="Language / Sprache / Langue / Idioma">🌐 ${getLang().toUpperCase()}</button>
    <div class="glasschip" id="credits-chip"><div class="coin"></div><span id="credits-num">${S.user?.credits ?? '–'}</span></div>
    <button class="glasschip" id="avatar-chip">${esc((S.user?.displayName || '?')[0].toUpperCase())}</button></div></div>
  <button id="fact-bubble" title="Did you know? — curiosity cards" style="display:none">💡</button>
  <div class="here-rail"><span class="hlabel">HERE</span>
    ${present.map(c => `<div class="rail-face ${c.id === povChar?.id ? 'active' : ''}" data-pov="${c.id}" style="background-image:url(${assetUrl(cutoutFor(c))})" title="See through ${esc(c.name)}'s eyes"><span>${esc(c.name)}</span></div>`).join('')}
    <div class="rail-face places" data-places title="Watch a place instead">🗺</div>
  </div>
  <div class="stage-bottom${(localStorage.getItem('viv_panel') ?? (innerWidth <= 760 ? 'collapsed' : '')) === 'collapsed' && innerWidth <= 760 ? ' collapsed' : ''}" id="stage-bottom">
    <!-- mobile-only handle: collapses the controls+storybook so sprites own the small screen -->
    <button class="panel-toggle" id="panel-toggle">📖</button>
    <div class="stage-controls">
      <button class="tchip ${stageState.pov.type === 'character' ? 'sel' : ''}" id="pc">${t('character', 'Character')}</button>
      <button class="tchip ${stageState.pov.type === 'location' ? 'sel' : ''}" id="pl">${t('location', 'Location')}</button>
      <span style="width:1px;height:18px;background:rgba(255,255,255,.2)"></span>
      ${['+1m', '+5m', '+30m', '+1h', '+3h', '+1d'].map(d => `<button class="tchip ${d === stageState.delta ? 'sel' : ''}" data-delta="${d}">${d}</button>`).join('')}
      <button class="tchip ${!['+1m', '+5m', '+30m', '+1h', '+3h', '+1d'].includes(stageState.delta) ? 'sel' : ''}" id="customdelta" title="Choose any time jump">⏱ ${!['+1m', '+5m', '+30m', '+1h', '+3h', '+1d'].includes(stageState.delta) ? stageState.delta.slice(1) : 'custom'}</button>
      <button class="btn btn-primary small" id="advance">${t('advance', '▶ Advance')}</button>
      <button class="btn btn-coral small" id="intervene">${t('intervene', '⚡ Intervene')}</button>
      <span style="width:1px;height:18px;background:rgba(255,255,255,.2)"></span>
      <button class="tchip playbtn" id="tts-play" title="Listen to this moment — narrator & voices in order">▶</button>
      <button class="tchip playbtn" id="tts-pause" title="Pause / resume" style="display:none">⏸</button>
    </div>
    <div class="storybox">
      <div class="storylines" id="storylines">
        ${scene.lines.length ? renderNarration(scene.lines, characters) : `<p class="sline serif" style="color:#9d95c9;font-style:italic">${t('first_page', 'Advance time to turn the first page…')}</p>`}
      </div>
      <div class="story-meta"><span>${esc(scene.meta)}</span><span>${t('listen_hint', '💡 click any line to hear it spoken')}</span></div>
    </div>
  </div>
  <nav id="dock">${['home', 'cast', 'bonds', 'world', 'play', 'share'].map(k => `
    <button class="dock-btn ${k === 'play' ? 'active' : ''}" data-nav="${k}">${ICONS[k]}<span>${dockLabel(k)}</span></button>`).join('')}</nav>`;
  bindChrome();
  initFactBubble();
  // Timeline handoff: a ▶ Replay click stashes the target; play it now that the stage exists.
  if (S.replay) { const r = S.replay; S.replay = null; playReplay(r.branchId, r.idx); return; }
  // Mobile panel collapse (the handle is display:none on desktop). Preference persists.
  const sb = $('#stage-bottom');
  $('#panel-toggle').onclick = () => {
    sb.classList.toggle('collapsed');
    localStorage.setItem('viv_panel', sb.classList.contains('collapsed') ? 'collapsed' : 'open');
  };
  stageState.delta = stageState.delta || '+1m';
  $('#customdelta').onclick = () => customDeltaModal((d) => {
    stageState.delta = d;
    $$('[data-delta]').forEach(x => x.classList.remove('sel'));
    const cb = $('#customdelta'); cb.classList.add('sel'); cb.innerHTML = `⏱ ${d.slice(1)}`;
  });

  $$('[data-pov]').forEach(f => f.onclick = () => { stopNarration(); stageState.pov = { type: 'character', id: f.dataset.pov }; stageScreen(); });
  const openLocPicker = () => locationPickerModal(locations, characters, loc?.id, (l) => { stopNarration(); stageState.pov = { type: 'location', id: l.id }; stageScreen(); });
  $('[data-places]').onclick = openLocPicker;
  $('#pl').onclick = openLocPicker;
  $('#pc').onclick = () => characterPickerModal(characters, locations, povChar?.id, (c) => { stopNarration(); stageState.pov = { type: 'character', id: c.id }; stageScreen(); });
  $$('[data-delta]').forEach(b => b.onclick = () => {
    stageState.delta = b.dataset.delta;
    $$('[data-delta]').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    const cb = $('#customdelta'); if (cb) { cb.classList.remove('sel'); cb.innerHTML = '⏱ custom'; }
  });
  $$('.bubble').forEach(b => b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say, characters.find(c => c.id === b.dataset.c), b); });
  $$('.stage-char').forEach(el => el.onclick = () => mindModal(el.dataset.id));
  bindStoryLines(characters);
  setupNarrationPlayer(scene.lines, characters);

  $('#advance').onclick = () => advanceTick(null);
  $('#intervene').onclick = () => interventionModal(characters, (payload) => advanceTick(payload));
  $('#undobtn').onclick = async () => {
    if (!branchInfo.canUndo) return;
    stopNarration();
    try { await api(`/api/worlds/${S.world}/undo`, { method: 'POST', body: { steps: 1 } }); toast('⟲ Undone — one moment lifted away'); S.worldData = null; stageScreen(); } catch (e) { fail(e); }
  };
  $('#redobtn').onclick = async () => {
    if (!branchInfo.canRedo) return;
    stopNarration();
    try { await api(`/api/worlds/${S.world}/redo`, { method: 'POST', body: { steps: 1 } }); toast('⟳ Redone'); S.worldData = null; stageScreen(); } catch (e) { fail(e); }
  };
  $('#timelinebtn').onclick = () => timelineModal(world);

  async function advanceTick(intervention) {
    $('#veil').innerHTML = `<div class="thinking-veil"><div class="pageturn"></div><div>the world is thinking…</div></div>`;
    $('#advance').disabled = true;
    let cinema = null;   // declared out here so the catch can release a stuck film on stream errors
    stageState.castSugs = [];   // GM cast suggestions arriving with this advance (shown at the end)
    try {
      const res = await fetch(`/api/worlds/${S.world}/ticks`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        // lang = the 🌐 preference: the Game Master writes this tick's story in that language.
        // chapter = the player's time-skip settings (animate on/off + detail level) — for
        // large skips the server may answer with SEVERAL scene-ticks instead of one.
        body: JSON.stringify({ timeDelta: stageState.delta, intervention, perspective: stageState.pov, lang: getLang(), chapter: skipPrefs() }),
      });
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = '', errored = null;
      // Cinematic streaming: a 'chapter' SSE event announces K scenes. Each following
      // 'tick' event is one finished scene — we push it into the cinema queue and start
      // PLAYING scene 1 immediately, while the server is still generating scenes 2..K.
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = /event: (\w+)/.exec(raw)?.[1]; const dataLine = /data: (.*)/.exec(raw)?.[1];
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (ev === 'status') { const v = $('.thinking-veil div:last-child'); if (v) v.textContent = data.message; }
          if (ev === 'chapter') { cinema = { expected: data.count, scenes: [], done: false, cancelled: false }; }
          if (ev === 'tick') {
            // The GM may attach ONE cast suggestion and/or ONE outfit suggestion per scene —
            // queued here and shown AFTER the moment has fully arrived (end of tick / film).
            if (data.cast_suggestion) stageState.castSugs.push({ kind: 'cast', ...data.cast_suggestion });
            if (data.outfit_suggestion) stageState.castSugs.push({ kind: 'outfit', ...data.outfit_suggestion });
            if (data.location_suggestion) stageState.castSugs.push({ kind: 'location', ...data.location_suggestion });
            if (data.fact) { const fb = $('#fact-bubble'); if (fb) { fb.style.display = 'flex'; fb.classList.add('unread'); } }
            if (cinema) {
              cinema.scenes.push(data);
              if (cinema.scenes.length === 1) playCinema(cinema); // roll film on the first scene — rest streams in behind
            }
          }
          if (ev === 'error') errored = data;
          if (ev === 'done') { const c = $('#credits-num'); if (c) c.textContent = data.credits; }
        }
      }
      if (errored) throw Object.assign(new Error(errored.message), { code: errored.code });
      if (cinema) { cinema.done = true; return; }             // playCinema handles the final re-render
      S.worldData = null; stageState.justAdvanced = true; await stageScreen();
      showCastSuggestions();
    } catch (e) {
      if (cinema) cinema.done = true;                         // release a film waiting on scenes that will never come
      $('#veil').innerHTML = ''; const adv = $('#advance'); if (adv) adv.disabled = false; fail(e);
    }
  }
}
// Build the story-box scene for the CURRENTLY-VIEWED location.
// If the latest tick's narration was written for this location, show that rich prose;
// otherwise synthesise a location-accurate snapshot from who is actually present here.
function buildScene(lastTick, loc, present, povChar) {
  if (!lastTick) return { lines: [], meta: 'the book is open', live: false };
  if (lastTick.pov_location_id === loc?.id && (lastTick.narration || []).length)
    return { lines: lastTick.narration, meta: `tick ${lastTick.idx} · ${lastTick.mood_tag || ''} · ${lastTick.time_delta}`, live: true };
  // elsewhere — describe THIS place right now
  const lines = [];
  if (!present.length) {
    lines.push({ speaker: 'narrator', text: `${loc?.name || 'This place'} is quiet and empty right now.`, emotion: 'calm, unhurried' });
  } else {
    lines.push({ speaker: 'narrator', text: `At ${loc?.name}, ${present.map(c => `${c.name} is ${c.state.activity || 'here'}`).join('; ')}.`, emotion: lastTick.mood_tag || 'calm' });
    present.forEach(c => {
      if (c.state.dialogue) lines.push({ speaker: c.id, text: c.state.dialogue, emotion: c.state.mood || '' });
      else if (c.id === povChar?.id && c.state.thought) lines.push({ speaker: c.id, text: c.state.thought, emotion: 'a quiet inner thought' });
    });
  }
  return { lines, meta: `now · at ${loc?.name || '—'} · the story is unfolding elsewhere`, live: false };
}
function renderNarration(lines, characters) {
  // Only real characters get a name/voice; anything else (narrator or a GM-invented walk-on) reads as narration.
  const nameOf = (id) => characters.find(c => c.id === id)?.name || null;
  return (lines || []).map((n, i) => {
    const nm = nameOf(n.speaker);
    const th = nm && n.mode === 'thought';
    return `<p class="sline${th ? ' thought' : ''}" data-line="${i}">${nm ? `<span class="spk">${esc(nm)}${th ? ' 💭' : ''}</span>` : '<span class="spk" style="color:#8f88bd">✦</span>'}<span class="say" data-text="${esc(n.text)}" data-spk="${esc(nm ? n.speaker : 'narrator')}" data-emo="${esc(n.emotion || '')}" data-mode="${esc(n.mode || '')}">${th ? '<i>' + esc(n.text) + '</i>' : esc(n.text)}</span></p>`;
  }).join('');
}

/* ── the narration player: sentence-by-sentence, prefetching, pausable ── */
const player = { active: false, paused: false, idx: 0, audio: null, cache: [], lines: [], chars: [], token: 0 };
function stopNarration() {
  player.token++;
  player.active = false; player.paused = false;
  if (player.audio) { player.audio.pause(); player.audio = null; }
  $$('.bubble.speaking').forEach(b => b.classList.remove('speaking'));
  $$('.sline.playing-line').forEach(l => l.classList.remove('playing-line'));
  const pb = $('#tts-play'); if (pb) { pb.textContent = '▶'; pb.classList.remove('on'); }
  const pp = $('#tts-pause'); if (pp) { pp.style.display = 'none'; pp.textContent = '⏸'; }
  // one-shot idle hook: cinematic playback (playCinema) waits on this to know a scene's
  // narration is over — fires on natural end AND on manual ⏹ (which thus skips the scene)
  const h = player.onIdle; player.onIdle = null; h?.();
}
function setupNarrationPlayer(sceneLines, characters) {
  const lines = (sceneLines || []).filter(n => n.text);
  player.lines = lines; player.chars = characters; player.cache = []; player.idx = 0;
  const playBtn = $('#tts-play'), pauseBtn = $('#tts-pause');
  if (!playBtn) return;
  if (!lines.length) { playBtn.disabled = true; return; }
  const chOf = (spk) => spk === 'narrator' ? null : characters.find(c => c.id === spk);
  const prefetch = (i) => {
    if (i >= lines.length || player.cache[i]) return player.cache[i];
    player.cache[i] = fetchTts(lines[i].text, chOf(lines[i].speaker), lines[i].emotion || '', lines[i].mode || '').catch(e => { player.cache[i] = null; throw e; });
    return player.cache[i];
  };
  // Precompute the WHOLE scene's audio the moment it lands: line 0 fires immediately (it
  // plays first), then every further line staggered 500 ms apart — the stagger gives the
  // TTS API room to breathe instead of a burst of parallel requests, while still getting
  // all chunks generating well ahead of playback (no mid-scene lag). prefetch() dedups via
  // player.cache + ttsInflight, so playFrom's own look-ahead never double-requests.
  // Staleness guard: `player.lines === lines` — a newer scene (next tick / cinema scene)
  // reassigns player.lines, turning this scene's still-pending timers into no-ops.
  if (ttsPrefs().prepare) {
    prefetch(0)?.catch(() => {});
    for (let i = 1; i < lines.length; i++) {
      setTimeout(() => { if (player.lines === lines) prefetch(i)?.catch(() => {}); }, i * 500);
    }
  }
  const highlight = (i, on) => {
    const line = $(`.sline[data-line="${i}"]`);
    if (line) { line.classList.toggle('playing-line', on); if (on) line.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    const spk = lines[i]?.speaker;
    const bub = spk && spk !== 'narrator' ? $(`.bubble[data-c="${spk}"]`) : null;
    if (bub) bub.classList.toggle('speaking', on);
  };
  async function playFrom(i) {
    const tok = player.token;
    if (i >= lines.length) { stopNarration(); return; }
    player.idx = i;
    try {
      const { assetId } = await prefetch(i);
      if (tok !== player.token) return;                            // stopped while fetching
      prefetch(i + 1)?.catch(() => {});                            // stream ahead while this one plays
      prefetch(i + 2)?.catch(() => {});                            // (gen ≈ playback time, so keep two in flight)
      highlight(i, true);
      const a = new Audio(assetUrl(assetId));
      player.audio = a;
      a.onended = () => { highlight(i, false); if (tok === player.token) playFrom(i + 1); };
      a.onerror = () => { highlight(i, false); if (tok === player.token) playFrom(i + 1); };
      await a.play();
      refreshMe();
    } catch (e) {
      if (tok !== player.token) return;
      highlight(i, false);
      // LAIONBox: the speaking character has no cloned reference yet → stop cleanly and
      // open the voice-setup popup for exactly that character so the player can fix it.
      if (e.code === 'VOICE_REF_MISSING') {
        const ch = chOf(lines[i].speaker);
        stopNarration();
        if (ch) voiceRefModal(ch.id);
        return;
      }
      fail(e); stopNarration();
    }
  }
  playBtn.onclick = () => {
    if (player.active) { stopNarration(); return; }
    player.token++; player.active = true; player.paused = false;
    playBtn.textContent = '⏹'; playBtn.classList.add('on');
    pauseBtn.style.display = ''; pauseBtn.textContent = '⏸';
    playFrom(0);
  };
  pauseBtn.onclick = () => {
    if (!player.active || !player.audio) return;
    if (player.paused) { player.audio.play(); player.paused = false; pauseBtn.textContent = '⏸'; }
    else { player.audio.pause(); player.paused = true; pauseBtn.textContent = '▶'; }
  };
  if (stageState.justAdvanced && ttsPrefs().autoplay) { stageState.justAdvanced = false; playBtn.click(); }
  stageState.justAdvanced = false;
}
function bindStoryLines(characters) {
  $$('#storylines .say').forEach(el => el.onclick = () => {
    const spk = el.dataset.spk;
    const ch = characters.find(c => c.id === spk);
    speak(el.dataset.text, ch, el, el.dataset.emo || '', el.dataset.mode || '');
  });
}

/* ── CINEMA: scene-by-scene playback of a multi-event time skip ──────────────
   The server streams a 'chapter' (K planned scenes) followed by K real ticks
   (see server/gm.js runChapter). advanceTick() pushes each arriving tick into
   `cinema.scenes` and calls playCinema() on the FIRST one — so the player is
   already watching scene 1 with voiceover while scenes 2..K are still being
   generated. Per scene:
     transition card (video-export style: "Meanwhile, at the Kitchen" /
     "3 hours later · 14:05") → background + cast + storybook swap to that
     tick's location/outfits → narration autoplays with the usual pipelined
     TTS → when the audio ends, the next scene (waiting if it hasn't streamed
     in yet). ⏹ skips the current scene; ✕ ends the film. Afterwards the Stage
     re-renders at the final world state.                                       */
const cineDelta = (delta) => {
  const m = /^\+(\d+)([smhdw])$/.exec(delta || '');
  if (!m) return 'Later';
  const n = +m[1], w = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' }[m[2]];
  return `${n} ${w}${n === 1 ? '' : 's'} later`;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function playCinema(cinema) {
  const data = await loadWorld();
  $('#veil').innerHTML = '';
  // film HUD: scene counter + end-film control (top-right, over the stage)
  const hud = document.createElement('div');
  hud.id = 'cine-hud';
  hud.innerHTML = `<span class="glasschip" id="cine-count" style="color:#efeaff;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">🎬 scene 1</span>
    <button class="glasschip" id="cine-exit" title="End the film and jump to the outcome" style="color:#ffd9e6;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏭ skip all</button>`;
  $('#stage-root')?.appendChild(hud);
  $('#cine-exit', hud).onclick = () => { cinema.cancelled = true; stopNarration(); };

  let prevLocId = null;
  for (let s = 0; !cinema.cancelled; s++) {
    // wait until scene s has streamed in (or the stream ended = film over)
    let waited = 0;
    while (!cinema.scenes[s] && !cinema.done && !cinema.cancelled) {
      await sleep(350); waited += 350;
      if (waited === 1400) toast('✨ the story continues — next scene is being written…');
    }
    const tick = cinema.scenes[s];
    if (!tick || cinema.cancelled) break;
    const cc = $('#cine-count'); if (cc) cc.textContent = `🎬 scene ${s + 1}${cinema.expected ? ' of ' + cinema.expected : ''}`;
    await showCineTransition(tick, data, prevLocId);
    if (cinema.cancelled) break;
    renderCineScene(tick, data);
    await playSceneNarration(tick, data);
    prevLocId = tick.pov_location_id;
  }
  // settle on the live world state (final tick), controls restored
  hud.remove();
  stopNarration();
  S.worldData = null; stageState.justAdvanced = false;
  await stageScreen();
  showCastSuggestions();   // any "introduce this walk-on?" pitches collected during the film
}

/* ── GM cast suggestions ─────────────────────────────────────────────────────
   The Game Master may end a scene by proposing to promote a WALK-ON character
   (someone it has only voiced in narrator lines) to a full cast member — at most
   one suggestion per scene (server/gm.js validates + rate-limits via the world's
   declined list). The overlay shows the GM's 1-2 sentence pitch verbatim:
     • Not now → POST /cast-dismiss records the name so the GM stops re-pitching
       that character; the story simply continues as-is.
     • Yes → jump into the Forge with a pre-seeded first message; the assistant
       drafts the character from the pitch, paints the first sprite, and the
       player iterates in chat (look, profile, more outfits via the drawer)
       until they hit "Accept & add to cast" — the normal Forge flow.
   Multiple pitches (a chapter can yield one per scene) are shown one at a time. */
/* ── ⏪ REPLAY: watch history again without touching it ─────────────────────
   Launched from the Timeline (▶ Replay on any tick). Runs the cinema renderer
   over the STORED ticks of the chosen branch, from the chosen tick to its head:
   transition cards, backdrops, sprites in their outfits-of-the-time (tick
   states embed the outfit list as it was), narration with audio (cached lines
   play free; unplayed ones generate now and stay cached). Pure playback — the
   world's actual position, branch and state are never modified. ⏹ skips a
   scene; ✕ returns to the live present.                                       */
async function playReplay(branchId, startIdx) {
  const data = await loadWorld();
  const { ticks } = await api(`/api/worlds/${S.world}/export/timeline?branchId=${encodeURIComponent(branchId)}&toIdx=999999999`);
  const start = ticks.findIndex(t => t.idx === startIdx);
  if (start < 0) return toast('That moment is no longer on this timeline', 'err');
  const rep = { cancelled: false };
  const hud = document.createElement('div');
  hud.id = 'cine-hud';
  hud.innerHTML = `<span class="glasschip" id="rep-pos" style="color:#efeaff;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏪ replay</span>
    <button class="glasschip" id="rep-exit" style="color:#ffd9e6;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">✕ back to now</button>`;
  $('#stage-root')?.appendChild(hud);
  $('#rep-exit', hud).onclick = () => { rep.cancelled = true; stopNarration(); };

  let prevLoc = null;
  for (let i = start; i < ticks.length && !rep.cancelled; i++) {
    const tick = ticks[i];
    const rp = $('#rep-pos'); if (rp) rp.textContent = `⏪ replay · tick ${tick.idx} · ${fmtClock(tick.sim_time)}`;
    await showCineTransition(tick, data, prevLoc);
    if (rep.cancelled) break;
    renderCineScene(tick, data);
    await playSceneNarration(tick, data);
    prevLoc = tick.pov_location_id;
  }
  hud.remove();
  stopNarration();
  S.worldData = null;
  if (location.hash.includes('stage')) await stageScreen();   // settle back on the live present
}

/* ── 💡 CURIOSITY: "Did you know" fact cards ────────────────────────────────
   Every Nth tick (💡 Curiosity settings on the Atlas: topics + frequency) the
   storyteller also writes one TRUE, curiosity-evoking fact subtly related to
   the story (psychology, philosophy, science, history, cultures…). The bulb
   on the RIGHT edge of the stage shimmers while something unread waits;
   opening the overlay marks everything read and the bulb goes quiet. Each
   card can be read aloud by the storyteller voice (cached like all audio). */
async function initFactBubble() {
  const fb = $('#fact-bubble');
  if (!fb) return;
  fb.onclick = factOverlay;
  try {
    const { facts, unread } = await api(`/api/worlds/${S.world}/facts`);
    if (facts.length) {
      fb.style.display = 'flex';
      fb.classList.toggle('unread', unread > 0);
    }
  } catch { /* bubble stays hidden */ }
}
let factPlayer = { stop: () => {} };
// Split a fact into speakable chunks: sentence boundaries, but never shorter than
// 8 words — short sentences merge into the next one (tiny TTS calls aren't worth it).
function factChunks(text) {
  const sentences = String(text).match(/[^.!?…]+[.!?…]+["')\]]?\s*/g) || [String(text)];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    buf += s;
    if (buf.trim().split(/\s+/).length >= 8) { chunks.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) {
    if (chunks.length && buf.trim().split(/\s+/).length < 8) chunks[chunks.length - 1] += ' ' + buf.trim();
    else chunks.push(buf.trim());
  }
  return chunks;
}
async function factOverlay() {
  const { facts } = await api(`/api/worlds/${S.world}/facts`);
  if (!facts.length) return;
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:680px"><div class="modal-head gold">
    <div><b>💡 Did you know?</b><small>little pieces of the real world, tucked into your story</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="max-height:70vh;overflow-y:auto;padding:20px 22px">
    ${facts.map(f => `
      <div class="fact-card ${f.read_at ? '' : 'fresh'}" data-fid="${f.id}" style="padding:16px 18px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:9px">
          ${f.topic ? `<span class="tag t" style="font-size:10px">${esc(f.topic)}</span>` : ''}
          <span style="font-size:10.5px;color:var(--soft)">scene #${f.tick_ref}</span>
          <button class="btn btn-soft small" data-speak="${f.id}" style="margin-left:auto;padding:4px 13px" title="Have the storyteller read it">🔊 Read to me</button>
        </div>
        <b class="serif" style="display:block;font-size:17px;margin:9px 0 7px;line-height:1.35">${esc(f.title)}</b>
        <div class="serif fact-body" style="font-size:15px;line-height:1.7;color:#3c3763">${factChunks(f.body).map((ch, k) => `<span class="fact-chunk" data-k="${k}">${esc(ch)} </span>`).join('')}</div>
      </div>`).join('')}
  </div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); factPlayer.stop(); };
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;

  // Storyteller read-aloud, chunk by chunk: chunk 1 requested immediately, the rest
  // staggered 500ms apart (same pipelining as scene audio — the API gets room to
  // breathe while chunk 1 already plays). The chunk being spoken highlights live.
  $$('[data-speak]', m).forEach(btn => {
    let playing = false;
    btn.onclick = async () => {
      if (playing) { factPlayer.stop(); return; }          // button doubles as ⏹ Stop
      factPlayer.stop();                                   // stop any other card first
      playing = true;
      const f = facts.find(x => x.id === btn.dataset.speak);
      const card = m.querySelector(`[data-fid="${f.id}"]`);
      const chunkEls = $$('.fact-chunk', card);
      // read the BODY only, from its first sentence — no headline preamble
      const chunks = chunkEls.map(el => el.textContent.trim());
      const state = { cancelled: false, audio: null };
      factPlayer = { stop: () => { state.cancelled = true; playing = false; if (state.audio) state.audio.pause(); $$('.fact-chunk.speaking', m).forEach(el => el.classList.remove('speaking')); btn.textContent = '🔊 Read to me'; } };
      btn.textContent = '⏹ Stop';
      // fire the requests with the 500ms stagger; the array keeps them in order
      const proms = chunks.map((text, k) => new Promise(res => setTimeout(() =>
        res(fetchTts(text, null, 'curious').catch(() => null)), k * 500)));
      try {
        for (let k = 0; k < chunks.length && !state.cancelled; k++) {
          const r = await proms[k];
          if (!r || state.cancelled) continue;
          const el = chunkEls[k];
          if (el) { el.classList.add('speaking'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
          await new Promise((res) => {
            state.audio = new Audio(assetUrl(r.assetId));
            state.audio.onended = res; state.audio.onerror = res;
            state.audio.play().catch(res);
          });
          if (el) el.classList.remove('speaking');
        }
      } finally {
        if (!state.cancelled) { playing = false; btn.textContent = '🔊 Read to me'; }
        refreshMe();
      }
    };
  });
  // opening counts as reading: clear the unread state, quiet the bulb
  const unreadIds = facts.filter(f => !f.read_at).map(f => f.id);
  for (const id of unreadIds) api(`/api/facts/${id}/read`, { method: 'POST' }).catch(() => {});
  $('#fact-bubble')?.classList.remove('unread');
}

/* ── 🎓 Curiosity topic picker (Atlas toolbar) ──────────────────────────────
   A rich, grouped menu of learning interests + freeform wishes + frequency.
   Saved per world; the storyteller weaves the topics subtly into the story
   AND writes a fact card every Nth tick.                                    */
const CURIO_GROUPS = [
  { name: '🧠 Mind & Psychology', topics: ['Positive psychology', 'Cognitive psychology', 'Social psychology', 'Personality psychology', 'Motivation & habits', 'Emotional intelligence', 'Empathy & compassion', 'Memory & learning'] },
  { name: '🤔 Philosophy', topics: ['Philosophy of mind', 'Consciousness', 'Ethics & moral dilemmas', 'Meaning & purpose', 'Stoicism', 'Existentialism', 'Free will', 'Beauty & aesthetics'] },
  { name: '🔭 Science & Technology', topics: ['Physics', 'Quantum physics', 'Astronomy & space', 'The brain & neuroscience', 'Biology & evolution', 'Mathematics', 'Technology & AI', 'Medicine'] },
  { name: '🌍 World & History', topics: ['History', 'Geography', 'Cultures of the world', 'Languages', 'Art & music history', 'Archaeology', 'Economics'] },
  { name: '💞 Life & Us', topics: ['Friendship', 'Romance & love', 'Social relationships', 'Gratitude', 'Mortality & legacy', 'Resilience', 'Creativity', 'Happiness research'] },
];
async function curiosityModal() {
  const { curiosity } = await api(`/api/worlds/${S.world}/facts`);
  const sel = new Set(curiosity.topics || []);
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:680px"><div class="modal-head gold">
    <div><b>💡 Curiosity</b><small>what would you love to learn while you play?</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="max-height:70vh;overflow-y:auto">
    ${CURIO_GROUPS.map(g => `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--soft);margin-bottom:7px">${g.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${g.topics.map(t0 => `<button class="curio-chip ${sel.has(t0) ? 'sel' : ''}" data-topic="${esc(t0)}">${esc(t0)}</button>`).join('')}
        </div>
      </div>`).join('')}
    <div style="margin:16px 0 12px">
      <label style="font-size:12px;font-weight:600">✍️ Your own topics (freeform)</label>
      <input id="cu-custom" value="${esc(curiosity.custom || '')}" placeholder="e.g. the physics of sound, Japanese aesthetics, bird migration…" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:8px 11px;margin-top:5px">
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <label style="font-size:12px;font-weight:600">📬 A new card every</label>
      <select id="cu-freq" style="border:1.5px solid var(--line);border-radius:9px;padding:6px 9px;font-family:inherit">
        ${[1, 2, 3, 4, 6, 8].map(n => `<option value="${n}" ${n === (curiosity.frequency || 4) ? 'selected' : ''}>${n === 1 ? 'scene' : n + ' scenes'}</option>`).join('')}
      </select>
    </div>
    <p style="font-size:11.5px;color:var(--soft);margin-bottom:12px">Your picks also colour the story itself — subtly: a character's interest, a book on a table, a passing conversation. Never a lecture.</p>
    <button class="btn btn-primary" id="cu-save" style="width:100%">Save curiosity</button>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  $$('.curio-chip', m).forEach(ch => ch.onclick = () => {
    const t0 = ch.dataset.topic;
    if (sel.has(t0)) { sel.delete(t0); ch.classList.remove('sel'); } else { sel.add(t0); ch.classList.add('sel'); }
  });
  $('#cu-save', m).onclick = async () => {
    try {
      await api(`/api/worlds/${S.world}/curiosity`, { method: 'PATCH', body: { topics: [...sel], custom: $('#cu-custom', m).value, frequency: +$('#cu-freq', m).value } });
      toast('💡 Curiosity saved — new cards will start appearing', 'gold');
      m.remove();
    } catch (e) { fail(e); }
  };
}

/* ── 💬 GAME MASTER CHAT ─────────────────────────────────────────────────────
   An out-of-character assistant overlay (💬 GM chip in the top bar). The player
   talks ABOUT the game: ask anything about the story (the GM sees the same
   context the tick engine does) or request changes — new characters with bonds,
   sprites, places, attribute patches, bond edits, world direction. The GM
   PROPOSES actions; the player Applies or Discards them (server: gmChat /
   gmApplyActions in gm.js). This conversation never enters tick generation;
   approved changes reach the story as ordinary world state. History persists
   per world (the model itself only remembers the newest ~20k tokens).        */
const GM_ACTION_LABELS = {
  create_character: (a) => `🎭 Create character “${a.draft?.name}”${a.bonds?.length ? ` with ${a.bonds.length} bonds` : ' (bonds auto-drafted)'} — paints a portrait (~30s)`,
  patch_character: (a) => `🧬 ${(a.patches || []).length} attribute change(s) for a character (persistent)`,
  update_state: (a) => `📍 Update a character's immediate state (place/activity/mood)`,
  new_outfit: (a) => `🎨 Paint new sprite “${a.name}” (~30s)`,
  update_relationship: (a) => `🕸 Bond: ${(a.description || '').slice(0, 60)}`,
  create_location: (a) => `🗺 Build “${a.name}” + background (~30s)`,
  update_location: (a) => `🗺 Update a location${a.regenerate_background ? ' + repaint background' : ''}`,
  set_direction: () => `🎬 Rewrite the world direction`,
};
async function gmChatOverlay() {
  if ($('#gmchat')) { $('#gmchat').remove(); return; }   // toggle
  const panel = document.createElement('div');
  panel.id = 'gmchat';
  panel.innerHTML = `
    <div class="gmc-head"><b>💬 Game Master</b><span style="font-size:10.5px;opacity:.8">out of character · sees the whole story · changes need your approval</span><button class="gmc-x">✕</button></div>
    <div class="gmc-log" id="gmc-log"><div class="msg status">loading our conversation…</div></div>
    <div class="chat-inputrow"><div class="field" id="gmc-field" style="background:#fff"><input id="gmc-in" placeholder="Ask or command the Game Master…"><button class="btn btn-primary small" id="gmc-send">Send</button></div></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.gmc-x').onclick = () => panel.remove();
  const log = $('#gmc-log');
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const addMsg = (cls, text) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); scroll(); return d; };

  // Render one assistant turn: the reply plus (optionally) an approval card for its actions.
  const addAssistant = (reply, actions) => {
    addMsg('assistant', reply);
    if (!actions || !actions.length) return;
    const card = document.createElement('div');
    card.className = 'gmc-card';
    card.innerHTML = `<b style="font-size:12px">Proposed changes</b>
      ${actions.map(a => `<div class="gmc-act">${esc((GM_ACTION_LABELS[a.type] || (() => a.type))(a))}</div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-teal small" data-apply style="flex:1">✨ Apply</button>
        <button class="btn btn-ghost small" data-discard>Discard</button>
      </div><div class="gmc-res" style="display:none"></div>`;
    log.appendChild(card); scroll();
    card.querySelector('[data-discard]').onclick = () => { card.querySelector('[data-apply]').remove(); card.querySelector('[data-discard]').textContent = 'discarded'; card.querySelector('[data-discard]').disabled = true; };
    card.querySelector('[data-apply]').onclick = async (e) => {
      const btn = e.target;
      if (btn.disabled) return;
      btn.disabled = true; card.querySelector('[data-discard]').remove();
      const slow = actions.some(a => ['create_character', 'new_outfit', 'create_location'].includes(a.type) || a.regenerate_background);
      btn.textContent = slow ? '⏳ Applying… image generation takes ~30s each' : '⏳ Applying…';
      try {
        const { results } = await api(`/api/worlds/${S.world}/gm-apply`, { method: 'POST', body: { actions } });
        const res = card.querySelector('.gmc-res');
        res.style.display = 'block';
        res.innerHTML = results.map(r => `<div style="font-size:11.5px;color:${r.ok ? '#0d7e83' : '#d92e66'}">${r.ok ? '✓' : '✗'} ${esc(r.summary)}</div>` +
          (r.cutoutId ? `<div class="checker" style="display:inline-block;padding:5px;border-radius:10px;margin:4px 0"><img src="${assetUrl(r.cutoutId)}" style="max-height:160px"></div>` : '') +
          (r.backgroundId ? `<img src="${assetUrl(r.backgroundId)}" style="width:100%;border-radius:9px;margin:4px 0">` : '')).join('');
        btn.textContent = '✓ Applied';
        S.worldData = null; refreshMe();   // world state changed — next screen render picks it up
        scroll();
      } catch (e2) { btn.disabled = false; btn.textContent = '✨ Apply'; fail(e2); }
    };
  };

  // load persisted history (assistant turns are stored as {reply, actions} JSON)
  try {
    const { history } = await api(`/api/worlds/${S.world}/gm-chat`);
    log.innerHTML = history.length ? '' : '<div class="msg assistant">I\u2019m your Game Master — I see everything in this world and can change anything in it, with your approval. Ask me about the story, or tell me what to create. 🎭</div>';
    for (const h of history) {
      if (h.role === 'user') { if (!h.content.startsWith('[SYSTEM:')) addMsg('user', h.content); }
      else { try { const p = JSON.parse(h.content); addMsg('assistant', p.reply || h.content); } catch { addMsg('assistant', h.content); } }
    }
    scroll();
  } catch (e) { log.innerHTML = ''; addMsg('assistant', '😔 could not load our history: ' + e.message); }
  attachMic($('#gmc-field'), $('#gmc-in'));

  let busy = false;
  const send = async () => {
    const text = $('#gmc-in').value.trim(); if (!text || busy) return;
    $('#gmc-in').value = ''; busy = true;
    addMsg('user', text);
    const status = addMsg('status', '🎭 the Game Master is thinking…');
    try {
      const out = await api(`/api/worlds/${S.world}/gm-chat`, { method: 'POST', body: { message: text, lang: getLang() } });
      status.remove();
      addAssistant(out.reply, out.actions);
      refreshMe();
    } catch (e) { status.remove(); addMsg('assistant', '😔 ' + e.message); }
    busy = false;
  };
  $('#gmc-send').onclick = send;
  $('#gmc-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  $('#gmc-in').focus();
}

/* Location suggestions: the GM proposes BUILDING A NEW PLACE when the story keeps pointing
   at somewhere that doesn't exist yet. Yes → one call creates the location row, wires the
   proposed path connections into the world graph, and paints the 16:9 background — then a
   reveal shows the finished place. Declines are transient (no persistence). */
function showLocationSuggestion(sug) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '92';
  m.innerHTML = `<div class="modal" style="width:470px"><div class="modal-head violet">
    <div><b>🗺 A new place for the world</b><small>the storyteller suggests building it</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <p style="font-size:14px;margin-bottom:4px"><b>${esc(sug.name)}</b></p>
    <p style="font-size:12.5px;color:#3c3763;margin-bottom:6px">${esc(sug.description)}</p>
    <p style="font-size:11.5px;color:var(--soft);margin-bottom:8px">connects to: ${sug.connect_names.map(esc).join(' · ')}</p>
    ${sug.reason ? `<p class="serif" style="font-size:13px;font-style:italic;color:#4b4573;border-left:3px solid var(--violet);padding-left:10px;margin-bottom:14px">${esc(sug.reason)}</p>` : ''}
    <button class="btn btn-primary" id="ls-yes" style="width:100%;margin-bottom:8px">🗺 Build ${esc(sug.name)} (~30s, costs credits)</button>
    <button class="btn btn-ghost" id="ls-no" style="width:100%">Not now</button>
  </div></div>`;
  document.body.appendChild(m);
  const closeThen = () => { m.remove(); showCastSuggestions(); };
  m.onclick = (e) => { if (e.target === m) closeThen(); };
  $('.x', m).onclick = closeThen;
  $('#ls-no', m).onclick = closeThen;
  $('#ls-yes', m).onclick = async () => {
    closeThen();
    toast(`🗺 Building ${sug.name} — painting the backdrop, ~30s…`);
    try {
      const r = await api(`/api/worlds/${S.world}/locations/from-suggestion`, { method: 'POST', body: { name: sug.name, description: sug.description, connectTo: sug.connect_to } });
      S.worldData = null; refreshMe();
      locationRevealModal(r.location, r.backgroundId);
    } catch (e) { fail(e); }
  };
}
// Reveal the freshly built place (also confirms it's on the Atlas now).
function locationRevealModal(loc, bgId) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '93';
  m.innerHTML = `<div class="modal" style="width:540px"><div class="modal-head violet">
    <div><b>🗺 ${esc(loc.name)}</b><small>built & connected — find it on the World map</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="text-align:center">
    <img src="${assetUrl(bgId)}" alt="${esc(loc.name)}" style="width:100%;border-radius:12px">
    <button class="btn btn-primary" id="lr-ok" style="width:100%;margin-top:12px">Wonderful!</button>
  </div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;
  $('#lr-ok', m).onclick = close;
}

/* Outfit/skin suggestions: the GM proposes painting a NEW SPRITE when a character's look
   changed significantly this scene (different clothing, or a strong clearly-visible emotion
   no existing sprite captures). Yes → the existing outfits endpoint generates the variant
   identity-anchored to the everyday portrait and stores it WITH metadata (description +
   emotion tag) in materialised.outfits — which the GM reads every tick, so it can pick and
   reuse the sprite later via the per-tick "outfit" field. Declines are not persisted: the
   GM only re-suggests if the look comes up again. */
function showOutfitSuggestion(sug) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '92';
  m.innerHTML = `<div class="modal" style="width:460px"><div class="modal-head coral">
    <div><b>🎨 A new look for ${esc(sug.character_name)}</b><small>the storyteller suggests a new sprite</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <p style="font-size:13px;margin-bottom:6px"><b>${esc(sug.name)}</b>${sug.emotion ? ` <span class="tag c">${esc(sug.emotion)}</span>` : ''} — ${esc(sug.description)}</p>
    ${sug.reason ? `<p class="serif" style="font-size:13px;font-style:italic;color:#4b4573;border-left:3px solid var(--coral);padding-left:10px;margin-bottom:14px">${esc(sug.reason)}</p>` : ''}
    <button class="btn btn-coral" id="os-yes" style="width:100%;margin-bottom:8px">🎨 Paint this sprite (~30s, costs credits)</button>
    <button class="btn btn-ghost" id="os-no" style="width:100%">Not now</button>
  </div></div>`;
  document.body.appendChild(m);
  const closeThen = () => { m.remove(); showCastSuggestions(); };
  m.onclick = (e) => { if (e.target === m) closeThen(); };
  $('.x', m).onclick = closeThen;
  $('#os-no', m).onclick = closeThen;
  $('#os-yes', m).onclick = async () => {
    closeThen();
    toast(`🎨 Painting ${sug.character_name}'s "${sug.name}" sprite — ~30s…`);
    try {
      const r = await api(`/api/characters/${sug.character_id}/outfits`, { method: 'POST', body: { name: sug.name, description: sug.description, emotion: sug.emotion || undefined } });
      S.worldData = null;   // next render picks up the enriched outfit list
      refreshMe();
      spriteRevealModal(sug.character_name, sug.name, r.outfit.cutout_asset_id);
    } catch (e) { fail(e); }
  };
}

// The reveal after a sprite is painted: show the actual image so the player SEES that it
// exists and landed in the character's gallery (it's stored in materialised.outfits, which
// the Cast profile drawer renders as the outfit strip).
function spriteRevealModal(charName, spriteName, cutoutId) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '93';
  m.innerHTML = `<div class="modal" style="width:380px"><div class="modal-head teal">
    <div><b>✨ New sprite: ${esc(spriteName)}</b><small>saved to ${esc(charName)}'s gallery (Cast → ${esc(charName)})</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="text-align:center">
    <div class="checker" style="display:inline-block;padding:8px;border-radius:14px"><img src="${assetUrl(cutoutId)}" alt="${esc(spriteName)}" style="max-height:340px;max-width:100%"></div>
    <button class="btn btn-primary" id="sr-ok" style="width:100%;margin-top:12px">Lovely!</button>
  </div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;
  $('#sr-ok', m).onclick = close;
}

function showCastSuggestions() {
  const sug = (stageState.castSugs || []).shift();
  if (!sug) return;
  if (sug.kind === 'outfit') return showOutfitSuggestion(sug);
  if (sug.kind === 'location') return showLocationSuggestion(sug);
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '92';
  m.innerHTML = `<div class="modal" style="width:460px"><div class="modal-head teal">
    <div><b>🎭 A new face in the story</b><small>the storyteller has a suggestion</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <p style="font-size:14px;margin-bottom:6px">Shall I flesh out <b>${esc(sug.name)}</b> and add them to the cast?</p>
    <p class="serif" style="font-size:13px;font-style:italic;color:#4b4573;border-left:3px solid var(--teal);padding-left:10px;margin-bottom:14px">${esc(sug.reason)}</p>
    <button class="btn btn-teal" id="cs-yes" style="width:100%;margin-bottom:8px">✨ Yes — flesh out ${esc(sug.name)}</button>
    <button class="btn btn-ghost" id="cs-no" style="width:100%">Not now, continue as is</button>
  </div></div>`;
  document.body.appendChild(m);
  const closeThen = (next) => { m.remove(); if (next) showCastSuggestions(); };
  m.onclick = (e) => { if (e.target === m) closeThen(true); };
  $('.x', m).onclick = () => closeThen(true);
  $('#cs-no', m).onclick = () => {
    api(`/api/worlds/${S.world}/cast-dismiss`, { method: 'POST', body: { name: sug.name } }).catch(() => {});
    closeThen(true);
  };
  $('#cs-yes', m).onclick = () => {
    // fresh Forge, pre-seeded: the auto-sent message carries the pitch + story context
    S.forge = {
      worldId: S.world, history: [], draft: null, portraitId: null, cutoutId: null,
      seed: `Please draft a full character profile for ${sug.name}, who has already appeared in our story as a side character and is becoming important. The storyteller's pitch: "${sug.reason}" Base the personality and backstory on how they've come across in the story so far, propose a fitting appearance, and draft them now.`,
    };
    stageState.castSugs = [];        // fleshing one out supersedes any other pending pitches
    closeThen(false);
    nav(`#/forge?w=${S.world}`);
  };
}

// The "bubbly" transition card between scenes — same visual language as the video
// export's interludes. Wording rules: simultaneous-ish jump to another place →
// "Meanwhile, at X"; same place → "N minutes later"; otherwise "N hours later · X".
function showCineTransition(tick, data, prevLocId) {
  return new Promise((resolve) => {
    const loc = data.locations.find(l => l.id === tick.pov_location_id);
    const mins = (() => { const m = /^\+(\d+)([smhdw])$/.exec(tick.time_delta || ''); return m ? +m[1] * ({ s: 1 / 60, m: 1, h: 60, d: 1440, w: 10080 }[m[2]]) : 0; })();
    const sameLoc = prevLocId && prevLocId === tick.pov_location_id;
    const label = !prevLocId ? (loc?.name || '…')
      : mins <= 2 && !sameLoc ? `Meanwhile, at ${loc?.name}`
      : sameLoc ? cineDelta(tick.time_delta)
      : `${cineDelta(tick.time_delta)} · ${loc?.name}`;
    const card = document.createElement('div');
    card.id = 'cinecard';
    card.innerHTML = `<div class="cine-inner"><b>${esc(label)}</b><span>${esc(fmtClock(tick.sim_time))}</span></div>`;
    $('#stage-root')?.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));
    setTimeout(() => { card.classList.remove('show'); setTimeout(() => { card.remove(); resolve(); }, 650); }, 2300);
  });
}

// Swap the stage to one scene-tick: its location background, the characters present
// there (wearing the outfit the tick put them in), and its narration in the storybook.
function renderCineScene(tick, data) {
  const { characters, locations } = data;
  const loc = locations.find(l => l.id === tick.pov_location_id) || locations[0];
  const bg = $('.stage-bg');
  if (bg) bg.style.backgroundImage = `url(${assetUrl(loc?.background_asset_id)})`;
  const present = (tick.states || []).filter(st => st.location_id === loc?.id && characters.find(c => c.id === st.character_id));
  const cast = $('#stage-cast');
  if (cast) cast.innerHTML = present.map((st, i) => {
    const c = characters.find(x => x.id === st.character_id);
    const outfit = (st.outfits || []).find(o => o.name === st.outfit) || (st.outfits || [])[0];
    const n = present.length, x = n === 1 ? 50 : 24 + (52 / Math.max(n - 1, 1)) * i;
    return `<div class="stage-char" data-id="${c.id}" style="left:${x}%;height:71%">
      <img src="${assetUrl(outfit?.cutout_asset_id)}" alt="${esc(c.name)}">
      ${st.dialogue ? `<div class="bubble talk" data-say="${esc(st.dialogue)}" data-c="${c.id}">${esc(st.dialogue)}</div>` : ''}
    </div>`;
  }).join('') || `<div class="empty-hint" style="position:absolute;inset:30% 0;color:#cfc9f2">${esc(loc?.name || '')} — the scene unfolds…</div>`;
  const lines = $('#storylines');
  if (lines) { lines.innerHTML = renderNarration(tick.narration || [], characters); bindStoryLines(characters); }
  const meta = $('.story-meta span'); if (meta) meta.textContent = `tick ${tick.idx} · ${tick.mood_tag || ''} · ${tick.time_delta}`;
  // keep the top HUD chip in sync with the scene being shown (place · tick · clock)
  const hudSpans = $$('.stage-hud .glasschip span');
  if (hudSpans[0]) hudSpans[0].textContent = `· ${loc?.name || ''} · tick ${tick.idx}`;
  if (hudSpans[1]) hudSpans[1].textContent = `🕐 ${fmtClock(tick.sim_time)}`;
}

// Autoplay one scene's narration and resolve when it ends (or is stopped/skipped).
// The narration player's pipelined prefetch (line n plays while n+1/n+2 generate)
// applies here exactly as in normal play.
function playSceneNarration(tick, data) {
  return new Promise((resolve) => {
    const lines = (tick.narration || []).filter(n => n.text);
    if (!lines.length) return setTimeout(resolve, 1600);
    stopNarration();
    setupNarrationPlayer(lines, data.characters);
    player.onIdle = resolve;                       // fires from stopNarration (natural end, ⏹, or error)
    const playBtn = $('#tts-play');
    if (playBtn && !playBtn.disabled) playBtn.click();
    else setTimeout(resolve, Math.min(20000, lines.length * 2500));  // no audio possible → read-along timing
  });
}
// Thought suffix — BYTE-IDENTICAL to server/export_cues.js THOUGHT_SUFFIX (shared cache!)
const THOUGHT_SUFFIX = ' A private inner thought — half-murmured, intimate, as if speaking only to oneself.';
// LAIONBox delivery templates — BYTE-IDENTICAL to server/export_cues.js. The two engines
// need OPPOSITE coaching: Gemini overacts (calm templates rein it in), LAIONBox is
// naturalistic and emotionally clamped (vivid, emphatic direction or lines come out flat).
const LAIONBOX_NARRATOR_STYLE = 'An engaged, expressive storyteller: warm and vivid, colouring every sentence with the scene\'s emotion — wonder sounds wondrous, tension tightens the voice, joy lifts it. Clear, articulate speech with dynamic, lively intonation and audible emotional presence throughout.';
const LAIONBOX_CHARACTER_TEMPLATE = 'In character, feeling {mood} — and SHOWING it vividly in the voice: strong emotional expression, dynamic intonation, audible feelings (a smile you can hear, a tremble of worry, sparkling excitement), natural vocal reactions where they fit. Emotionally rich and alive, expressive enough to be truly felt.';
// Style builder — at DEFAULT preferences this mirrors server/export_cues.js cueVoiceStyle()
// byte-for-byte per provider, so live playback and story exports share ONE audio cache.
// A player customisation (Account → Voice) overrides the default for BOTH engines; the
// engine-specific default only applies while the pref is untouched.
function ttsStyleFor(ch, emotion = '', mode = '') {
  const p = ttsPrefs();
  const laion = S.ttsProvider === 'laionbox';
  if (!ch) {
    const customised = p.narratorStyle && p.narratorStyle !== DEFAULT_NARRATOR_STYLE;
    const base = customised ? p.narratorStyle : (laion ? LAIONBOX_NARRATOR_STYLE : DEFAULT_NARRATOR_STYLE);
    const hint = emotion ? (laion && !customised ? ` The emotional colour of this passage: ${emotion} — let it be heard.` : ` A faint touch of ${emotion}.`) : '';
    return [`${base}${hint}`, p.custom].filter(Boolean).join(' ');
  }
  const customisedC = p.characterStyle && p.characterStyle !== DEFAULT_CHARACTER_STYLE;
  const tpl = customisedC ? p.characterStyle : (laion ? LAIONBOX_CHARACTER_TEMPLATE : DEFAULT_CHARACTER_STYLE);
  const base = tpl.replace('{mood}', emotion || 'calm');
  return [`${base}${mode === 'thought' ? THOUGHT_SUFFIX : ''}`, p.custom].filter(Boolean).join(' ');
}
const ttsInflight = new Map(); // dedup concurrent + repeated requests within the session
function fetchTts(text, ch, emotion = '', mode = '') {
  const p = ttsPrefs();
  const voice = ch?.voice || p.narrator;
  const style = ttsStyleFor(ch, emotion, mode);
  // Under LAIONBox, character lines carry characterId so the server can look up (and clone)
  // that character's reference clip. If the reference is missing the server answers 409
  // VOICE_REF_MISSING and speak()/the player opens the voice-setup popup (voiceRefModal).
  const characterId = ch?.id || null;
  const key = `${S.ttsProvider || 'gemini'}|${getLang()}|${characterId || voice}|${style}|${text}`;
  if (ttsInflight.has(key)) return ttsInflight.get(key);
  const prom = (async () => {
    const t0 = performance.now();
    // lang: under LAIONBox the server picks the reference clip matching the story's language
    // (an English reference with German text = gibberish); ignored under Gemini.
    const r = await api('/api/tts', { method: 'POST', body: { text, voice, style, characterId, lang: getLang() } });
    r.clientMs = Math.round(performance.now() - t0);
    console.log(`[tts] ${r.cached ? 'cache' : 'gen'} ${r.clientMs}ms (server ${r.genMs}ms, ~${r.seconds ?? '?'}s audio) — "${text.slice(0, 50)}…"`);
    (window.__ttsStats = window.__ttsStats || []).push({ ms: r.clientMs, cached: r.cached, seconds: r.seconds });
    return r;
  })();
  ttsInflight.set(key, prom);
  prom.catch(() => ttsInflight.delete(key));
  return prom;
}
async function speak(text, ch, el, emotion = '', mode = '') {
  try {
    el?.classList.add('playing');
    const { assetId } = await fetchTts(text, ch, emotion, mode);
    const a = new Audio(assetUrl(assetId));
    a.onended = () => el?.classList.remove('playing');
    a.play(); refreshMe();
  } catch (e) {
    el?.classList.remove('playing');
    // LAIONBox: this character has no cloned reference voice yet → open the voice-setup
    // popup right here so the player can create/upload one and immediately retry.
    if (e.code === 'VOICE_REF_MISSING' && ch?.id) { voiceRefModal(ch.id); return; }
    fail(e);
  }
}
/* ── LAIONBox voice picker ──────────────────────────────────────────────────
   Under LAIONBox every character speaks through a VOICE PROFILE — one of the
   curated identities in config/voice_profiles.json, each with a clean reference
   clip PER LANGUAGE (assets/voice_profiles/) so the story can switch between
   EN/DE/ES/FR without the cloned voice degrading into gibberish. This modal:
     • lists all profiles (human display name + gender/age/timbre)
     • ▶ previews the reference clip in the CURRENT game language
     • ✓ selecting one stores the underlying Gemini voice name on the character
       (works for BOTH engines) and clears any uploaded custom reference
     • 📁 upload still exists as an advanced override (one clip, one language —
       the player owns that tradeoff; profiles are the recommended path).       */
let PROFILE_CACHE = null;
async function voiceProfiles() {
  if (!PROFILE_CACHE) PROFILE_CACHE = (await api('/api/voice-profiles')).profiles;
  return PROFILE_CACHE;
}
async function voiceRefModal(charId, onDone) {
  const [{ characters }, profiles] = await Promise.all([loadWorld(), voiceProfiles()]);
  const c = characters.find(x => x.id === charId); if (!c) return;
  const lang = getLang();
  const current = Object.entries(profiles).find(([, p]) => p.voice === c.voice)?.[0] || null;
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.style.zIndex = '95'; // above stage modals so it can interrupt playback flows
  m.innerHTML = `<div class="modal" style="width:560px"><div class="modal-head violet">
    <div><b>🎙 ${esc(c.name)}'s voice</b><small>pick a voice profile — previews play in ${({en:'English',de:'German',fr:'French',es:'Spanish'})[lang]} (🌐)</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    ${c.voice_ref_asset_id ? `<div class="attr" style="margin-bottom:10px;background:#fdf3e0;border-color:#f4d79a"><h5 style="color:#a86f0d">CUSTOM UPLOAD ACTIVE</h5><p style="font-size:11.5px">${esc(c.name)} currently uses an uploaded clip (overrides profiles, single-language). Picking a profile below switches back to the multilingual profile system.</p></div>` : ''}
    <div style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:6px" id="vp-list">
      ${Object.entries(profiles).map(([name, p]) => `
        <div class="jump-loc" data-prof="${esc(name)}" style="display:flex;align-items:center;gap:10px;${name === current && !c.voice_ref_asset_id ? 'border-color:var(--violet);background:var(--tint)' : ''}">
          <button class="btn btn-ghost small" data-play="${esc(p.voice)}" title="Preview in ${lang.toUpperCase()}" style="padding:4px 9px">▶</button>
          <div style="flex:1"><b style="font-size:13px">${esc(name)}</b> <span style="font-size:11px;color:var(--soft)">${esc(p.gender)} · ${esc(p.age)}</span>
            <div style="font-size:11px;color:#4b4573">${esc(p.timbre)}</div></div>
          ${name === current && !c.voice_ref_asset_id ? '<span class="tag v">current</span>' : `<button class="btn btn-teal small" data-pick="${esc(name)}">✓ use</button>`}
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
      <button class="btn btn-soft small" id="vr-upload">📁 Upload custom audio (advanced)</button>
      <span id="vr-status" style="font-size:11px;color:var(--soft)"></span>
    </div>
  </div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); onDone?.(); };
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;
  let audio = null;
  $$('[data-play]', m).forEach(b => b.onclick = () => {
    if (audio) { audio.pause(); audio = null; }
    audio = new Audio(`/voice-profiles/${b.dataset.play}/${lang}.mp3`);
    audio.play().catch(() => toast('preview unavailable', 'err'));
  });
  $$('[data-pick]', m).forEach(b => b.onclick = async () => {
    const name = b.dataset.pick;
    try {
      // store the underlying Gemini voice name; clear any uploaded override
      await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { voice: profiles[name].voice, clearVoiceRef: true } });
      toast(`${c.name} now speaks as ${name} 🎙`, 'gold');
      S.worldData = null; if (audio) audio.pause(); close();
    } catch (e) { fail(e); }
  });
  $('#vr-upload', m).onclick = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*';
    input.onchange = async () => {
      const f = input.files && input.files[0]; if (!f) return;
      $('#vr-status', m).textContent = '⬆ uploading…';
      try {
        const fd = new FormData(); fd.append('file', f, f.name);
        await api(`/api/characters/${c.id}/voice-ref/upload`, { method: 'POST', body: fd });
        toast(`${c.name} speaks with your uploaded voice 🎙`, 'gold');
        S.worldData = null; if (audio) audio.pause(); close();
      } catch (e) { $('#vr-status', m).textContent = ''; fail(e); }
    };
    input.click();
  };
}

/* ── time travel: undo/redo history & branches ── */
/* ── 🕰 TIMELINE — a graphical, scrollable filmstrip of the whole story ──────
   Horizontal strip, earlier ⟵ left · right ⟶ later. Every scene is a CARD:
   the location backdrop as thumbnail, the characters present as little cut-out
   figures standing in it, tick number + clock, and temporal markers between
   cards ("⟲ meanwhile", "moments later", "≈5h later") that keep fast-forward
   chapter scenes readable. Clicking a card ENLARGES it and opens the detail
   bar (full summary + ▶ Replay / ⤴ Jump). Branches are chips above the strip.
   Replay = pure playback (playReplay); Jump = rewind & branch (timetravel).  */
async function timelineModal() {
  const info = await api(`/api/worlds/${S.world}/branches`);
  const data = await loadWorld();
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal tl-modal"><div class="modal-head violet"><div><b>🕰 Timeline</b><small>scroll through every scene — replay it, or branch off from it</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="padding:14px 0 10px">
    <div id="tl-branches" class="tl-branchrow"></div>
    <div id="tl-strip" class="tl-strip"><div class="empty-hint" style="padding:30px;width:100%"><span class="spinner dark"></span></div></div>
    <div id="tl-detail" class="tl-detail"><span style="color:var(--soft);font-size:12px">Pick a scene above.</span></div>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();

  let selected = info.activeBranchId;
  let selTick = null;                 // currently enlarged card (tick idx)
  let ticksCache = [];

  const renderBranches = () => {
    $('#tl-branches', m).innerHTML = info.branches.map(b => `
      <button class="tl-bchip ${b.id === selected ? 'sel' : ''}" data-b="${b.id}" title="${b.own_tick_count} ticks${b.parent_branch_id ? ` · forked @ ${b.fork_tick_idx}` : ''}">
        ${b.id === info.activeBranchId ? '🌿 ' : ''}${esc(b.label)}
      </button>`).join('') +
      `<button class="tl-bchip ghost" id="tl-rename" title="Rename the selected timeline">✏️</button>`;
    $$('#tl-branches [data-b]', m).forEach(el => el.onclick = () => { selected = el.dataset.b; selTick = null; renderBranches(); renderTicks(); });
    $('#tl-rename', m).onclick = async () => {
      const b = info.branches.find(x => x.id === selected);
      const label = prompt('Name this timeline:', b.label); if (!label) return;
      await api(`/api/worlds/${S.world}/branches/${b.id}`, { method: 'PATCH', body: { label } }).catch(fail);
      b.label = label; renderBranches();
    };
  };

  const locOf = (id) => data.locations.find(l => l.id === id);
  // marker between two consecutive scenes — same clock = simultaneous chapter scenes
  const marker = (t, prev) => {
    if (!prev || !t.sim_time) return '';
    if (prev.sim_time && t.sim_time === prev.sim_time) return '⟲ meanwhile';
    const mn = /^\+(\d+)m$/.exec(t.time_delta || '');
    if (mn && +mn[1] <= 2) return 'moments later';
    if (mn && +mn[1] >= 120) return `≈${Math.round(+mn[1] / 60)}h later`;
    return cineDelta(t.time_delta).replace(' later', '') + ' later';
  };

  const renderDetail = () => {
    const t = ticksCache.find(x => x.idx === selTick);
    if (!t) { $('#tl-detail', m).innerHTML = '<span style="color:var(--soft);font-size:12px">Pick a scene above.</span>'; return; }
    const here = t.idx === info.tickIndex && selected === info.activeBranchId;
    $('#tl-detail', m).innerHTML = `
      <div style="flex:1;min-width:0">
        <b style="font-size:12.5px">#${t.idx} · ${esc(locOf(t.pov_location_id)?.name || '')}</b>
        <span style="font-size:10.5px;color:var(--soft);margin-left:6px">${t.sim_time ? fmtClock(t.sim_time) : ''}</span>
        <div style="font-size:12px;color:#3c3763;margin-top:3px">${esc(t.summary || '—')}</div>
      </div>
      <div style="display:flex;gap:7px;flex:none;align-items:center">
        ${t.idx > 0 ? `<button class="btn btn-primary small" id="tl-replay" title="Watch again from here — does not change the story">▶ Replay</button>` : ''}
        ${here ? '<span class="tag g">you are here</span>' : `<button class="btn btn-soft small" id="tl-jump" title="Rewind the world to here — advancing then forks a new branch">⤴ Jump</button>`}
      </div>`;
    const rp = $('#tl-replay', m);
    if (rp) rp.onclick = () => {
      m.remove();
      S.replay = { branchId: selected, idx: t.idx };
      if (location.hash.includes('stage')) stageScreen(); else nav(`#/stage?w=${S.world}`);
    };
    const jp = $('#tl-jump', m);
    if (jp) jp.onclick = async () => {
      try {
        stopNarration();
        await api(`/api/worlds/${S.world}/timetravel`, { method: 'POST', body: { branchId: selected, tickIdx: t.idx } });
        toast('🌿 Jumped to that moment'); m.remove(); S.worldData = null;
        if (location.hash.includes('stage')) stageScreen(); else nav(`#/stage?w=${S.world}`);
      } catch (e) { fail(e); }
    };
  };

  const renderTicks = async () => {
    const b = info.branches.find(x => x.id === selected);
    $('#tl-strip', m).innerHTML = '<div class="empty-hint" style="padding:30px;width:100%"><span class="spinner dark"></span></div>';
    const { ticks } = await api(`/api/worlds/${S.world}/export/timeline?branchId=${selected}&toIdx=${b.head_idx}`);
    ticksCache = [{ idx: 0, sim_time: null, summary: 'The beginning — genesis', time_delta: '', states: [], pov_location_id: data.locations[0]?.id }, ...ticks];
    if (selTick == null) selTick = (selected === info.activeBranchId) ? info.tickIndex : (ticks[ticks.length - 1]?.idx ?? 0);
    // PERFORMANCE: long stories mean 60-70 cards. Images load through a SLIDING WINDOW —
    // card shells render for every tick (cheap DOM), but the backdrop + figures of a card
    // only load while it is near the viewport (IntersectionObserver below) and UNLOAD when
    // scrolled far away, so only ~20 thumbnails are ever resident. All images are ?w=
    // downscaled server-side variants (a fraction of the full-res bytes).
    $('#tl-strip', m).innerHTML = ticksCache.map((t, i) => {
      const loc = locOf(t.pov_location_id);
      const present = (t.states || []).filter(s => s.location_id === t.pov_location_id).slice(0, 4);
      const figs = present.map((s, k) => {
        const o = (s.outfits || []).find(x => x.name === s.outfit) || (s.outfits || [])[0];
        return o ? `${assetUrl(o.cutout_asset_id)}?w=160@${18 + k * 22}` : '';
      }).filter(Boolean).join('|');
      const here = t.idx === info.tickIndex && selected === info.activeBranchId;
      return `${i > 0 ? `<div class="tl-gap"><span>${esc(marker(t, ticksCache[i - 1]))}</span></div>` : ''}
      <div class="tl-card ${t.idx === selTick ? 'sel' : ''} ${here ? 'here' : ''}" data-t="${t.idx}" title="${esc(t.summary || '')}">
        <div class="tl-thumb" data-bg="${loc?.background_asset_id ? `${assetUrl(loc.background_asset_id)}?w=320` : ''}" data-figs="${figs}">
          ${here ? '<span class="tl-herechip">now</span>' : ''}
        </div>
        <div class="tl-cap"><b>#${t.idx}</b><span>${t.sim_time ? fmtClock(t.sim_time).replace(/^\w+ /, '') : 'genesis'}</span></div>
      </div>`;
    }).join('');
    // sliding-window loader: load near-viewport cards, unload far ones
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const th = en.target;
        if (en.isIntersecting) {
          if (th.dataset.bg && !th.style.backgroundImage) th.style.backgroundImage = `url(${th.dataset.bg})`;
          if (th.dataset.figs && !th.querySelector('.tl-fig')) {
            for (const f of th.dataset.figs.split('|')) {
              const [url, left] = f.split('@');
              const img = document.createElement('img');
              img.className = 'tl-fig'; img.style.left = left + '%'; img.decoding = 'async'; img.src = url;
              th.appendChild(img);
            }
          }
        } else {          // scrolled far away → free the memory
          th.style.backgroundImage = '';
          th.querySelectorAll('.tl-fig').forEach(x => x.remove());
        }
      }
    }, { root: $('#tl-strip', m), rootMargin: '0px 900px' });   // ±900px ≈ a window of ~20 cards
    $$('#tl-strip .tl-thumb', m).forEach(th => io.observe(th));
    $$('#tl-strip .tl-card', m).forEach(el => el.onclick = () => {
      selTick = +el.dataset.t;
      $$('#tl-strip .tl-card', m).forEach(x => x.classList.toggle('sel', +x.dataset.t === selTick));
      renderDetail();
      el.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    });
    // vertical wheel scrolls the strip horizontally (feels like scrubbing)
    const strip = $('#tl-strip', m);
    strip.onwheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } };
    renderDetail();
    // open centred on the selected scene
    const selEl = strip.querySelector('.tl-card.sel');
    if (selEl) setTimeout(() => selEl.scrollIntoView({ inline: 'center', block: 'nearest' }), 30);
  };
  renderBranches(); renderTicks();
}

/* ── stage jump overlays ── */
function locationPickerModal(locations, characters, currentId, onPick, opts = {}) {
  const groups = {};
  locations.forEach(l => (groups[l.place_group || 'Elsewhere'] = groups[l.place_group || 'Elsewhere'] || []).push(l));
  const who = (lid) => characters.filter(c => c.state.location_id === lid);
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal big"><div class="modal-head violet"><div><b>${esc(opts.title || '🗺 Jump to a place')}</b><small>${esc(opts.sub || 'watch any location — thumbnails from your Atlas')}</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    ${Object.entries(groups).map(([g, ls]) => `<div class="jump-group"><h5>${esc(g)}</h5><div class="jump-grid">
      ${ls.map(l => `<div class="jump-loc ${l.id === currentId ? 'current' : ''}" data-id="${l.id}">
        <div class="thumb" style="${l.background_asset_id ? `background-image:url(${assetUrl(l.background_asset_id)})` : ''}"></div>
        <div class="faces">${who(l.id).map(c => `<div title="${esc(c.name)}" style="background-image:url(${assetUrl(cutoutFor(c))})"></div>`).join('')}</div>
        <div class="lab"><span>${esc(l.name)}</span>${l.id === currentId ? '<span class="tag g">here</span>' : ''}</div>
      </div>`).join('')}
    </div></div>`).join('')}
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  $$('.jump-loc', m).forEach(el => el.onclick = () => { const l = locations.find(x => x.id === el.dataset.id); m.remove(); onPick(l); });
}
function characterPickerModal(characters, locations, currentId, onPick) {
  const locName2 = (id) => locations.find(l => l.id === id)?.name || '—';
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal big"><div class="modal-head violet"><div><b>👤 Jump to a character</b><small>see through their eyes — wherever they are right now</small></div><span class="x">✕</span></div>
  <div class="modal-body"><div class="jump-cast">
    ${characters.map(c => `<div class="cast-tile" data-id="${c.id}">
      <div class="ring" style="${c.id === currentId ? 'background:linear-gradient(135deg,var(--gold),#ffd97a)' : ''}"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div>
      <b>${esc(c.name)}</b>
      <div class="mood">${esc(c.state.mood || '—')}</div>
      <span class="tag t">📍 ${esc(locName2(c.state.location_id))}</span>
    </div>`).join('')}
  </div></div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  $$('.cast-tile', m).forEach(el => el.onclick = () => { const c = characters.find(x => x.id === el.dataset.id); m.remove(); onPick(c); });
}

/* ── the mind popup: zoom into a character's inner state ── */
async function mindModal(charId) {
  const { characters, locations } = await loadWorld();
  const c = characters.find(x => x.id === charId); if (!c) return;
  const st = c.state, per = st.perceptions || {};
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:600px"><div class="modal-head violet"><div><b>🧠 Inside ${esc(c.name)}'s mind</b><small>right now · ${esc(st.mood || '')} · at ${esc(locations.find(l => l.id === st.location_id)?.name || '?')}</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div class="mind-head">
      <div class="face"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div>
      <div><b style="font-size:16px">${esc(c.name)}</b><div style="font-size:12px;color:var(--soft)">${esc(st.activity || '')}</div>
      ${st.dialogue ? `<div class="serif" style="font-size:12px;font-style:italic;color:#4b32c4;margin-top:2px">💬 "${esc(st.dialogue)}"</div>` : ''}</div>
    </div>
    <div class="mind-grid">
      <div class="mind-box emotions"><h5>💗 Emotions</h5>
        ${(st.emotions || []).map(e => `<div class="emo-row"><span class="nm">${esc(e.name)}</span><div class="track"><div style="width:${Math.round((e.intensity ?? 0.5) * 100)}%"></div></div></div>`).join('') || '<p style="color:var(--soft)">Not yet observed — advance a tick.</p>'}
      </div>
      <div class="mind-box thoughts"><h5>💭 Thoughts</h5>
        <p class="serif">${st.thought ? '"' + esc(st.thought) + '"' : '<span style="color:var(--soft)">Quiet in there right now.</span>'}</p>
      </div>
      <div class="mind-box percept"><h5>👁 Perceptions</h5>
        ${per.seeing ? `<div class="sense"><span class="ic">👁</span><span>${esc(per.seeing)}</span></div>` : ''}
        ${per.hearing ? `<div class="sense"><span class="ic">👂</span><span>${esc(per.hearing)}</span></div>` : ''}
        ${per.feeling ? `<div class="sense"><span class="ic">🖐</span><span>${esc(per.feeling)}</span></div>` : ''}
        ${per.smell_taste ? `<div class="sense"><span class="ic">👃</span><span>${esc(per.smell_taste)}</span></div>` : ''}
        ${!(per.seeing || per.hearing || per.feeling || per.smell_taste) ? '<p style="color:var(--soft)">Senses not yet observed.</p>' : ''}
      </div>
      <div class="mind-box doing"><h5>🎯 Doing & intending</h5>
        <p style="margin-bottom:6px">${esc(st.activity || '—')}</p>
        ${(st.intentions || []).map(i => `<span class="intent-chip">→ ${esc(i)}</span>`).join('')}
        ${(st.conditions || []).length ? `<p style="margin-top:6px;font-size:11px;color:var(--soft)">conditions: ${st.conditions.map(esc).join(', ')}</p>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-soft small" id="mm-hear">🔊 Hear their thought</button>
      <button class="btn btn-soft small" id="mm-move">📍 Move</button>
      <button class="btn btn-soft small" id="mm-profile">📖 Full profile</button>
      <button class="btn btn-primary small" id="mm-pov">👁 See through their eyes</button>
    </div>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  $('#mm-hear', m).onclick = (e) => speak(st.thought || `...`, c, e.target, st.mood || 'calm', 'thought');
  $('#mm-move', m).onclick = () => {
    locationPickerModal(locations, characters, c.state.location_id, async (l) => {
      try { await api(`/api/characters/${c.id}`, { method: 'PATCH', body: { location_id: l.id } }); toast(`${c.name} moved to ${l.name} 📍`); S.worldData = null; m.remove(); if (typeof stageScreen === 'function' && location.hash.includes('stage')) stageScreen(); } catch (e) { fail(e); }
    }, { title: `📍 Move ${c.name}`, sub: 'teleport them to any location' });
  };
  $('#mm-profile', m).onclick = () => { m.remove(); profileDrawer(c.id); };
  $('#mm-pov', m).onclick = () => { m.remove(); stopNarration(); stageState.pov = { type: 'character', id: c.id }; stageScreen(); };
}

// Choose any time jump: number + unit (seconds → weeks).
function customDeltaModal(onPick) {
  const UNITS = [['s', 'seconds'], ['m', 'minutes'], ['h', 'hours'], ['d', 'days'], ['w', 'weeks']];
  let unit = 'm';
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:420px"><div class="modal-head violet"><div><b>⏱ Custom time jump</b><small>how far should the story fast-forward?</small></div><span class="x">✕</span></div>
  <div class="modal-body" style="text-align:center">
    <div style="display:flex;gap:10px;justify-content:center;align-items:center;margin:6px 0 14px">
      <input id="cd-n" type="number" min="1" max="10000" value="10" style="width:110px;font-size:26px;font-weight:700;text-align:center;border:2px solid var(--line);border-radius:14px;padding:10px 6px;outline:none">
      <div class="kind-tabs" id="cd-units" style="margin:0">${UNITS.map(([k, lab]) => `<button class="tag ${k === 'm' ? 'v' : 'grey'}" data-u="${k}">${lab}</button>`).join('')}</div>
    </div>
    <div id="cd-preview" style="font-size:12.5px;color:var(--soft);margin-bottom:14px">the world will live through <b>10 minutes</b></div>
    <div style="display:flex;justify-content:center;gap:9px"><button class="btn btn-ghost" id="cd-cancel">Cancel</button><button class="btn btn-primary" id="cd-set">Set jump</button></div>
  </div></div>`;
  document.body.appendChild(m);
  const preview = () => {
    const n = Math.max(1, Math.min(10000, Math.floor(+$('#cd-n', m).value || 1)));
    $('#cd-preview', m).innerHTML = `the world will live through <b>${n} ${UNITS.find(u => u[0] === unit)[1].replace(/s$/, n === 1 ? '' : 's')}</b>`;
  };
  $$('#cd-units .tag', m).forEach(b => b.onclick = () => { unit = b.dataset.u; $$('#cd-units .tag', m).forEach(x => x.className = 'tag grey'); b.className = 'tag v'; preview(); });
  $('#cd-n', m).oninput = preview;
  $('#cd-n', m).onkeydown = (e) => { if (e.key === 'Enter') $('#cd-set', m).click(); };
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove(); $('#cd-cancel', m).onclick = () => m.remove();
  $('#cd-set', m).onclick = () => {
    const n = Math.max(1, Math.min(10000, Math.floor(+$('#cd-n', m).value || 1)));
    m.remove(); onPick(`+${n}${unit}`);
  };
  $('#cd-n', m).focus(); $('#cd-n', m).select();
}

function interventionModal(characters, onApply) {
  const KINDS = [['event', '⚡ Event'], ['idea', '💡 Idea'], ['condition', '🩺 Condition'], ['directorial', '🎬 Directorial']];
  const SPARKS = ['wins a small lottery', 'a mysterious text: you are living in a simulation', 'an old friend returns', 'it starts to rain', 'a power cut', 'make the next day quieter'];
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><div class="modal-head coral"><div><b>⚡ Intervene</b><small>steer the next tick — like a quiet god</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div class="kind-tabs">${KINDS.map(([k, lab], i) => `<button class="tag ${i ? 'grey' : 'c'}" data-k="${k}">${lab}</button>`).join('')}</div>
    <h5 style="font-size:10px;letter-spacing:.12em;color:var(--soft);margin:0 0 6px">WHO DOES THIS TOUCH?</h5>
    <div class="kind-tabs" id="targets"><button class="tag v" data-t="">the whole world</button>${characters.map(c => `<button class="tag grey" data-t="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="field" id="iv-field" style="align-items:flex-start;margin-top:6px"><textarea id="iv-text" rows="3" class="serif" style="font-style:italic" placeholder='e.g. Alice&#39;s phone buzzes. A text from an unknown number: "you are living in a simulation."'></textarea></div>
    <div class="sparks">${SPARKS.map(s => `<span class="spark">${s}</span>`).join('')}</div>
    <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px"><button class="btn btn-ghost" id="iv-cancel">Cancel</button><button class="btn btn-coral" id="iv-go">▶ Apply & advance</button></div>
  </div></div>`;
  document.body.appendChild(m);
  attachMic($('#iv-field', m), $('#iv-text', m));
  let kind = 'event', target = '';
  $$('.kind-tabs [data-k]', m).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', m).forEach(x => x.className = 'tag grey'); b.className = 'tag c'; });
  $$('#targets [data-t]', m).forEach(b => b.onclick = () => { target = b.dataset.t; $$('#targets [data-t]', m).forEach(x => x.className = 'tag grey'); b.className = 'tag v'; });
  $$('.spark', m).forEach(sp => sp.onclick = () => { $('#iv-text', m).value = sp.textContent; });
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove(); $('#iv-cancel', m).onclick = () => m.remove();
  $('#iv-go', m).onclick = () => {
    const text = $('#iv-text', m).value.trim(); if (!text) return;
    const tname = target ? (characters.find(c => c.id === target)?.name || null) : null;
    m.remove();
    onApply({ kind, target: tname, text });
  };
}

/* ───────── save-game import (restore a deleted world from a .vivarium.zip) ───────── */
// Opens a native file picker, uploads the zip to /api/worlds/import (which recreates the
// world with all-fresh ids so it never collides with anything you still have), then drops
// you into the restored world. See server/world_io.js for how the restore actually works.
function importGamePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    toast(`⬆ Importing “${file.name}”… large games take a moment`);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await api('/api/worlds/import', { method: 'POST', body: fd });
      toast(`Restored “${esc(res.title)}” 🎉${res.missingAssetBinaries ? ` — ${res.missingAssetBinaries} image(s) were missing from the zip` : ''}`, 'gold');
      $$('.modal-bg').forEach(x => x.remove());
      S.worldData = null;
      homeScreen();
    } catch (e) { fail(e); }
  };
  input.click();
}

/* ───────── share & account ───────── */
async function shareModal() {
  const data = await loadWorld();
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><div class="modal-head violet"><div><b>Share “${esc(data.world.title)}”</b><small>export, back up, or turn your story into a film</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div style="display:flex;gap:12px">
      <div class="panel" style="flex:1"><b style="font-size:13.5px">⬇ Time-zero seed</b><p style="font-size:11.5px;color:var(--soft)">Cast, bonds, world & tone as JSON — <b>no timeline</b>. Others start fresh from your setting.</p><button class="btn btn-soft small" id="seed" style="width:100%">Export seed (JSON)</button></div>
      <div class="panel" style="flex:1"><b style="font-size:13.5px">💾 Full saved game (.zip)</b><p style="font-size:11.5px;color:var(--soft)">Everything — timeline, branches, <b>all images & assets</b>. A complete backup you can re-import to restore this world.</p><button class="btn btn-primary small" id="fullzip" style="width:100%">Download .zip</button></div>
    </div>
    <div class="panel" style="margin-top:12px">
      <b style="font-size:13.5px">⬆ Import a saved game</b>
      <p style="font-size:11.5px;color:var(--soft)">Restore any <code>.vivarium.zip</code> as a brand-new world (fresh copy — won't overwrite this one).</p>
      <button class="btn btn-soft small" id="importbtn" style="width:100%">Choose a .zip to import</button>
    </div>
    <div class="panel" style="margin-top:12px" id="storypanel">
      <b style="font-size:13.5px">🎬 Export as a playable story</b>
      <p style="font-size:11.5px;color:var(--soft)">A small <code>.zip</code> with your whole story: every scene, sprite, background and voiced line (64&nbsp;kbps mono). It plays <b>offline in any browser</b> — the zip includes <code>player.html</code>; open it, pick the zip, watch with full narration, fullscreen, seek. Lines without audio yet can be voiced now (costs credits) or left silent — you'll choose next.</p>
      <button class="btn btn-coral small" id="storygo" style="width:100%">🎬 Export story (tick 1–${data.world.tick_index})</button>
      <div id="storystatus" style="margin-top:10px;display:none">
        <div style="font-size:11.5px;color:var(--soft);margin-bottom:5px" id="storystage">preparing…</div>
        <div class="strength"><div id="storybarfill" style="width:0%;background:linear-gradient(90deg,var(--coral),#ff8fb3)"></div></div>
      </div>
      <p style="font-size:10.5px;color:var(--soft);margin-top:8px">Tip: you can also open the player any time at <a href="/player.html" target="_blank" style="color:var(--violet)">/player.html</a>.</p>
    </div>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();

  // seed = lightweight JSON (no timeline); full = ZIP with assets from the server
  $('#seed', m).onclick = () => {
    const bundle = { format: 'vivarium-world', version: 1, mode: 'seed', exported_at: new Date().toISOString(), ...data, ticks: [] };
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${data.world.title.replace(/\W+/g, '-')}.seed.vivarium.json`; a.click();
    toast('Seed exported ⬇');
  };
  $('#fullzip', m).onclick = () => {
    // Content-Disposition: attachment → browser downloads without navigating the SPA away
    const a = document.createElement('a'); a.href = `/api/worlds/${S.world}/export/zip`; a.click();
    toast('Packing your saved game… the .zip download will begin shortly ⬇');
  };
  $('#importbtn', m).onclick = () => importGamePicker();

  if (data.world.tick_index < 1) { $('#storygo', m).disabled = true; $('#storygo', m).textContent = 'Advance at least one tick first'; }
  $('#storygo', m).onclick = async () => {
    try {
      // 1) preflight: how many lines need audio, and what generating them would cost
      const pre = await api(`/api/worlds/${S.world}/export/story/preflight`, { method: 'POST', body: { lang: getLang() } });
      let audioMode = 'generate';
      if (pre.missingLines > 0) {
        audioMode = await exportAudioChoice(pre);   // ask the user; null = cancelled
        if (!audioMode) return;
      }
      $('#storygo', m).disabled = true;
      $('#storystatus', m).style.display = 'block';
      // 2) if generating: run the SSE prepare pass (fills the audio cache with live progress)
      if (audioMode === 'generate' && pre.missingLines > 0) {
        const res = await fetch(`/api/worlds/${S.world}/export/story/prepare?lang=${getLang()}`, { method: 'POST', credentials: 'same-origin' });
        const reader = res.body.getReader(); const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const raw = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /event: (\w+)/.exec(raw)?.[1]; const dl = /data: (.*)/.exec(raw)?.[1];
            if (!ev || !dl) continue;
            const d = JSON.parse(dl);
            if (ev === 'progress') {
              $('#storystage', m).textContent = `voicing lines… ${d.done}/${d.total}${d.skipped ? ` (${d.skipped} skipped)` : ''}`;
              $('#storybarfill', m).style.width = Math.round(90 * d.done / d.total) + '%';
            }
            if (ev === 'error') throw new Error(d.message);
          }
        }
        refreshMe();
      }
      // 3) download the bundle (built from the now-warm cache; missing lines stay silent)
      $('#storystage', m).textContent = 'packing the bundle…';
      $('#storybarfill', m).style.width = '95%';
      const a = document.createElement('a'); a.href = `/api/worlds/${S.world}/export/story?lang=${getLang()}`; a.click();
      $('#storystage', m).innerHTML = `✅ your story is downloading — open <b>player.html</b> from the zip (or <a href="/player.html" target="_blank" style="color:var(--violet)">/player.html</a>) and pick it`;
      $('#storybarfill', m).style.width = '100%';
      $('#storygo', m).disabled = false;
      toast('Story bundle on its way 🎬', 'gold');
    } catch (e) { $('#storygo', m).disabled = false; fail(e); }
  };
}

// Ask the user how to handle lines that don't have audio yet. Resolves 'generate' | 'silent' | null.
function exportAudioChoice(pre) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.style.zIndex = '90';
    const affordable = pre.canAfford;
    m.innerHTML = `<div class="modal" style="width:440px"><div class="modal-head coral"><div><b>🔊 ${pre.missingLines} line${pre.missingLines === 1 ? '' : 's'} need audio</b><small>${pre.cachedLines} of ${pre.totalLines} lines are already voiced</small></div><span class="x">✕</span></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:#3c3763;margin-bottom:14px">Some narration hasn't been voiced yet. You can generate the missing audio now (so the story has sound everywhere), or leave those moments silent.</p>
      <button class="btn btn-primary" id="ac-gen" style="width:100%;margin-bottom:8px" ${affordable ? '' : 'disabled'}>🎤 Generate the missing audio &nbsp;·&nbsp; up to ${pre.estCredits} credits</button>
      ${affordable ? '' : `<p style="font-size:11px;color:#d92e66;margin:-2px 0 8px">Not enough credits (you have ${pre.balance}). Ask your admin for a top-up, or render silent.</p>`}
      <button class="btn btn-soft" id="ac-silent" style="width:100%;margin-bottom:8px">🔇 Export now, leave those lines silent &nbsp;·&nbsp; free</button>
      <button class="btn btn-ghost" id="ac-cancel" style="width:100%">Cancel</button>
      <p style="font-size:10.5px;color:var(--soft);margin-top:10px">You have ${pre.balance} credits. The estimate is a ceiling — you're billed only for what's actually generated, and already-voiced lines are always free.</p>
    </div></div>`;
    document.body.appendChild(m);
    const done = (v) => { m.remove(); resolve(v); };
    m.onclick = (e) => { if (e.target === m) done(null); };
    $('.x', m).onclick = () => done(null);
    $('#ac-cancel', m).onclick = () => done(null);
    $('#ac-silent', m).onclick = () => done('silent');
    $('#ac-gen', m).onclick = () => { if (affordable) done('generate'); };
  });
}
async function accountModal() {
  const [{ user, spentToday }, { ledger }] = await Promise.all([api('/api/me'), api('/api/me/ledger')]);
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal"><div class="modal-head violet"><div><b>${esc(user.displayName)}</b><small>${esc(user.email)}</small></div><span class="x">✕</span></div>
  <div class="modal-body">
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <div class="panel" style="flex:1;text-align:center"><div style="font-size:24px;font-weight:700;color:#a86f0d">🪙 ${user.credits}</div><small style="color:var(--soft)">credits</small></div>
      <div class="panel" style="flex:1;text-align:center"><div style="font-size:24px;font-weight:700">${(+spentToday).toFixed(1)}</div><small style="color:var(--soft)">spent today</small></div>
    </div>
    <b style="font-size:13px">Recent usage</b>
    <div style="max-height:240px;overflow-y:auto;margin-top:6px">
      ${ledger.slice(0, 40).map(l => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:5px 2px;border-bottom:1px solid var(--line)">
        <span>${esc(l.reason)}${l.model ? ` <span style="color:var(--soft)">· ${esc(l.model)}</span>` : ''}</span>
        <b style="color:${l.credits < 0 ? '#d92e66' : '#0d9463'}">${l.credits > 0 ? '+' : ''}${(+l.credits).toFixed(2)}</b></div>`).join('') || '<small>No usage yet.</small>'}
    </div>
    <div class="panel" style="margin-top:14px;padding:14px 16px">
      <b style="font-size:13px">🔊 Voice & narration</b>
      <div style="display:flex;flex-direction:column;gap:11px;margin-top:9px;font-size:12.5px">
        <label style="display:flex;align-items:center;gap:8px">Narrator voice
          <select id="tp-narr" style="border:1px solid var(--line);border-radius:9px;padding:5px 9px;background:#fff">
            ${['Iapetus · male, clear (recommended — best-tested calm narrator)', 'Algenib · male, deep & gravelly', 'Charon · male, calm & clear', 'Orus · male, firm', 'Schedar · male, even', 'Sulafat · female, warm', 'Gacrux · female, mature'].map(v => { const name = v.split(' ')[0]; return `<option value="${name}" ${ttsPrefs().narrator === name ? 'selected' : ''}>${v}</option>`; }).join('')}
          </select></label>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tp-prepare" ${ttsPrefs().prepare ? 'checked' : ''}> Prepare the first spoken line in the background (instant playback)</label>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tp-auto" ${ttsPrefs().autoplay ? 'checked' : ''}> Read each new moment aloud automatically</label>
        <label style="display:flex;flex-direction:column;gap:4px">
          <span style="display:flex;justify-content:space-between;align-items:center">📖 Storyteller (narrator) direction <button class="btn btn-ghost small" id="tp-narr-reset" style="padding:2px 9px;font-size:10.5px">↺ reset to default</button></span>
          <textarea id="tp-narr-style" rows="3" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;font-family:inherit;resize:vertical">${esc(ttsPrefs().narratorStyle)}</textarea>
          <small style="color:var(--soft)">Default: <i>${esc(DEFAULT_NARRATOR_STYLE)}</i></small></label>
        <label style="display:flex;flex-direction:column;gap:4px">
          <span style="display:flex;justify-content:space-between;align-items:center">🎭 Character direction <button class="btn btn-ghost small" id="tp-char-reset" style="padding:2px 9px;font-size:10.5px">↺ reset to default</button></span>
          <textarea id="tp-char-style" rows="3" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;font-family:inherit;resize:vertical">${esc(ttsPrefs().characterStyle)}</textarea>
          <small style="color:var(--soft)">Default: <i>${esc(DEFAULT_CHARACTER_STYLE)}</i> · <code>{mood}</code> is replaced live</small></label>
        <label style="display:flex;flex-direction:column;gap:4px">Extra notes (added to both, on top of the above)
          <input id="tp-custom" placeholder="e.g. slightly slower; a hint of a smile" value="${esc(ttsPrefs().custom)}" style="border:1px solid var(--line);border-radius:9px;padding:6px 10px"></label>
      </div>
    </div>
    <!-- Time-skip behaviour: whether big jumps play as a scene-by-scene film, and how much
         of the plan makes the cut (main plot only vs also side plots). See skipPrefs(). -->
    <div class="panel" style="margin-top:14px;padding:14px 16px">
      <b style="font-size:13px">⏭ Time skips</b>
      <div style="display:flex;flex-direction:column;gap:11px;margin-top:9px;font-size:12.5px">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="sk-animate" ${skipPrefs().animate ? 'checked' : ''}> Animate big time skips as a scene-by-scene film (off = jump straight to the outcome)</label>
        <label style="display:flex;align-items:center;gap:8px">What gets a scene
          <select id="sk-detail" style="border:1px solid var(--line);border-radius:9px;padding:5px 9px;background:#fff">
            <option value="full" ${skipPrefs().detail !== 'main' ? 'selected' : ''}>Main plot + side plots (bonds, character moments)</option>
            <option value="main" ${skipPrefs().detail === 'main' ? 'selected' : ''}>Only plot-critical events (may be none)</option>
          </select></label>
        <small style="color:var(--soft)">Applies to skips over ~20 minutes. Each scene is a real moment in the world — it costs the same as a normal tick and lands in your timeline (undo works).</small>
      </div>
    </div>
    <button class="btn btn-ghost small" id="logout" style="margin-top:14px">Sign out</button>
  </div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  $('.x', m).onclick = () => m.remove();
  const savePrefs = () => saveTtsPrefs({ narrator: $('#tp-narr', m).value, prepare: $('#tp-prepare', m).checked, autoplay: $('#tp-auto', m).checked, narratorStyle: $('#tp-narr-style', m).value, characterStyle: $('#tp-char-style', m).value, custom: $('#tp-custom', m).value });
  ['#tp-narr', '#tp-prepare', '#tp-auto', '#tp-narr-style', '#tp-char-style', '#tp-custom'].forEach(sel => { const el = $(sel, m); el.addEventListener('change', savePrefs); el.addEventListener('blur', savePrefs); });
  $('#tp-narr-reset', m).onclick = () => { $('#tp-narr-style', m).value = DEFAULT_NARRATOR_STYLE; savePrefs(); };
  $('#tp-char-reset', m).onclick = () => { $('#tp-char-style', m).value = DEFAULT_CHARACTER_STYLE; savePrefs(); };
  const saveSkip = () => saveSkipPrefs({ animate: $('#sk-animate', m).checked, detail: $('#sk-detail', m).value });
  ['#sk-animate', '#sk-detail'].forEach(sel => $(sel, m).addEventListener('change', saveSkip));
  $('#logout', m).onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); S.user = null; m.remove(); nav('#/auth'); };
}

/* boot */
route();
