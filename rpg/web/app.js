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
// ms=0 → sticky toast (won't auto-dismiss). Always returns a dismiss fn so callers can
// clear a progress toast ("Transcribing…") when the work finishes. Back-compatible: existing
// two-arg calls keep the 3.4s auto-dismiss and simply ignore the return value.
function toast(msg, cls = '', ms = 3400) {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.textContent = msg;
  $('#toasts').appendChild(t);
  const dismiss = () => { if (t._gone) return; t._gone = true; t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); };
  const timer = ms > 0 ? setTimeout(dismiss, ms) : null;
  return () => { if (timer) clearTimeout(timer); dismiss(); };
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
  const p = { narrator: 'Iapetus', prepare: true, autoplay: true, innerVoice: true, musicOn: true, musicVol: 0.10, voiceVol: 1, voiceRate: 1.15, narratorStyle: DEFAULT_NARRATOR_STYLE, characterStyle: DEFAULT_CHARACTER_STYLE, custom: '', micId: '', ...stored };
  if (stored.musicVol === 0.35 || stored.musicVol === 0.08) p.musicVol = 0.10;   // remap old defaults
  if (stored.voiceRate === 1 || stored.voiceRate === 1.05) p.voiceRate = 1.15;    // new default pace (old persisted defaults follow it; a custom choice is untouched)
  return p;
};
// Time-skip settings (Account → Time skips). animate: large skips play as a scene-by-scene
// FILM (the server plans the events; see server/gm.js runChapter) — off = classic single
// summarised tick. detail: 'full' = main plot AND side plots (bond moments, character
// development); 'main' = only plot-critical events (a skip may then have no scenes at all).
const skipPrefs = () => ({ animate: true, detail: 'full', ...JSON.parse(localStorage.getItem('viv_skip') || '{}') });
const saveSkipPrefs = (p) => localStorage.setItem('viv_skip', JSON.stringify({ ...skipPrefs(), ...p }));
// ── RPG fork: first-person mode ──────────────────────────────────────────────
// A world with player_character_id is a first-person RPG: the stage locks to that
// character, time is storyteller-paced ('auto'), and the player acts via the action bar.
const rpgPC = () => S.worldData?.world?.player_character_id || null;
// adminMode: 🛠 the player steps OUTSIDE their character into the simulation's admin seat —
// read ANY mind (even off-scene), talk to any inner voice, ask the GM about secrets, and
// change anything about the world. Off (default) = you are only your character: other minds
// are closed, their thought-lines are hidden from storybook & voiceover, the GM keeps
// secrets and refuses godlike changes (sprites & new places to explore remain fine).
const rpgPrefs = () => { const st = JSON.parse(localStorage.getItem('viv_rpg') || '{}'); return { adminMode: !!(st.adminMode ?? st.innerSight), ...st }; };
const saveRpgPrefs = (p) => localStorage.setItem('viv_rpg', JSON.stringify({ ...rpgPrefs(), ...p }));
const adminOn = () => !rpgPC() || rpgPrefs().adminMode;   // classic worlds behave like admin-on
const saveTtsPrefs = (p) => localStorage.setItem('viv_tts', JSON.stringify({ ...ttsPrefs(), ...p }));
const fmtClock = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cutoutFor = (ch) => { const o = (ch.state.outfits || []).find(o => o.name === (ch.state.outfit || 'everyday')) || (ch.state.outfits || [])[0]; return o?.cutout_asset_id; };

/* ── mic component: 🎙 → record (pulse+✕) → click again → transcribe → insert ── */
// Turn a getUserMedia failure into an actionable message. The #1 cause in practice is an
// INSECURE origin: browsers only expose the microphone on https:// (or localhost), so over a
// plain http:// address navigator.mediaDevices is undefined — the fix is to open the game via
// the HTTPS tunnel link. Other cases: permission blocked, or no device / a stale selection.
function micError(e) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || e?.name === 'InsecureContext')
    toast('🎤 The microphone needs a secure (HTTPS) connection. Open the game via the https:// tunnel link — a plain http:// address blocks it. (Settings → Microphone lets you pick & test one once you\'re on HTTPS.)', 'err');
  else if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError')
    toast('🎤 Microphone permission is blocked — allow it for this site in your browser, then try again.', 'err');
  else if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError')
    toast('🎤 No microphone found (or the chosen one is unplugged). Pick another in Settings → Microphone.', 'err');
  else toast('🎤 Microphone unavailable — you can type instead.', 'err');
}

function attachMic(field, input) {
  const btn = document.createElement('button');
  btn.className = 'micbtn'; btn.type = 'button'; btn.title = 'Speak instead of typing';
  btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>';
  // State machine: idle → starting (device opening) → recording → transcribing → idle.
  // Every transition is guarded so double-clicks, slow device opens, unplugged mics and
  // recorder errors can never leave the button stuck or two capture flows fighting.
  let rec = null, chunks = [], cancelBtn = null, cancelled = false, starting = false, autoStop = null;
  // Central teardown — safe from any state, any number of times. Everything that can fail
  // routes through here so the mic can never stay half-open (which is what made the next
  // click conflict with a zombie capture).
  const cleanup = (stream) => {
    if (autoStop) { clearTimeout(autoStop); autoStop = null; }
    try { stream?.getTracks().forEach(t => t.stop()); } catch {}
    btn.classList.remove('rec'); cancelBtn?.remove(); cancelBtn = null; rec = null;
  };
  btn.onclick = async () => {
    if (starting || btn.classList.contains('busy')) return;      // open/transcribe in flight — ignore extra clicks
    if (rec) { try { rec.stop(); } catch { cleanup(); } return; } // click #2 = stop & transcribe
    starting = true; btn.classList.add('busy');                   // instant feedback while the device opens
    let stream = null, clearOpening = null, timedOut = false;
    // Opening the device can genuinely take seconds (permission prompt, sleeping USB mic, a
    // wedged audio stack) — this is the silent "freeze" users hit. Tell them what's happening
    // after 400 ms, and never wait beyond 12 s.
    const slow = setTimeout(() => { clearOpening = toast('🎙 Opening the microphone… (if nothing happens, look for a browser permission prompt)', '', 0); }, 400);
    const open = (constraint) => navigator.mediaDevices.getUserMedia({ audio: constraint })
      .then(s => { if (timedOut) { try { s.getTracks().forEach(t => t.stop()); } catch {} } return s; }); // a too-late grant must not leave the mic captured
    const withTimeout = (p) => Promise.race([p, new Promise((_, rej) =>
      setTimeout(() => { timedOut = true; rej(Object.assign(new Error('mic open timed out'), { name: 'TimeoutError' })); }, 12000))]);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
      const micId = ttsPrefs().micId;
      try {
        stream = await withTimeout(open(micId ? { deviceId: { exact: micId } } : true));
      } catch (e) {
        // The saved device may be unplugged or held by another app — fall back to the system
        // default once before giving up, so a stale Settings pick doesn't brick the mic.
        if (micId && ['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(e?.name)) {
          toast('🎤 Your saved microphone is unavailable — using the system default. (Settings → Microphone to re-pick.)');
          timedOut = false;
          stream = await withTimeout(open(true));
        } else throw e;
      }
      rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined });
      chunks = []; cancelled = false;
      rec.onerror = (ev) => {   // mid-recording device failure (unplugged, OS revoked, encoder died)
        toast(`🎤 Recording failed${ev.error?.message ? ': ' + ev.error.message : ''} — nothing was lost but this take; try again.`, 'err');
        cancelled = true;
        try { rec?.stop(); } catch { cleanup(stream); }
      };
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        const localRec = rec;
        cleanup(stream);
        if (cancelled) { btn.classList.remove('busy'); return; }
        btn.classList.add('busy');
        // Visible progress so the transcription round-trip never reads as a frozen mic.
        const clearBusyToast = toast('🎧 Transcribing…', '', 0);
        try {
          const blob = new Blob(chunks, { type: localRec?.mimeType || 'audio/webm' });
          const fd = new FormData(); fd.append('file', blob, 'clip.webm');
          const { text } = await api('/api/asr', { method: 'POST', body: fd });
          const clean = (text || '').trim();
          if (!clean) { toast('🤔 Didn\'t catch that — speak a little closer and try again.', 'err'); }
          else {
            input.value = (input.value ? input.value + ' ' : '') + clean;
            input.dispatchEvent(new Event('input')); input.focus();
          }
          refreshMe();
        } catch (e) { fail(e); } finally { btn.classList.remove('busy'); clearBusyToast(); }
      };
      rec.start();
      btn.classList.remove('busy'); btn.classList.add('rec'); btn.title = 'Click to stop & transcribe';
      cancelBtn = document.createElement('button');
      cancelBtn.className = 'cancelrec'; cancelBtn.type = 'button'; cancelBtn.textContent = '✕'; cancelBtn.title = 'Discard recording';
      cancelBtn.onclick = () => { cancelled = true; try { rec?.stop(); } catch { cleanup(stream); } };
      field.prepend(cancelBtn);
      autoStop = setTimeout(() => { try { rec?.stop(); } catch { cleanup(stream); } }, 60000);  // cleared by cleanup() so it can never kill a LATER take
    } catch (e) {
      cleanup(stream);
      btn.classList.remove('busy');
      if (e?.name === 'TimeoutError')
        toast('🎤 The microphone did not respond within 12 s — it may be held by another app (video call?) or the audio system is stuck. Free it up, or pick another device in Settings → Microphone, then try again.', 'err');
      else if (e?.name === 'NotReadableError')
        toast('🎤 The microphone is busy — another app or tab is using it. Close it there and try again.', 'err');
      else micError(e);
    } finally {
      starting = false;
      clearTimeout(slow); clearOpening?.();
    }
  };
  field.appendChild(btn);
  return btn;
}

// Settings → Microphone: pick which input device the 🎙 buttons use, and TEST it with a live
// level meter so you can confirm it's actually hearing you before relying on it in a scene.
// Wrap any mediaDevices promise so a wedged audio stack can never hang the UI — the device
// list / tester always settle within `ms` and fall into a visible, retryable error state.
function mediaTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`${what} timed out`), { name: 'TimeoutError' })), ms); }),
  ]);
}
async function renderMicSettings(box) {
  if (!box) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.enumerateDevices) {
    box.innerHTML = `<div style="background:#fff4e5;border:1px solid #ffd9a8;border-radius:10px;padding:10px 12px;color:#8a5a00;line-height:1.5">
      🔒 The microphone is only available over a secure <b>HTTPS</b> connection (or on localhost). You're currently on <code>${esc(location.origin)}</code>, so browsers block it.<br>
      → Open the game via the <b>https:// tunnel link</b> and the mic (and this tester) will work.</div>`;
    return;
  }
  box.innerHTML = `<span class="spinner dark"></span> <span style="color:var(--soft)">Looking for microphones…</span>`;
  // Retryable failure state — the old code awaited enumerateDevices() with NO timeout, so a
  // wedged audio stack left the settings stuck on "Loading…" forever.
  const showError = (msg) => {
    box.innerHTML = `<div style="background:#fdeeee;border:1px solid #f3c1c1;border-radius:10px;padding:10px 12px;color:#a33;line-height:1.5">
      🎤 ${esc(msg)}<br><button class="btn btn-soft small" id="mic-retry" style="margin-top:7px">↻ Try again</button></div>`;
    $('#mic-retry', box).onclick = () => renderMicSettings(box);
  };
  const sel = ttsPrefs().micId;
  let devices = [];
  try {
    devices = (await mediaTimeout(navigator.mediaDevices.enumerateDevices(), 6000, 'device list')).filter(d => d.kind === 'audioinput');
  } catch (e) {
    return showError(e?.name === 'TimeoutError'
      ? 'The device list did not load — the browser\'s audio system seems stuck (this often means another app or a zombie tab is holding the microphone). Close whatever might be using it — or reload this page — and try again.'
      : `Could not list audio devices (${e?.name || 'unknown error'}).`);
  }
  const haveLabels = devices.some(d => d.label);
  if (!haveLabels) {
    box.innerHTML = `<button class="btn btn-soft small" id="mic-enable">🎤 Enable microphone access</button>
       <p style="font-size:11px;color:var(--soft);margin:6px 0 0">Grant access once so your microphones can be listed by name.${devices.length ? '' : ' (No audio inputs visible yet — they appear after access is granted.)'}</p>`;
    $('#mic-enable', box).onclick = async () => {
      box.innerHTML = `<span class="spinner dark"></span> <span style="color:var(--soft)">Waiting for permission… check the browser prompt</span>`;
      let s = null;
      try {
        s = await mediaTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 20000, 'microphone access');
        // Enumerate WHILE the stream is live — Firefox only exposes device labels during an
        // active capture (or with a remembered permission); enumerating after stop() can
        // yield a blank list there, which looked like "no microphones".
        await renderMicSettings(box);
      } catch (e) {
        if (e?.name === 'TimeoutError') showError('No answer from the permission prompt after 20 s. If no prompt appeared, the site may be blocked: click the 🔒/camera icon in the address bar and allow the microphone, then try again.');
        else { micError(e); renderMicSettings(box); }
      } finally { try { s?.getTracks().forEach(t => t.stop()); } catch {} }
    };
    return;
  }
  // Stale saved device (unplugged, or Firefox rotated its per-session device IDs): warn and
  // fall back to the system default instead of silently failing later in the recorder/tester.
  const staleSaved = sel && !devices.some(d => d.deviceId === sel);
  if (staleSaved) saveTtsPrefs({ micId: '' });
  box.innerHTML = `${staleSaved ? '<p style="font-size:11px;color:#a86f0d;background:#fdf3e0;border:1px solid #f4d79a;border-radius:8px;padding:6px 9px;margin-bottom:8px">Your previously chosen microphone is no longer available — switched to the system default.</p>' : ''}
    <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">Input device
      <select id="mic-sel" style="border:1px solid var(--line);border-radius:9px;padding:5px 9px;background:#fff;min-width:220px">
        <option value="">System default</option>
        ${devices.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel && !staleSaved ? 'selected' : ''}>${esc(d.label || ('Microphone ' + (i + 1)))}</option>`).join('')}
      </select>
      <button class="btn btn-soft small" id="mic-test">🎙 Test</button>
      <button class="btn btn-ghost small" id="mic-refresh" title="Re-scan audio devices">↻</button>
    </label>
    <div id="mic-meter" style="display:none;margin-top:10px;max-width:360px">
      <div style="font-size:11px;color:var(--soft);margin-bottom:4px">Speak now — the bar should move:</div>
      <div style="height:12px;background:#efecfb;border-radius:6px;overflow:hidden"><div id="mic-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#4ade80,#f59e0b);border-radius:6px"></div></div>
      <div id="mic-teststatus" style="font-size:11px;color:var(--soft);margin-top:5px">&nbsp;</div>
    </div>`;
  $('#mic-sel', box).onchange = () => { saveTtsPrefs({ micId: $('#mic-sel', box).value }); toast('🎤 Microphone saved'); };
  $('#mic-test', box).onclick = () => testMic(box, $('#mic-sel', box).value);
  $('#mic-refresh', box).onclick = () => renderMicSettings(box);
  // live refresh when devices are (un)plugged — guarded so it only fires while this box is on screen
  navigator.mediaDevices.ondevicechange = () => { if (document.contains(box)) renderMicSettings(box); else navigator.mediaDevices.ondevicechange = null; };
}

let MIC_TEST_RUNNING = false;   // one tester at a time — a second click during a run is ignored
async function testMic(box, deviceId) {
  if (MIC_TEST_RUNNING) return;
  MIC_TEST_RUNNING = true;
  const meter = $('#mic-meter', box), bar = $('#mic-bar', box), status = $('#mic-teststatus', box);
  meter.style.display = 'block'; status.textContent = 'Opening microphone…';
  let stream, ctx, raf, peak = 0;
  const stop = () => { MIC_TEST_RUNNING = false; cancelAnimationFrame(raf); try { stream?.getTracks().forEach(t => t.stop()); ctx?.close(); } catch {} bar.style.width = '0%';
    status.textContent = peak > 8 ? `✅ Working — heard your voice (peak ${peak}%).` : '⚠️ No sound detected. Check the mic isn\'t muted, pick another device, and test again.'; };
  try {
    // Never hang the tester on a wedged device — 12s cap, then a concrete error message.
    let timedOut = false;
    const open = (c) => Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: c })
        .then(s => { if (timedOut) { try { s.getTracks().forEach(t => t.stop()); } catch {} } return s; }),
      new Promise((_, rej) => setTimeout(() => { timedOut = true; rej(Object.assign(new Error('mic open timed out'), { name: 'TimeoutError' })); }, 12000)),
    ]);
    try {
      stream = await open(deviceId ? { deviceId: { exact: deviceId } } : true);
    } catch (e) {
      // Selected device gone/busy (or a stale id from an earlier browser session) → test the
      // system default instead of failing, and say so.
      if (deviceId && ['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(e?.name)) {
        status.textContent = 'Chosen mic unavailable — testing the system default instead…';
        timedOut = false;
        stream = await open(true);
      } else throw e;
    }
    status.textContent = 'Listening…';
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // A context created outside a direct user gesture can start SUSPENDED — then the analyser
    // only ever sees silence and the tester wrongly reports "no sound". Resume it first.
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); const t0 = Date.now();
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
      const pct = Math.min(100, Math.round((m / 128) * 180)); bar.style.width = pct + '%'; peak = Math.max(peak, pct);
      if (Date.now() - t0 < 5000) raf = requestAnimationFrame(loop); else stop();
    };
    loop();
  } catch (e) {
    MIC_TEST_RUNNING = false;
    meter.style.display = 'none';
    if (e?.name === 'TimeoutError') toast('🎤 The microphone did not respond within 12 s — it may be held by another app, or the audio system is stuck. Free it, or pick another device, then test again.', 'err');
    else if (e?.name === 'NotReadableError') toast('🎤 The microphone is busy — another app or tab is using it. Close it there and test again.', 'err');
    else micError(e);
  }
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
  const mc = $('#music-chip'); if (mc) mc.onclick = musicWidget;
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
  document.body.classList.remove('rpg');   // re-set by stageScreen when the world has a PC
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
  stopMusic();   // the score belongs to a world — leaving it fades the music out
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
        if (e.target.closest('[data-editintro]')) { introEditor(c.dataset.id); return; }
        if (e.target.closest('[data-intro]')) {
          // enter like a game intro: the opening sequence plays as a film (scenes, music,
          // voice-over), then lands on the live present where the player takes over
          S.replay = { intro: true };
          nav(`#/stage?w=${c.dataset.id}`);
          return;
        }
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary small" style="flex:1">▶ ${w.status === 'live' ? t('resume', 'Resume') : t('continue_building', 'Continue building')}</button>
        ${w.has_intro && w.status === 'live' ? `<button class="btn btn-teal small" data-intro title="Watch the opening sequence — scenes, music and voices — then take over">🎬 ${t('from_beginning', 'From the beginning')}</button><button class="btn btn-ghost small" data-editintro title="Edit the opening: script lines, summaries, music">✏️</button>` : ''}
        <button class="btn btn-ghost small" data-del title="Delete">🗑</button>
      </div>
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
        <div class="cast-tile" data-id="${c.id}" ${(c.intro_tick_idx || 0) > world.tick_index ? 'style="opacity:.55"' : ''}>
          <div class="ring"><div style="background-image:url(${assetUrl(cutoutFor(c))})"></div></div>
          <b>${esc(c.name)}</b>
          <div class="mood">${esc(c.state.mood || '—')}</div>
          ${(c.intro_tick_idx || 0) > world.tick_index
            ? `<span class="tag g" title="You rewound to before they joined — they return when the story reaches scene ${c.intro_tick_idx}">⏳ joins at scene ${c.intro_tick_idx}</span>`
            : `<span class="tag t">${esc(locName(c.state.location_id))}</span>`}
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
/* ── 🕯 INNER VOICE (reusable component) ─────────────────────────────────────
   Chat inside a character's head — the player speaks as another inner voice
   (angel/devil on the shoulder, a self-reflecting aspect). Mounted in BOTH
   places a character opens: the 🧠 mind overlay (stage sprite click) and the
   full profile drawer. Server: gm.innerVoiceChat — short in-character replies,
   optional live state changes; current-moment turns colour the next tick;
   clearing deletes every trace. Replies play in the character's own voice.  */
function innerVoiceHtml(c) {
  return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
      <b style="font-size:14px">🕯 Inner voice</b>
      <small style="color:var(--soft);flex:1">speak inside ${esc(c.name)}'s head — this moment</small>
      <button class="btn btn-ghost small" id="iv-clear" title="Clear — the dialogue never happened; nothing reaches the story" style="padding:3px 8px">🗑</button>
    </div>
    <div class="iv-log" id="iv-log"><div class="msg status">…</div></div>
    <div class="chat-inputrow" style="padding:8px 0 0"><div class="field" id="iv-field" style="background:#fff;margin:0"><input id="iv-in" placeholder="whisper to ${esc(c.name)}…"><button class="btn btn-primary small" id="iv-send">Send</button></div></div>
    <p style="font-size:10px;color:var(--soft);margin:6px 0 0">an inner dialogue — they\'re used to voices like yours. It may colour their next scene; clearing it removes every trace.</p>`;
}
// Chunked read-aloud for inner-voice replies: sentence chunks (≥8 words, short ones merge —
// factChunks), first chunk requested immediately, the rest staggered 500 ms apart, played
// seamlessly through the WebAudio engine. One reply speaks at a time; the 🔊 toggles ⏹.
let ivSpeakRun = null;
async function speakTextChunks(text, ch, btnEl, emotion = '', mode = 'thought') {
  if (ivSpeakRun) { const r = ivSpeakRun; ivSpeakRun = null; r.stop(); }
  const run = { cancelled: false, handle: null };
  run.stop = () => { run.cancelled = true; run.handle?.stop(); btnEl?.classList.remove('playing'); if (btnEl) btnEl.textContent = '🔊'; };
  ivSpeakRun = run;
  if (btnEl) { btnEl.classList.add('playing'); btnEl.textContent = '⏹'; }
  const chunks = factChunks(text);
  const proms = chunks.map((t, k) => new Promise(res => setTimeout(() => res(fetchTts(t, ch, emotion, mode).catch(() => null)), k * 500)));
  try {
    for (let k = 0; k < chunks.length && !run.cancelled; k++) {
      const r = await proms[k];
      if (!r || run.cancelled) continue;
      if (proms[k + 1]) proms[k + 1].then(n => n && fetch(assetUrl(n.assetId), { credentials: 'same-origin' })).catch(() => {});   // warm next
      if (!run.cancelled) await new Promise(res => { run.handle = playClipUrl(assetUrl(r.assetId), res); });
    }
  } finally {
    if (btnEl) { btnEl.classList.remove('playing'); btnEl.textContent = '🔊'; }
    if (ivSpeakRun === run) ivSpeakRun = null;
    refreshMe();
  }
}

function bindInnerVoice(root, c, { onStateChange } = {}) {
  const log = $('#iv-log', root);
  if (!log) return;
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const addMsg = (cls, text) => {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    if (cls === 'assistant') {
      d.innerHTML = `<span class="serif" style="font-style:italic">${esc(text)}</span> <button class="iv-speak" title="hear it in ${esc(c.name)}\'s voice">🔊</button>`;
      // the reply reads aloud in THIS character's voice, chunk by chunk (click again = stop)
      $('.iv-speak', d).onclick = (e) => {
        if (e.target.classList.contains('playing')) { ivSpeakRun?.stop(); ivSpeakRun = null; return; }
        speakTextChunks(text, c, e.target, c.state.mood || '', 'thought');
      };
    } else d.textContent = text;
    log.appendChild(d); scroll(); return d;
  };
  const hello = () => { log.innerHTML = `<div class="msg assistant"><span class="serif" style="font-style:italic">…a familiar presence settles at the edge of ${esc(c.name)}\'s thoughts, listening.</span></div>`; };
  api(`/api/characters/${c.id}/inner-voice`).then(({ history }) => {
    log.innerHTML = '';
    if (!history.length) hello();
    for (const h of history) addMsg(h.role === 'user' ? 'user' : 'assistant', h.content);
    scroll();
  }).catch(() => { log.innerHTML = ''; hello(); });
  attachMic($('#iv-field', root), $('#iv-in', root));
  let busy = false;
  const send = async () => {
    const text = $('#iv-in', root).value.trim(); if (!text || busy) return;
    busy = true; $('#iv-in', root).value = '';
    addMsg('user', text);
    const status = addMsg('status', `…${c.name} turns the thought over…`);
    try {
      const r = await api(`/api/characters/${c.id}/inner-voice`, { method: 'POST', body: { message: text, lang: getLang() } });
      status.remove();
      const bubble = addMsg('assistant', r.reply);
      if (r.changed) { c.state = r.state; S.worldData = null; onStateChange?.(r.state); }
      // by default the character speaks their reply (Account → Voice to turn off)
      if (ttsPrefs().innerVoice !== false) speakTextChunks(r.reply, c, $('.iv-speak', bubble), c.state.mood || '', 'thought');
      refreshMe();
    } catch (e) { status.remove(); addMsg('assistant', '…the thought slips away. (' + e.message + ')'); }
    busy = false;
  };
  $('#iv-send', root).onclick = send;
  $('#iv-in', root).onkeydown = (e) => { if (e.key === 'Enter') send(); };
  $('#iv-clear', root).onclick = async () => {
    if (!confirm(`Forget this whole inner dialogue? ${c.name} keeps any changes it already caused, but nothing of the conversation will reach the story.`)) return;
    try { await api(`/api/characters/${c.id}/inner-voice`, { method: 'DELETE' }); log.innerHTML = ''; hello(); toast('Inner dialogue forgotten'); } catch (e) { fail(e); }
  };
}

// The "Now · materialised state" body — extracted so the inner-voice chat can refresh it
// live when a dialogue turn changes mood/thought/attributes (insights become visible).
function nowStateHtml(st) {
  return `<p>${esc(st.mood || '')} · ${esc(st.activity || '')}${st.thought ? ` · <i>"${esc(st.thought)}"</i>` : ''}${(st.conditions || []).length ? ' · ' + st.conditions.map(esc).join(', ') : ''}</p>
    ${(st.emotions || []).length ? `<p style="margin-top:5px">${st.emotions.map(e => `<span class="tag c" style="margin:0 3px 3px 0">${esc(e.name)} ${Math.round((e.intensity ?? 0.5) * 100)}%</span>`).join('')}</p>` : ''}
    ${(st.intentions || []).length ? `<p style="margin-top:4px">${st.intentions.map(i => `<span class="intent-chip">→ ${esc(i)}</span>`).join('')}</p>` : ''}`;
}
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
        <div class="attr" id="now-state" style="border:1.5px dashed #9fdfe2;background:#f2fbfc"><h5 style="color:#0d7e83">Now · materialised state</h5>${nowStateHtml(c.state)}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-coral small" id="godedit">⚡ God-edit</button><button class="btn btn-soft small" id="openmind">🧠 Mind</button></div>
      </div>
      <div class="panel iv-panel">${innerVoiceHtml(c)}</div>
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
    // The editable image prompt: the sprite's own stored look-description if it has one,
    // otherwise the character's base appearance (so it's a real, meaningful prompt — not
    // just the outfit name). Editing it and regenerating repaints with the new prompt
    // (identity stays anchored to the reference portrait).
    const promptDefault = (o?.description && o.description.toLowerCase() !== oname.toLowerCase()) ? o.description : (c.base.appearance || oname);
    manageBar.innerHTML = `
      <div style="font-size:11px;font-weight:700;margin-bottom:5px">🎨 Sprite “${esc(oname)}” · image prompt</div>
      <textarea id="sm-cap" rows="3" placeholder="describe the look — hair, clothes, expression, pose…" style="width:100%;border:1.5px solid var(--line);border-radius:9px;padding:7px 9px;font-size:12px;font-family:inherit;box-sizing:border-box">${esc(promptDefault)}</textarea>
      <div style="display:flex;gap:7px;margin-top:7px;flex-wrap:wrap">
        <button class="btn btn-soft small" id="sm-regen" style="flex:1 1 auto;min-width:0;white-space:nowrap" title="Regenerate the sprite with the edited prompt (~30s)">🔁 Regenerate</button>
        <button class="btn btn-ghost small" id="sm-del" style="flex:none;color:#d92e66" title="Delete this sprite">🗑</button>
      </div>`;
    $('.outfit-strip', bg).after(manageBar);   // sits inside the column, right under the sprite strip
    $('#sm-regen', manageBar).onclick = async (e) => {
      const btn = e.target; if (btn.disabled) return;
      btn.disabled = true; btn.textContent = '⏳ painting…';
      try {
        await api(`/api/characters/${c.id}/outfits`, { method: 'POST', body: { name: oname, rawPrompt: $('#sm-cap', manageBar).value, description: $('#sm-cap', manageBar).value, replace: true, ...(o?.emotion ? { emotion: o.emotion } : {}) } });
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
  bindInnerVoice(bg, c, { onStateChange: (st) => {
    // insights become visible: refresh the live-state box with a brief golden pulse
    const ns = $('#now-state', bg);
    if (ns) { ns.innerHTML = `<h5 style="color:#0d7e83">Now · materialised state</h5>${nowStateHtml(st)}`; ns.style.boxShadow = '0 0 0 3px rgba(240,169,46,.35)'; setTimeout(() => ns.style.boxShadow = '', 1200); }
  } });
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
        <div style="padding:13px 16px;border-bottom:1px solid var(--line)"><b style="font-size:14px">Who do you want to be?</b><div style="font-size:11px;color:var(--soft)">your character, their world, the people in their life — I'll draft everything and refine it with you</div></div>
        <div class="chatlog" id="wz-log">
          <div class="msg assistant">This is YOUR story — so first: who do you want to be? A billionaire in today's world, a vampire in a modern city, a wizard in a medieval academy, a starship captain on the frontier…? Pick a spark below, or just tell me in your own words (age, epoch, dreams, fears — as much or as little as you like). 🧙</div>
          <div class="wz-seeds">
            ${[['💰','Billionaire','a self-made tech billionaire in the contemporary world — money can buy everything except the things I actually want'],
               ['🧛','Vampire','a newly-turned vampire trying to keep a normal life in a modern city where nobody knows the night has teeth'],
               ['🧙','Wizard','a young wizard at a medieval academy of magic, gifted but untested, with a rival and a secret'],
               ['🚀','Starship captain','a starship captain running frontier colony routes with a small loyal crew and too many debts'],
               ['🕵️','Detective','a private detective in a rain-soaked noir metropolis, one unsolved case away from redemption'],
               ['⚔️','Knight','a knight errant in a war-torn medieval kingdom, sworn to a fading house'],
               ['🎸','Rockstar','a musician on the edge of a breakthrough, juggling the band, love and old debts'],
               ['🏝','Castaway','a castaway building a new life on a strange island that is more than it seems']]
              .map(x => `<button class="wz-seed" data-seed="${esc(x[2])}">${x[0]} ${x[1]}</button>`).join('')}
          </div>
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
  $$('.wz-seed').forEach(bn => bn.onclick = () => { $('#wz-in').value = `I want to play ${bn.dataset.seed}. Help me flesh out who I am.`; $('#wz-send').click(); });

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
        ${job.status === 'done' && job.worldId ? `
          ${(W.plan?.intro_scenes || []).length ? `<button class="btn btn-teal" id="wz-score" style="width:100%;margin-top:10px">🎼 Choose the opening's music</button>` : ''}
          <button class="btn btn-primary" id="wz-open" style="width:100%;margin-top:8px">▶ Open "${esc(W.plan?.title || 'the world')}"</button>` : ''}
        ${job.status === 'error' ? `<div style="font-size:11.5px;color:#d92e66;margin-top:8px">${esc(job.error || '')}</div>` : ''}`;
      refreshMe();
      if (job.status === 'done') {
        const open = $('#wz-open');
        if (open) open.onclick = () => { W.history = []; W.plan = null; W.estimate = null; W.jobId = null; S.world = job.worldId; S.worldData = null; nav(`#/stage?w=${job.worldId}`); };
        const score = $('#wz-score');
        if (score) score.onclick = () => introMusicPicker(job.worldId, W.plan);
        toast('Your world is ready 🌍', 'gold');
        return;
      }
      if (job.status === 'error') return;
      if (location.hash.includes('wizard')) setTimeout(pollBuild, 3000);
    } catch (e) { /* job polling is best-effort; the build continues server-side regardless */ }
  }
}

/* ── 🎼 Opening-sequence music picker (wizard final step) ─────────────────────
   For every intro scene: the top-5 search candidates with inline audio preview
   players, a "carry the previous scene\'s track" option, and an own-file upload.
   Choices apply to the intro ticks (replays switch there), each scene\'s
   location memory, and the world\'s current score.                            */
async function introMusicPicker(worldId, plan) {
  const scenes = (plan?.intro_scenes || []).slice(0, 6);
  if (!scenes.length) return;
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:760px"><div class="modal-head gold">
    <div><b>🎼 Score the opening</b><small>pick each scene\'s music — preview, carry over, or upload your own</small></div><span class="x">✕</span></div>
  <div class="modal-body" id="imp-body" style="max-height:72vh;overflow-y:auto">
    <div class="empty-hint" style="padding:26px"><span class="spinner dark"></span> finding candidates…</div>
  </div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); $$('audio', m).forEach(a => a.pause()); };
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;

  // the intro ticks (idx order) — needed to map choices onto the timeline
  const { ticks } = await api(`/api/worlds/${worldId}/export/timeline?branchId=&toIdx=999999`).catch(() => ({ ticks: [] }));
  const introTicks = ticks.filter(t => { try { const s = t.seq && JSON.parse(t.seq); return s?.kind === 'intro'; } catch { return false; } });

  // top-5 candidates per scene (parallel, staggered lightly)
  const cands = await Promise.all(scenes.map((sc, k) => new Promise(res => setTimeout(async () => {
    try { res((await api('/api/music/search', { method: 'POST', body: { query: sc.music_query || sc.premise, genre: sc.music_genre, emotion: sc.music_emotion } })).candidates); }
    catch { res([]); }
  }, k * 300))));

  const picks = scenes.map((sc, k) => ({ tickIdx: introTicks[k]?.idx, mode: cands[k]?.length ? 'cand' : 'carry', cand: 0, upload: null }));
  const fmtDur = (s) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';

  const render = () => {
    $('#imp-body', m).innerHTML = scenes.map((sc, k) => `
      <div class="panel" style="margin-bottom:12px">
        <b style="font-size:13px">Scene ${k + 1} · ${esc(sc.location)}</b>
        <div style="font-size:11.5px;color:var(--soft);margin:2px 0 8px">${esc(sc.premise || '')}</div>
        ${k > 0 ? `<label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:7px">
          <input type="radio" name="imp-${k}" ${picks[k].mode === 'carry' ? 'checked' : ''} data-k="${k}" data-mode="carry"> ↩ carry the previous scene\'s track over
        </label>` : ''}
        ${(cands[k] || []).map((c, i) => `
          <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:6px">
            <input type="radio" name="imp-${k}" ${picks[k].mode === 'cand' && picks[k].cand === i ? 'checked' : ''} data-k="${k}" data-mode="cand" data-i="${i}">
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(c.title)}</b> <small style="color:var(--soft)">${c.aesthetics != null ? `⭐${c.aesthetics} · ` : ''}${c.upvotes != null ? `👍${c.upvotes} · ` : ''}${fmtDur(c.duration)} · ${esc(c.tags)}</small></span>
            <audio controls preload="none" src="${c.url}" style="height:28px;max-width:210px"></audio>
          </label>`).join('') || (k === 0 ? '<p style="font-size:11.5px;color:var(--soft)">no candidates found — upload your own below</p>' : '')}
        <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-top:4px">
          <input type="radio" name="imp-${k}" ${picks[k].mode === 'upload' ? 'checked' : ''} data-k="${k}" data-mode="upload">
          <span>⬆ my own track:</span>
          <input type="file" accept="audio/*" data-up="${k}" style="font-size:11px">
          ${picks[k].upload ? `<span class="tag t">${esc(picks[k].upload.title)}</span>` : ''}
        </label>
        <div style="display:flex;gap:6px;margin-top:7px">
          <input data-q="${k}" placeholder="🔍 search other music (keywords)…" style="flex:1;border:1.5px solid var(--line);border-radius:9px;padding:5px 9px;font-size:11.5px">
          <button class="btn btn-ghost small" data-qgo="${k}">Search</button>
        </div>
      </div>`).join('') + `
      <button class="btn btn-primary" id="imp-apply" style="width:100%">🎼 Apply the score</button>`;
    $$('input[type=radio]', m).forEach(r => r.onchange = () => {
      const k = +r.dataset.k; picks[k].mode = r.dataset.mode;
      if (r.dataset.mode === 'cand') picks[k].cand = +r.dataset.i;
    });
    $$('[data-qgo]', m).forEach(bq => bq.onclick = async () => {
      const k = +bq.dataset.qgo;
      const q = $(`[data-q="${k}"]`, m).value.trim(); if (!q) return;
      bq.textContent = '…';
      try {
        // BM25 keyword search over the sound captions, reordered by aesthetics (top 5)
        cands[k] = (await api('/api/music/search', { method: 'POST', body: { query: q, field: 'bm25_caption' } })).candidates;
        picks[k].mode = cands[k].length ? 'cand' : picks[k].mode; picks[k].cand = 0;
        render();
      } catch (e) { bq.textContent = 'Search'; fail(e); }
    });
    $$('input[type=file]', m).forEach(f => f.onchange = async () => {
      const k = +f.dataset.up;
      if (!f.files[0]) return;
      const fd = new FormData(); fd.append('file', f.files[0]);
      try {
        const r = await fetch('/api/music/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || 'upload failed');
        picks[k].upload = d; picks[k].mode = 'upload';
        toast(`uploaded: ${d.title} 🎵`); render();
      } catch (e) { fail(e); }
    });
    $('#imp-apply', m).onclick = async () => {
      const choices = picks.map((p, k) => {
        if (p.mode === 'carry') return { tickIdx: p.tickIdx, carry: true };
        if (p.mode === 'upload' && p.upload) return { tickIdx: p.tickIdx, music: { title: p.upload.title, url: p.upload.url } };
        const c = (cands[k] || [])[p.cand];
        return c ? { tickIdx: p.tickIdx, music: { row_id: c.row_id, title: c.title, url: c.url, query: scenes[k].music_query || '', genre: scenes[k].music_genre || '', emotion: scenes[k].music_emotion || '' } } : { tickIdx: p.tickIdx, carry: true };
      }).filter(c => c.tickIdx != null);
      try {
        await api(`/api/worlds/${worldId}/intro-music`, { method: 'POST', body: { choices } });
        toast('The opening is scored 🎼', 'gold');
        close();
      } catch (e) { fail(e); }
    };
  };
  render();
}

/* ── ✏️ INTRO-SCENE EDITOR (v2) ──────────────────────────────────────────────
   Two columns. LEFT: pick the scene\'s background (location) and each speaking
   character\'s sprite with a live composited preview; edit every script line
   (speaker/mode/emotion/text) in any of EN/DE/FR/ES with a language toggle and
   one-click auto-translate; edit the summary; re-score via manual music search.
   RIGHT: a creation-assistant chat (with mic) that sees the whole scenario and
   writes/rewrites the scene for you. Saves onto the tick, so films, replays and
   exports honour everything.                                                  */
async function introEditor(worldId) {
  S.world = worldId || S.world;
  const data = await loadWorld();
  const jp = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
  const { ticks } = await api(`/api/worlds/${S.world}/export/timeline?branchId=${encodeURIComponent(data.world.active_branch_id)}&toIdx=999999999`);
  const scenes = ticks.filter(t => jp(t.seq, null)).map(t => ({
    idx: t.idx, seq: jp(t.seq, {}), summary: t.summary || '',
    narration: jp(t.narration, []), music: jp(t.music, null),
    povId: t.pov_location_id, states: jp(t.states, []),
  }));
  if (!scenes.length) return toast('This world has no opening sequence to edit');
  const cast = data.characters;
  const castById = Object.fromEntries(cast.map(c => [c.id, c]));
  const locs = data.locations;
  const LANGS = [['en', 'EN'], ['de', 'DE'], ['fr', 'FR'], ['es', 'ES']];
  let k = 0, curLang = 'en';
  const assistHist = [];

  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:min(1180px,98vw)"><div class="modal-head violet">
    <div><b>✏️ Opening editor</b><small id="ie-sub"></small></div><span class="x">✕</span></div>
  <div class="modal-body" style="padding:0"><div class="ie-grid">
    <div class="ie-left" id="ie-left"></div>
    <div class="ie-right">
      <div style="font-size:12px;font-weight:700;color:var(--violet);padding:2px 2px 8px">✨ Scene-craft assistant</div>
      <div class="iv-log" id="ie-chat" style="flex:1"></div>
      <div class="chat-inputrow" style="padding:8px 0 0"><div class="field" id="ie-cfield" style="background:#fff;margin:0"><input id="ie-cin" placeholder="ask me to write or change the scene…"><button class="btn btn-primary small" id="ie-csend">Send</button></div></div>
    </div>
  </div></div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); $$('audio', m).forEach(a => a.pause()); };
  m.onclick = (e) => { if (e.target === m) close(); };
  $('.x', m).onclick = close;

  // sprite selection per character for the current scene (charId -> outfit name)
  const spriteSel = {};
  const lineRow = (n, i) => {
    const shown = curLang === 'en' ? (n.text || '') : (n.i18n?.[curLang] ?? '');
    return `<div class="ie-line" data-i="${i}" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:7px">
      <div style="display:flex;flex-direction:column;gap:3px;flex:none">
        <select data-spk style="border:1.5px solid var(--line);border-radius:8px;padding:4px 6px;font-size:11px;max-width:118px">
          <option value="narrator" ${n.speaker === 'narrator' ? 'selected' : ''}>✦ narrator</option>
          ${cast.map(c => `<option value="${c.id}" ${n.speaker === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <select data-mode style="border:1.5px solid var(--line);border-radius:8px;padding:3px 6px;font-size:10.5px" ${n.speaker === 'narrator' ? 'disabled' : ''}>
          <option value="speech" ${n.mode !== 'thought' ? 'selected' : ''}>speech</option>
          <option value="thought" ${n.mode === 'thought' ? 'selected' : ''}>thought</option>
        </select>
        <input data-emo value="${esc(n.emotion || '')}" placeholder="emotion" style="border:1.5px solid var(--line);border-radius:8px;padding:3px 6px;font-size:10.5px;max-width:118px">
      </div>
      <textarea data-text rows="2" placeholder="${curLang === 'en' ? '' : 'translation ('+curLang.toUpperCase()+')'}" style="flex:1;border:1.5px solid var(--line);border-radius:9px;padding:6px 9px;font-size:12.5px;font-family:inherit">${esc(shown)}</textarea>
      <div style="display:flex;flex-direction:column;gap:2px;flex:none">
        <button class="btn btn-ghost small" data-up style="padding:1px 7px">↑</button>
        <button class="btn btn-ghost small" data-dn style="padding:1px 7px">↓</button>
        <button class="btn btn-ghost small" data-del style="padding:1px 7px;color:#d92e66">✕</button>
      </div>
    </div>`;
  };

  // pull the edited rows back into scenes[k].narration, preserving other languages
  const commit = () => {
    const rows = $$('.ie-line', m);
    scenes[k].narration = rows.map(row => {
      const idx = +row.dataset.i;
      const prev = scenes[k].narration[idx] || { text: '', i18n: {} };
      const val = $('[data-text]', row).value.trim();
      const speaker = $('[data-spk]', row).value;
      const line = {
        speaker,
        mode: $('[data-mode]', row).value,
        emotion: $('[data-emo]', row).value,
        text: prev.text || '',
        i18n: { ...(prev.i18n || {}) },
      };
      if (curLang === 'en') line.text = val;
      else { line.i18n[curLang] = val; if (!line.text) line.text = val; }
      return line;
    }).filter(n => n.text || Object.values(n.i18n).some(Boolean));
    // re-index for stable row mapping after reorder/delete
    scenes[k].narration.forEach((n, i) => n._i = i);
  };

  const spriteOptions = (c, sel) => (c.state.outfits || []).map(o => `<option value="${esc(o.name)}" ${o.name === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('');

  let musicPick = null, musicCands = null;
  const render = () => {
    const sc = scenes[k];
    sc.narration.forEach((n, i) => n._i = i);
    musicPick = null; musicCands = null;
    const loc = locs.find(l => l.id === sc.povId) || locs[0];
    // speakers in this scene get sprite pickers; default sprite = tick state\'s outfit
    const speakers = [...new Set(sc.narration.map(n => n.speaker).filter(s => s && s !== 'narrator'))].map(id => castById[id]).filter(Boolean);
    for (const c of speakers) if (!(c.id in spriteSel)) spriteSel[c.id] = (sc.states.find(s => s.character_id === c.id)?.outfit) || (c.state.outfits?.[0]?.name);
    $('#ie-sub', m).textContent = `${data.world.title} · scene ${k + 1} of ${scenes.length}`;

    $('#ie-left', m).innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <button class="btn btn-soft small" id="ie-prev" ${k === 0 ? 'disabled' : ''}>←</button>
        <div class="strength" style="flex:1"><div style="width:${Math.round(((k + 1) / scenes.length) * 100)}%"></div></div>
        <button class="btn btn-soft small" id="ie-next" ${k === scenes.length - 1 ? 'disabled' : ''}>→</button>
        <div style="display:flex;gap:3px">${LANGS.map(([lg, lb]) => `<button class="tchip ${lg === curLang ? 'sel' : ''}" data-lang="${lg}" style="padding:4px 8px;font-size:11px">${lb}</button>`).join('')}</div>
      </div>

      <div class="ie-preview" id="ie-preview"></div>

      <div style="display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0">
        <label style="font-size:11px;font-weight:700;color:var(--soft)">🖼 BACKGROUND (location)
          <select id="ie-bg" style="display:block;width:100%;border:1.5px solid var(--line);border-radius:9px;padding:6px 9px;font-size:12px;margin-top:3px">
            ${locs.map(l => `<option value="${l.id}" ${l.id === sc.povId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
        </label>
        ${speakers.length ? `<div><div style="font-size:11px;font-weight:700;color:var(--soft);margin-bottom:4px">🎭 SPRITES</div>${speakers.map(c => `
          <label style="display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:4px"><b style="flex:none;min-width:70px">${esc(c.name)}</b>
            <select data-sprite="${c.id}" style="flex:1;border:1.5px solid var(--line);border-radius:8px;padding:4px 7px;font-size:11.5px">${spriteOptions(c, spriteSel[c.id])}</select></label>`).join('')}</div>` : ''}
      </div>

      <label style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--soft)">SCENE SUMMARY</label>
      <textarea id="ie-summary" rows="2" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12px;margin:4px 0 12px">${esc(sc.summary)}</textarea>

      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--soft)">SCRIPT ${curLang !== 'en' ? '· ' + curLang.toUpperCase() : ''}</label>
        <span style="flex:1"></span>
        <button class="btn btn-ghost small" id="ie-translate" title="Auto-translate all scenes to DE/FR/ES">🌐 Auto-translate</button>
      </div>
      <div id="ie-lines" style="margin-top:6px">${sc.narration.map(lineRow).join('')}</div>
      <button class="btn btn-ghost small" id="ie-add">＋ add line</button>

      <div style="margin-top:14px;border-top:1px dashed var(--line);padding-top:10px">
        <label style="font-size:11px;font-weight:700;color:var(--soft)">SCENE MUSIC ${sc.music ? `· <b>${esc(sc.music.title)}</b>` : '· none'}</label>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input id="ie-mq" placeholder="🔍 search music…" style="flex:1;border:1.5px solid var(--line);border-radius:9px;padding:6px 10px;font-size:12px">
          <button class="btn btn-soft small" id="ie-mgo">Search</button>
        </div>
        <div id="ie-mres" style="margin-top:7px"></div>
      </div>
      <button class="btn btn-primary" id="ie-save" style="width:100%;margin-top:14px">💾 Save scene ${k + 1}</button>`;

    drawPreview();
    // language toggle
    $$('[data-lang]', m).forEach(el => el.onclick = () => { commit(); curLang = el.dataset.lang; render(); });
    $('#ie-prev', m).onclick = () => { commit(); if (k > 0) { k--; Object.keys(spriteSel).forEach(x => delete spriteSel[x]); render(); } };
    $('#ie-next', m).onclick = () => { commit(); if (k < scenes.length - 1) { k++; Object.keys(spriteSel).forEach(x => delete spriteSel[x]); render(); } };
    $('#ie-bg', m).onchange = () => { sc.povId = $('#ie-bg', m).value; drawPreview(); };
    $$('[data-sprite]', m).forEach(sel => sel.onchange = () => { spriteSel[sel.dataset.sprite] = sel.value; drawPreview(); });
    wireRows();
    $('#ie-add', m).onclick = () => { commit(); scenes[k].narration.push({ speaker: 'narrator', text: '', emotion: '', mode: 'speech', i18n: {} }); render(); };
    $('#ie-translate', m).onclick = async (e) => {
      const btn = e.target; if (btn.disabled) return; btn.disabled = true; btn.textContent = '🌐 translating…';
      try { const r = await api(`/api/worlds/${S.world}/translate-intro`, { method: 'POST', body: { langs: ['de', 'fr', 'es'] } });
        toast(`Translated ${r.scenes} scenes → ${r.langs.map(l => l.toUpperCase()).join(', ')} 🌐`, 'gold');
        // reload scene texts with the new i18n
        const fresh = (await api(`/api/worlds/${S.world}/export/timeline?branchId=${encodeURIComponent(data.world.active_branch_id)}&toIdx=999999999`)).ticks;
        scenes.forEach(s => { const ft = fresh.find(t => t.idx === s.idx); if (ft) s.narration = jp(ft.narration, []); });
        render();
      } catch (e2) { fail(e2); btn.disabled = false; btn.textContent = '🌐 Auto-translate'; }
    };
    $('#ie-mgo', m).onclick = musicSearch;
    $('#ie-mq', m).onkeydown = (e) => { if (e.key === 'Enter') musicSearch(); };
    $('#ie-save', m).onclick = saveScene;
  };

  const wireRows = () => $$('.ie-line', m).forEach(row => {
    $('[data-spk]', row).onchange = () => { $('[data-mode]', row).disabled = $('[data-spk]', row).value === 'narrator'; };
    $('[data-del]', row).onclick = () => { commit(); scenes[k].narration.splice(+row.dataset.i, 1); render(); };
    $('[data-up]', row).onclick = () => { commit(); const i = +row.dataset.i; if (i > 0) { const a = scenes[k].narration; [a[i - 1], a[i]] = [a[i], a[i - 1]]; render(); } };
    $('[data-dn]', row).onclick = () => { commit(); const i = +row.dataset.i; const a = scenes[k].narration; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; render(); } };
  });

  const drawPreview = () => {
    const box = $('#ie-preview', m); if (!box) return;
    const sc = scenes[k];
    const loc = locs.find(l => l.id === sc.povId);
    const speakers = [...new Set(sc.narration.map(n => n.speaker).filter(s => s && s !== 'narrator'))].map(id => castById[id]).filter(Boolean);
    box.style.backgroundImage = loc?.background_asset_id ? `url(${assetUrl(loc.background_asset_id)}?w=640)` : '';
    box.innerHTML = speakers.map((c, i) => {
      const o = (c.state.outfits || []).find(x => x.name === spriteSel[c.id]) || (c.state.outfits || [])[0];
      const n = speakers.length, x = n === 1 ? 50 : 18 + (64 / Math.max(n - 1, 1)) * i;
      return o ? `<img src="${assetUrl(o.cutout_asset_id)}?w=320" style="position:absolute;bottom:0;left:${x}%;transform:translateX(-50%);height:92%">` : '';
    }).join('') + `<span class="ie-prevloc">${esc(loc?.name || '')}</span>`;
  };

  const musicSearch = async () => {
    const q = $('#ie-mq', m).value.trim(); if (!q) return;
    $('#ie-mres', m).innerHTML = '<div class="empty-hint" style="padding:8px"><span class="spinner dark"></span></div>';
    try {
      const { candidates } = await api('/api/music/search', { method: 'POST', body: { query: q, field: 'bm25_caption' } });
      musicCands = candidates;
      $('#ie-mres', m).innerHTML = candidates.map((c, i) => `
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:5px">
          <input type="radio" name="ie-mc" data-mi="${i}">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(c.title)}</b> <small style="color:var(--soft)">${c.aesthetics != null ? `⭐${c.aesthetics}` : ''}</small></span>
          <audio controls preload="none" src="${c.url}" style="height:26px;max-width:170px"></audio></label>`).join('') || '<p style="font-size:11.5px;color:var(--soft)">nothing found</p>';
      $$('input[name=ie-mc]', m).forEach(r => r.onchange = () => { musicPick = candidates[+r.dataset.mi]; });
      const prevs = $$('#ie-mres audio', m);
      prevs.forEach(a => { a.onplay = () => { prevs.forEach(o => { if (o !== a) o.pause(); }); duckMusic(); }; a.onpause = a.onended = () => { if (!prevs.some(o => !o.paused)) unduckMusic(); }; });
    } catch (e) { fail(e); $('#ie-mres', m).innerHTML = ''; }
  };

  const saveScene = async (e) => {
    commit();
    const btn = e.target; btn.disabled = true; btn.textContent = '💾 saving…';
    const sc = scenes[k];
    try {
      const body = { tickIdx: sc.idx, narration: sc.narration, summary: $('#ie-summary', m).value, pov_location_id: sc.povId, sprites: spriteSel };
      if (musicPick) { body.music = musicPick; body.candidates = musicCands; }
      await api(`/api/worlds/${S.world}/intro-scene`, { method: 'PATCH', body });
      if (musicPick) sc.music = musicPick;
      // keep local state snapshot outfits in sync so the preview + re-open reflect saves
      for (const [cid, outfit] of Object.entries(spriteSel)) { const s = sc.states.find(x => x.character_id === cid); if (s) s.outfit = outfit; }
      toast(`Scene ${k + 1} saved ✏️`, 'gold');
      btn.disabled = false; btn.textContent = `💾 Save scene ${k + 1}`;
    } catch (e2) { btn.disabled = false; btn.textContent = `💾 Save scene ${k + 1}`; fail(e2); }
  };

  // ── assistant chat (right) ──
  const chat = $('#ie-chat', m);
  const addChat = (cls, text) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; };
  addChat('assistant', 'Tell me how you want the scene to go — “make Sam angrier”, “add a line where Jessie jokes”, “move this to the rooftop” — and I\'ll rewrite it. Review it on the left, then Save.');
  attachMic($('#ie-cfield', m), $('#ie-cin', m));
  let busy = false;
  const sendChat = async () => {
    const text = $('#ie-cin', m).value.trim(); if (!text || busy) return;
    busy = true; $('#ie-cin', m).value = ''; addChat('user', text);
    assistHist.push({ role: 'user', content: text });
    const status = addChat('status', '✨ writing…');
    try {
      commit();
      const r = await api(`/api/worlds/${S.world}/intro-assist`, { method: 'POST', body: { tickIdx: scenes[k].idx, message: text, narration: scenes[k].narration, history: assistHist, lang: curLang } });
      status.remove(); addChat('assistant', r.reply);
      assistHist.push({ role: 'assistant', content: r.reply });
      if (r.narration) {
        // assistant wrote text in curLang; store into the right field, keep other langs
        scenes[k].narration = r.narration.map(n => curLang === 'en' ? { ...n, i18n: {} } : { speaker: n.speaker, mode: n.mode, emotion: n.emotion, text: n.text, i18n: { [curLang]: n.text } });
        toast('Scene rewritten — review & Save', 'gold');
      }
      if (r.locationId) scenes[k].povId = r.locationId;
      if (r.narration || r.locationId) render();
    } catch (e) { status.remove(); addChat('assistant', '😔 ' + e.message); }
    busy = false;
  };
  $('#ie-csend', m).onclick = sendChat;
  $('#ie-cin', m).onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };

  render();
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
    <div style="margin-top:14px;border-top:1px dashed var(--line);padding-top:10px">
      <label style="font-size:12px;font-weight:600">🖼 World preview image (home card)</label>
      <input id="wd-cover" placeholder="key-art prompt… leave empty for an automatic one" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12px;margin-top:5px">
      <button class="btn btn-teal small" id="wd-genc" style="margin-top:7px">🖼 ${world.cover_asset_id ? 'Regenerate' : 'Generate'} cover (~20s)</button>
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
  $('#wd-genc', m).onclick = async (e) => {
    const btn = e.target; if (btn.disabled) return;
    btn.disabled = true; btn.textContent = '🎨 painting…';
    try {
      await api(`/api/worlds/${S.world}/cover`, { method: 'POST', body: { prompt: $('#wd-cover', m).value || undefined } });
      toast('🖼 New cover ready — see the home screen', 'gold');
      S.worldData = null; refreshMe();
      btn.disabled = false; btn.textContent = '🖼 Regenerate cover (~20s)';
    } catch (e2) { btn.disabled = false; btn.textContent = '🖼 Generate cover (~20s)'; fail(e2); }
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
  const who = (lid) => characters.filter(c => c.state.location_id === lid && (c.intro_tick_idx || 0) <= world.tick_index);
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
  // RPG: the stage IS the player character's experience — the point of view is locked to them.
  const pcLocked = world.player_character_id && characters.find(c => c.id === world.player_character_id) ? world.player_character_id : null;
  if (pcLocked) stageState.pov = { type: 'character', id: pcLocked };
  else if (!stageState.pov || (stageState.pov.type === 'character' && !characters.find(c => c.id === stageState.pov.id)))
    stageState.pov = { type: 'character', id: characters[0]?.id };

  stageState.delta = stageState.delta || '+1m';
  const povChar = stageState.pov.type === 'character' ? characters.find(c => c.id === stageState.pov.id) : null;
  const locId = stageState.pov.type === 'location' ? stageState.pov.id : povChar?.state.location_id;
  const loc = locations.find(l => l.id === locId) || locations[0];
  // not-yet-introduced characters (rewound below their intro tick) don't exist in this era
  const present = characters.filter(c => c.state.location_id === loc?.id && (c.intro_tick_idx || 0) <= world.tick_index);
  const scene = buildScene(lastTick, loc, present, povChar);

  const dec = (pcLocked && lastTick?.decision && lastTick.idx === world.tick_index) ? lastTick.decision : null;
  document.body.classList.toggle('rpg', !!pcLocked);   // CSS scope: stage-root closes before the control strip
  app.innerHTML = `
  <div id="stage-root" class="${pcLocked ? 'rpg' : ''}">
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
    <button class="glasschip" id="music-chip" title="Scene music — preview the suggested tracks, pick another, or mute">🎶</button>
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
  <div class="stage-bottom${(localStorage.getItem('viv_panel') ?? (innerWidth <= 760 ? 'collapsed' : 'open')) === 'collapsed' ? ' collapsed' : ''}" id="stage-bottom">
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
    ${pcLocked ? `
    <!-- RPG action bar: the player speaks/acts as their character; the storyteller paces time -->
    ${dec ? `<div class="decision-card" id="decision-card"><span class="dc-ico">🎭</span><span>${esc(dec)}</span></div>` : ''}
    <div class="action-bar" id="action-bar">
      <div class="field action-field" id="act-field" style="flex:1;margin:0"><input id="act-in" placeholder="${dec ? 'What do you do?' : `What do you do, ${esc(characters.find(c => c.id === pcLocked)?.name || 'hero')}? (act, speak — or ask to skip ahead)`}"></div>
      <button class="tchip" id="act-skip" title="Skip a longer stretch of time (plays as scenes)">⏱</button>
      <button class="btn btn-primary small" id="act-go">▶ ${t('continue', 'Continue')}</button>
    </div>` : ''}
  </div>
  <nav id="dock">${['home', 'cast', 'bonds', 'world', 'play', 'share'].map(k => `
    <button class="dock-btn ${k === 'play' ? 'active' : ''}" data-nav="${k}">${ICONS[k]}<span>${dockLabel(k)}</span></button>`).join('')}</nav>`;
  bindChrome();
  // "From the beginning"/replay pending: cover the stage instantly so the current scene
  // never flashes before the film's first transition card takes over.
  if (S.replay && !$('#cine-blackout')) {
    const bl = document.createElement('div');
    bl.id = 'cine-blackout';
    bl.style.cssText = 'position:fixed;inset:0;background:#0d0b1e;z-index:88;transition:opacity .6s';
    document.body.appendChild(bl);
  }
  initFactBubble();
  // Score for the CURRENT scene: the viewed location's remembered track wins (each place
  // keeps its own music — switching between locations with different tracks crossfades),
  // otherwise the world's current track. Lazy: only this ONE track is ever loaded.
  if (!S.replay) {   // a pending film scores itself — don't blip the scene track first
    try {
      const lm = loc?.music && JSON.parse(loc.music);
      const cm = world.current_music && JSON.parse(world.current_music);
      if (lm || cm) playMusic(lm || cm);
    } catch {}
  }
  // 📖 collapse/expand — wired BEFORE the film handoff so the storybook text can be
  // maximized/minimized DURING intro/time-skip sequences too. Preference persists.
  const sb = $('#stage-bottom');
  $('#panel-toggle').onclick = () => {
    sb.classList.toggle('collapsed');
    localStorage.setItem('viv_panel', sb.classList.contains('collapsed') ? 'collapsed' : 'open');
  };
  // Timeline handoff: a ▶ Replay click stashes the target; play it now that the stage exists.
  if (S.replay) {
    const r = S.replay; S.replay = null;
    if (r.intro) { playIntroSequence(); return; }   // "From the beginning" on the world card
    playReplay(r.branchId, r.idx, r.endIdx ?? null);
    return;
  }
  stageState.delta = stageState.delta || '+1m';
  $('#customdelta').onclick = () => customDeltaModal((d) => {
    stageState.delta = d;
    $$('[data-delta]').forEach(x => x.classList.remove('sel'));
    const cb = $('#customdelta'); cb.classList.add('sel'); cb.innerHTML = `⏱ ${d.slice(1)}`;
  });

  $$('[data-pov]').forEach(f => f.onclick = () => { if (pcLocked) { mindModal(f.dataset.pov); return; } stopNarration(); stageState.pov = { type: 'character', id: f.dataset.pov }; stageScreen(); });
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
  if (pcLocked) {
    const actField = $('#act-field'), actIn = $('#act-in');
    if (actField && actIn) {
      attachMic(actField, actIn);
      const go = () => {
        const text = actIn.value.trim();
        stopNarration();
        advanceTick(text ? { kind: 'player_action', target: pcLocked, text } : null, { delta: 'auto' });
      };
      $('#act-go').onclick = go;
      actIn.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
      $('#act-skip').onclick = () => customDeltaModal((d) => { stopNarration(); advanceTick(actIn.value.trim() ? { kind: 'player_action', target: pcLocked, text: actIn.value.trim() } : null, { delta: d }); });
    }
  }
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

  // Prompt shown when the player advances from a rewound position where later-joining
  // characters don't exist yet. Three ways forward + cancel. (See /fork-clean & /strip-future-chars.)
  function branchFromPastModal(future, intervention) {
    const w = S.worldData.world;
    const names = future.map(c => c.name).join(', ');
    const m = document.createElement('div');
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" style="width:min(620px,96vw)"><div class="modal-head violet">
      <div><b>🌿 Branch from scene ${w.tick_index}</b><small>an alternative direction from here</small></div><span class="x">✕</span></div>
    <div class="modal-body" style="padding:20px 22px 22px">
      <p style="font-size:13.5px;line-height:1.55;margin:0 0 4px">You've rewound to <b>scene ${w.tick_index}</b>, before <b>${esc(names)}</b> joined the story. Advancing here starts an <b>alternative branch</b>. How should ${future.length === 1 ? 'this character' : 'these characters'} be handled?</p>
      <div class="bp-opts">
        <button class="bp-opt bp-primary" id="bp-copy">
          <span class="bp-t">🌱 Continue in a clean copy <span class="bp-rec">Recommended</span></span>
          <span class="bp-d">Duplicate the world, keep only the story up to scene ${w.tick_index}, and leave ${future.length === 1 ? 'them' : 'them'} out. Your original timeline stays completely untouched.</span>
        </button>
        <button class="bp-opt" id="bp-strip">
          <span class="bp-t">✂️ Remove them &amp; branch here</span>
          <span class="bp-d">Delete ${esc(names)} from <i>this</i> world and branch from here. Their later scenes on other timelines are lost.</span>
        </button>
        <button class="bp-opt" id="bp-keep">
          <span class="bp-t">▶ Branch here, keep everyone</span>
          <span class="bp-d">They stay in the cast but won't act or appear until the story reaches their scene again.</span>
        </button>
      </div>
    </div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.onclick = (e) => { if (e.target === m) close(); };
    $('.x', m).onclick = close;
    $('#bp-copy', m).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.querySelector('.bp-t').textContent = '🌱 Copying…';
      try {
        const r = await api(`/api/worlds/${S.world}/fork-clean`, { method: 'POST', body: { tickIdx: w.tick_index } });
        close(); toast('🌱 Clean copy created — exploring it now', 'gold');
        S.world = r.worldId; S.worldData = null; nav(`#/stage?w=${r.worldId}`);
      } catch (e2) { b.disabled = false; fail(e2); }
    };
    $('#bp-strip', m).onclick = async () => {
      if (!confirm(`Delete ${names} from this world? Their scenes on other timelines will be lost. This cannot be undone.`)) return;
      try {
        const r = await api(`/api/worlds/${S.world}/strip-future-chars`, { method: 'POST', body: { tickIdx: w.tick_index } });
        close(); toast(`Removed ${r.removed.join(', ')} — branching…`);
        S.worldData = null; await loadWorld();
        advanceTick(intervention, { force: true });
      } catch (e2) { fail(e2); }
    };
    $('#bp-keep', m).onclick = () => { close(); advanceTick(intervention, { force: true }); };
  }

  async function advanceTick(intervention, opts = {}) {
    // Branching from a PAST tick: if we're positioned before some character joined the story,
    // advancing here spins off an alternative branch that should not contain them. Ask the
    // player how to handle it (clean copy / strip them / keep everyone) before generating.
    const _w = S.worldData?.world;
    const _future = (S.worldData?.characters || []).filter(c => (c.intro_tick_idx || 0) > (_w?.tick_index ?? 0));
    if (!opts.force && _future.length) { branchFromPastModal(_future, intervention); return; }
    $('#veil').innerHTML = `<div class="thinking-veil"><div class="pageturn"></div><div>the world is thinking…</div></div>`;
    $('#advance').disabled = true;
    let cinema = null;   // declared out here so the catch can release a stuck film on stream errors
    stageState.castSugs = [];   // GM cast suggestions arriving with this advance (shown at the end)
    try {
      stageState.advanceAbort?.abort();               // cancel any earlier in-flight advance
      const ctrl = new AbortController(); stageState.advanceAbort = ctrl;
      const res = await fetch(`/api/worlds/${S.world}/ticks`, {
        method: 'POST', credentials: 'same-origin', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
        // lang = the 🌐 preference: the Game Master writes this tick's story in that language.
        // chapter = the player's time-skip settings (animate on/off + detail level) — for
        // large skips the server may answer with SEVERAL scene-ticks instead of one.
        body: JSON.stringify({ timeDelta: opts.delta || (rpgPC() ? 'auto' : stageState.delta), intervention, perspective: stageState.pov, lang: getLang(), chapter: skipPrefs() }),
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
            if (data.music) playMusic(data.music);        // vibe changed → crossfade to the new track
            if (cinema) {
              cinema.scenes.push(data);
              if (cinema.scenes.length === 1) playCinema(cinema); // roll film on the first scene — rest streams in behind
            }
          }
          if (ev === 'chapter_trimmed') toast(`The time-skip was cut short after ${data.got} of ${data.planned} scenes (a later scene failed to generate) — the ${data.got} that landed are saved.`, 'err');
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
      $('#veil').innerHTML = ''; const adv = $('#advance'); if (adv) adv.disabled = false;
      if (e.name === 'AbortError') return;                   // we cancelled it on purpose (nav / new advance)
      if (e.code === 'TICK_IN_PROGRESS') toast('A scene is still generating — give it a moment, then try again. (Reloading also cancels a stuck one.)', 'err');
      else fail(e);
    }
  }
}
// Build the story-box scene for the CURRENTLY-VIEWED location.
// If the latest tick's narration was written for this location, show that rich prose;
// otherwise synthesise a location-accurate snapshot from who is actually present here.
function buildScene(lastTick, loc, present, povChar) {
  if (!lastTick) return { lines: [], meta: 'the book is open', live: false };
  if (lastTick.pov_location_id === loc?.id && (lastTick.narration || []).length)
    // localize: authored/intro ticks carry per-line translations — the storybook must show
    // (and read aloud) the current language, same as the film renderer does.
    return { lines: localizeNarr(lastTick.narration), meta: `tick ${lastTick.idx} · ${lastTick.mood_tag || ''} · ${lastTick.time_delta}`, live: true };
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
// Intro/authored scenes may carry per-line translations (line.i18n = {de,fr,es}); when the
// player has switched language, swap in the translated text for display AND for TTS. Live
// ticks are already generated in-language and have no i18n, so this is a no-op for them.
function localizeNarr(narration) {
  const lang = getLang();
  let lines = narration || [];
  // RPG without 🔮 inner sight: other characters' PRIVATE THOUGHTS are not the player's to
  // read (or hear) — only their own character's inner monologue shows. Filtering here covers
  // every consumer at once: storybook, voiceover, films and replays.
  const pc = rpgPC();
  if (pc && !adminOn()) lines = lines.filter(n => !(n.mode === 'thought' && n.speaker !== pc));
  if (lang === 'en') return lines;
  return lines.map(n => (n.i18n && n.i18n[lang]) ? { ...n, text: n.i18n[lang] } : n);
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

/* ── 🎵 BACKGROUND MUSIC ─────────────────────────────────────────────────────
   One looping track per world, chosen by the GM's music tool when a scene's
   vibe changes (tick payload .music / worlds.current_music). Streamed lazily —
   exactly ONE track is ever loaded; a change fades the old one out (1.2s) and
   the new one in (1.5s). The loop itself breathes: the last ~2s fade out, then
   the track restarts with a fade-in (no hard seam). Volume rides WELL below
   the voices (default 35%) — both the on/off switch and the music-vs-voice
   balance live in Account → Voice. Replays/scene changes at the same vibe
   just keep the loop running.                                               */
const music = { audio: null, url: null, meta: null, fade: null };
function musicPrefs() { const p = ttsPrefs(); return { on: p.musicOn !== false, vol: Math.max(0, Math.min(1, p.musicVol ?? 0.10)) }; }
// voice playback preferences: separate volume + a pitch-preserving speed (50-150%)
function voicePrefs() { const p = ttsPrefs(); return { vol: Math.max(0, Math.min(1, p.voiceVol ?? 1)), rate: Math.max(0.5, Math.min(1.5, p.voiceRate ?? 1.15)) }; }
function musicFade(a, to, ms, done) {
  // PER-ELEMENT fade timer. A single global handle raced: the outgoing track's async
  // fade-in (play().then) cleared the crossfade interval of the INCOMING switch, so the
  // fade's completion callback — which starts the next track — never fired.
  clearInterval(a._fade);
  const from = a.volume, steps = Math.max(1, Math.round(ms / 50));
  let k = 0;
  a._fade = setInterval(() => {
    k++;
    a.volume = Math.max(0, Math.min(1, from + (to - from) * (k / steps)));
    if (k >= steps) { clearInterval(a._fade); done?.(); }
  }, 50);
}
function playMusic(meta) {
  const { on, vol } = musicPrefs();
  music.meta = meta || music.meta;
  if (!on || !music.meta?.url) return;
  const url = music.meta.url;
  if (music.url === url && music.audio) return;          // same track — keep looping untouched
  // generation token: on mobile, background-tab throttling can delay a crossfade's begin()
  // past the NEXT track change — a stale begin must never resurrect the wrong music.
  const gen = music.gen = (music.gen || 0) + 1;
  const begin = () => {
    if (gen !== music.gen) return;                       // superseded while fading — stay silent
    const a = new Audio(url);                            // streamed, not decoded — light on slow connections
    a.preload = 'auto'; a.volume = 0;
    music.audio = a; music.url = url;
    a.play().then(() => musicFade(a, musicPrefs().vol, 1500)).catch(() => { /* autoplay gate — retried on next gesture */ });
    // breathing loop: fade the tail, restart with a fade-in
    a.ontimeupdate = () => {
      if (a.duration && a.duration - a.currentTime < 2.2 && !a._tail) { a._tail = true; musicFade(a, 0, 1800); }
    };
    a.onended = () => { a._tail = false; a.currentTime = 0; a.volume = 0; a.play().then(() => musicFade(a, musicPrefs().vol, 1500)).catch(() => {}); };
  };
  if (music.audio) { const old = music.audio; music.audio = null; musicFade(old, 0, 1200, () => { old.pause(); old.src = ''; begin(); }); }
  else begin();
}
function stopMusic() {
  music.meta = null; music.url = null;
  if (music.audio) { const old = music.audio; music.audio = null; musicFade(old, 0, 800, () => { old.pause(); old.src = ''; }); }
}
function setMusicVolume(v) {
  if (!music.audio || music.audio._tail) return;
  clearInterval(music.audio._fade);                      // a running fade-in targets the OLD volume
  music.audio.volume = Math.max(0, Math.min(1, v));      // → apply instantly (mobile slider fix)
}
// Preview ducking: while a candidate preview plays, the background score fades out and
// pauses; when previews stop, it resumes with a smooth fade-in.
function duckMusic() {
  if (music.audio && !music.audio.paused) { music._ducked = true; musicFade(music.audio, 0, 600, () => music.audio?.pause()); }
}
function unduckMusic() {
  if (music._ducked && music.audio && !music._muted) {
    music._ducked = false;
    music.audio.play().then(() => musicFade(music.audio, musicPrefs().vol, 1000)).catch(() => {});
  }
}
// Mute toggle (the 🎶 widget's stop button): keeps the track + position, just silences it.
function toggleMuteMusic() {
  if (!music.audio) return false;
  if (music._muted) { music._muted = false; music.audio.play().then(() => musicFade(music.audio, musicPrefs().vol, 900)).catch(() => {}); }
  else { music._muted = true; musicFade(music.audio, 0, 600, () => music.audio?.pause()); }
  return music._muted;
}

/* ── 🎶 MUSIC WIDGET ─────────────────────────────────────────────────────────
   Expands from the 🎶 chip: shows the currently playing track with a mute
   toggle, plus the top suggested candidates (stored with the track, or fetched
   live via the stored search query) as inline preview players — playing a
   preview fades the background score out and pauses it; when previews stop it
   resumes with a smooth fade-in. "Use this" persists the choice (world +
   scene location + the tick that carries the score, so replays honour it).  */
async function musicWidget() {
  const existing = $('#music-panel');
  if (existing) { existing.remove(); return; }             // toggle
  const meta = music.meta;
  const panel = document.createElement('div');
  panel.id = 'music-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <b style="font-size:13px">🎶 ${meta ? esc(meta.title) : 'No music in this scene yet'}</b>
      <span style="flex:1"></span>
      ${music.audio ? `<button class="btn btn-soft small" id="mw-mute">${music._muted ? '🔊 Resume' : '🔇 Mute'}</button>` : ''}
      <button class="btn btn-ghost small" id="mw-close">✕</button>
    </div>
    ${meta?.query ? `<div style="font-size:10.5px;color:var(--soft);margin-top:2px">chosen for: ${esc(meta.query)}</div>` : ''}
    <div id="mw-cands" style="margin-top:10px"><div class="empty-hint" style="padding:12px"><span class="spinner dark"></span> fetching suggestions…</div></div>`;
  document.body.appendChild(panel);
  $('#mw-close', panel).onclick = () => panel.remove();
  const muteBtn = $('#mw-mute', panel);
  if (muteBtn) muteBtn.onclick = () => { const m = toggleMuteMusic(); muteBtn.textContent = m ? '🔊 Resume' : '🔇 Mute'; };

  // candidates: stored with the track, else a live re-search via the stored query
  let cands = meta?.candidates || [];
  const box = $('#mw-cands', panel);
  if (!box) return;

  const renderCands = (label) => {
    if (!cands.length) { box.innerHTML = '<p style="font-size:11.5px;color:var(--soft)">Nothing found — try other words in the search box.</p>'; return; }
    box.innerHTML = `<div style="font-size:10px;letter-spacing:.08em;color:var(--violet);font-weight:700;margin-bottom:6px">${label}</div>` +
      cands.map((c, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">
            ${meta && c.url === meta.url ? '▸ ' : ''}<b>${esc(c.title)}</b> <small style="color:var(--soft)">${c.aesthetics != null ? `⭐${c.aesthetics} · ` : ''}${c.upvotes != null ? `👍${c.upvotes} · ` : ''}${esc(c.tags || '')}</small></span>
          <audio controls preload="none" src="${c.url}" style="height:26px;max-width:190px"></audio>
          ${meta && c.url === meta.url ? '<span class="tag t">current</span>' : `<button class="btn btn-teal small" data-use="${i}" style="padding:4px 10px">✓ use</button>`}
        </div>`).join('');
    // preview ducking: background score fades out while a preview plays, resumes after
    const previews = $$('audio', box);
    previews.forEach(a => {
      a.onplay = () => { previews.forEach(o => { if (o !== a) o.pause(); }); duckMusic(); };
      a.onpause = () => { if (!previews.some(o => !o.paused)) unduckMusic(); };
      a.onended = () => { if (!previews.some(o => !o.paused)) unduckMusic(); };
    });
    $$('[data-use]', box).forEach(btn => btn.onclick = async () => {
      const c = cands[+btn.dataset.use];
      btn.disabled = true; btn.textContent = '…';
      try {
        previews.forEach(o => o.pause());
        const locId = (() => { try { const pov = stageState.pov; const chars = S.worldData?.characters || []; return pov.type === 'location' ? pov.id : chars.find(x => x.id === pov.id)?.state.location_id; } catch { return null; } })();
        const { music: saved } = await api(`/api/worlds/${S.world}/music-choice`, { method: 'POST', body: { music: c, candidates: cands, locationId: locId } });
        music._muted = false; music._ducked = false;
        music.url = null;                                    // force the crossfade to the new pick
        playMusic(saved);
        toast(`🎶 now scoring: ${c.title}`, 'gold');
        panel.remove();
      } catch (e) { btn.disabled = false; btn.textContent = '✓ use'; fail(e); }
    });
  };

  // 🔍 free search: BM25 over the sound captions, reordered by aesthetics (top 5 of 10)
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin:2px 0 8px';
  bar.innerHTML = `<input id="mw-q" placeholder="search music… e.g. dark techno, warm piano" style="flex:1;border:1.5px solid var(--line);border-radius:9px;padding:6px 10px;font-size:12px"><button class="btn btn-soft small" id="mw-go">🔍</button>`;
  box.before(bar);
  const doSearch = async () => {
    const q = $('#mw-q', panel).value.trim(); if (!q) return;
    box.innerHTML = '<div class="empty-hint" style="padding:10px"><span class="spinner dark"></span></div>';
    try { cands = (await api('/api/music/search', { method: 'POST', body: { query: q, field: 'bm25_caption' } })).candidates; renderCands('SEARCH RESULTS — BEST AESTHETICS FIRST'); }
    catch (e) { fail(e); renderCands('SUGGESTED TRACKS'); }
  };
  $('#mw-go', panel).onclick = doSearch;
  $('#mw-q', panel).onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

  if (!cands.length && meta?.query) {
    try { cands = (await api('/api/music/search', { method: 'POST', body: { query: meta.query, genre: meta.genre, emotion: meta.emotion } })).candidates; } catch {}
  }
  renderCands('SUGGESTED TRACKS — PREVIEW & PICK');
}

/* ── WebAudio clip engine ────────────────────────────────────────────────────
   Sequential narration chunks used to play through fresh HTMLAudio elements —
   even with server-side tail fades baked into every file, element/decoder
   churn at each boundary produced a tiny audible click. Chunks now play as
   decoded AudioBuffers through ONE shared AudioContext, wrapped in explicit
   12 ms gain ramps at both ends: boundary clicks are impossible by
   construction. decoded buffers are cached (sliding window) and the player
   pre-decodes the next chunk while the current one plays, so transitions
   stay seamless even on slow connections.                                   */
const WA = { ctx: null, cache: new Map() };
function waCtx() {
  if (!WA.ctx) WA.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (WA.ctx.state === 'suspended') WA.ctx.resume().catch(() => {});
  return WA.ctx;
}
function loadClip(assetId) {
  if (!WA.cache.has(assetId)) {
    WA.cache.set(assetId, fetch(assetUrl(assetId), { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('audio fetch ' + r.status); return r.arrayBuffer(); })
      .then(b => waCtx().decodeAudioData(b))
      .catch(e => { WA.cache.delete(assetId); throw e; }));
    if (WA.cache.size > 48) WA.cache.delete(WA.cache.keys().next().value);   // sliding cache
  }
  return WA.cache.get(assetId);
}
// Play one decoded buffer with anti-click ramps. Handle mimics the old HTMLAudio
// surface (pause/play for the ⏸ button, stop for ⏹) so callers stay unchanged.
function playClip(buf, onended, { earlySec = 0, onEarly = null } = {}) {
  const ctx = waCtx();
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain();
  const t0 = ctx.currentTime, d = buf.duration, R = Math.min(0.012, d / 4);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(1, t0 + R);
  g.gain.setValueAtTime(1, Math.max(t0 + R, t0 + d - R));
  g.gain.linearRampToValueAtTime(0.0001, t0 + d);
  src.connect(g); g.connect(ctx.destination);
  let dead = false, earlyT = null;
  // crossfade hook: fire shortly BEFORE the buffer ends (while only the faded tail remains)
  // so the caller can start the next chunk overlapping — ambience never slams shut.
  if (earlySec > 0 && onEarly && d > earlySec * 3) earlyT = setTimeout(() => { if (!dead) onEarly(); }, Math.max(0, (d - earlySec) * 1000));
  src.onended = () => { if (!dead) { dead = true; clearTimeout(earlyT); try { g.disconnect(); } catch {} onended?.(); } };
  src.start();
  return {
    pause: () => ctx.suspend().catch(() => {}),
    play: () => ctx.resume().catch(() => {}),
    stop: () => { dead = true; clearTimeout(earlyT); src.onended = null; try { src.stop(); } catch {} try { g.disconnect(); } catch {} },
  };
}

// ── Media-element voice pipeline ─────────────────────────────────────────────
// Voice chunks now play through an <audio> element piped INTO the WebAudio graph
// (MediaElementSource → gain → out). Why both worlds:
//   • the element's playbackRate + preservesPitch uses the browser's time-
//     stretcher — the voice-speed slider (50-150%) changes TEMPO without pitch
//     artifacts (a raw AudioBufferSource would chipmunk);
//   • the gain node keeps the click-free ramps and the crossfade hook;
//   • streaming playback (no full decode) stays kind to slow connections.
// Server-side 200-400ms fades still guard the clip tails themselves.
function playClipUrl(url, onended, { earlySec = 0, onEarly = null, onError = null } = {}) {
  const ctx = waCtx();
  const vp = voicePrefs();
  const el = new Audio(url);
  el.preload = 'auto';
  el.playbackRate = vp.rate;
  try { el.preservesPitch = true; el.mozPreservesPitch = true; } catch {}
  const srcNode = ctx.createMediaElementSource(el);
  const g = ctx.createGain();
  g.gain.value = 0;
  srcNode.connect(g); g.connect(ctx.destination);
  let dead = false, earlyFired = false;
  const rampTo = (v, sec) => { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + sec); };
  const cleanup = () => { try { srcNode.disconnect(); g.disconnect(); } catch {} el.src = ''; };
  el.onplaying = () => rampTo(voicePrefs().vol, 0.012);   // click-free ramp-in when sound actually starts
  el.ontimeupdate = () => {
    if (dead || !el.duration) return;
    const remain = (el.duration - el.currentTime) / (el.playbackRate || 1);
    if (earlySec > 0 && onEarly && !earlyFired && remain <= earlySec + 0.12 && el.duration / (el.playbackRate || 1) > earlySec * 3) { earlyFired = true; onEarly(); }
  };
  const done = () => { if (!dead) { dead = true; cleanup(); onended?.(); } };
  // A LOAD/DECODE FAILURE is not a natural end: treating it as one silently SKIPPED the line
  // (the "missing lines don't play and don't regenerate" bug). Callers pass onError to
  // regenerate the clip on the fly; without a handler we keep the old advance behaviour.
  const errored = () => { if (!dead) { dead = true; cleanup(); (onError || onended)?.(); } };
  el.onended = done;
  el.onerror = errored;
  let fb = null;   // buffer-source fallback handle (mobile)
  el.play().catch(() => {
    // MOBILE AUTOPLAY GATE: media-element playback can be blocked long after the initiating
    // tap (films fetch + generate for seconds first) even when piped through WebAudio.
    // AudioBufferSource playback only needs the ctx — which the tap already unlocked — so
    // fall back to decode-and-play. (Rate stays 1.0 on this path: buffer rate would shift
    // pitch; correct speech beats fast speech.)
    if (dead) return;
    cleanup();
    fetch(url, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('audio ' + r.status); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf))
      .then(abuf => {
        if (dead) return;
        fb = playClip(abuf, () => { if (!dead) { dead = true; onended?.(); } },
          { earlySec, onEarly: () => { if (!earlyFired) { earlyFired = true; onEarly?.(); } } });
      })
      .catch(errored);
  });
  return {
    pause: () => { fb ? fb.pause() : el.pause(); },
    play: () => { fb ? fb.play() : el.play().catch(() => {}); },
    stop: () => { dead = true; el.onended = null; el.onerror = null; try { el.pause(); } catch {} cleanup(); fb?.stop(); },
  };
}

/* ── the narration player: sentence-by-sentence, prefetching, pausable ── */
const player = { active: false, paused: false, idx: 0, audio: null, cache: [], lines: [], chars: [], token: 0 };
function stopNarration() {
  player.token++;
  player.active = false; player.paused = false;
  if (player.audio) { (player.audio.stop || player.audio.pause).call(player.audio); player.audio = null; }
  waCtx().resume().catch(() => {});   // a ⏸-suspended context must not stay suspended for the next scene
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
  player.lines = lines; player.chars = characters; player.cache = []; player.idx = 0; player.manual = false;
  const retriedLines = new Set();   // per-scene: each line gets ONE on-the-fly regeneration before being skipped
  const playBtn = $('#tts-play'), pauseBtn = $('#tts-pause');
  if (!playBtn) return;
  if (!lines.length) { playBtn.disabled = true; return; }
  const chOf = (spk) => spk === 'narrator' ? null : characters.find(c => c.id === spk);
  const prefetch = (i) => {
    if (i >= lines.length || player.cache[i]) return player.cache[i];
    // Authored/intro lines can carry PRE-GENERATED audio per language (line.audio[lang],
    // bundled with the scenario) — play it directly, no synthesis, no cost, no wait.
    // (_noPre is set by the retry path when that pointer turned out to be dead — the retry
    // then goes through /api/tts, which regenerates AND saves the line like any other.)
    const pre = !lines[i]._noPre && lines[i].audio && lines[i].audio[getLang()];
    if (pre) { player.cache[i] = Promise.resolve({ assetId: pre, cached: true }); return player.cache[i]; }
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
      // generate ahead AND warm the browser HTTP cache (assets are immutable-cached)
      prefetch(i + 1)?.then(r => r && fetch(assetUrl(r.assetId), { credentials: 'same-origin' })).catch(() => {});
      prefetch(i + 2)?.catch(() => {});                            // (gen ≈ playback time, so keep two in flight)
      highlight(i, true);
      // advance ~180ms early: the next chunk starts under this one's fading tail (crossfade) —
      // guard so early + natural end can't both advance
      let advanced = false;
      const next = () => { if (advanced || tok !== player.token) return; advanced = true; playFrom(i + 1); };
      player.audio = playClipUrl(assetUrl(assetId), () => { highlight(i, false); next(); }, {
        earlySec: 0.18, onEarly: next,
        // The clip failed to LOAD (dangling asset id, half-written file, transient stream
        // error) — don't skip the line: drop every cached pointer for it and regenerate once
        // through /api/tts (the server re-synthesises and permanently saves a fresh asset).
        onError: () => {
          if (advanced || tok !== player.token) return;
          highlight(i, false);
          if (!retriedLines.has(i)) {
            retriedLines.add(i);
            lines[i]._noPre = true;            // a dead pre-stored pointer must not win again
            player.cache[i] = null;
            console.warn(`[tts] line ${i} audio failed to load — regenerating on the fly`);
            playFrom(i);                        // re-enters through prefetch → fetchTts → fresh asset
          } else {
            toast('🔇 One line could not be voiced — skipping it.', 'err');
            next();                             // second failure: keep the story moving
          }
        },
      });
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
      // Cinema/replay: a failed voiceover must NOT yank the scene forward. Leave the text on
      // screen, drop out of the playing state, and let the player read it and press ⏭ Next.
      if (player.manual) {
        player.active = false;
        const pb = $('#tts-play'); if (pb) { pb.textContent = '▶'; pb.classList.remove('on'); }
        const pp = $('#tts-pause'); if (pp) pp.style.display = 'none';
        toast('🔇 voice unavailable for this scene — read it, then press ⏭ Next', 'err');
        cineWaitHint(true);
        return;                                    // hold the scene; advance only on ⏭ Next / ⏹
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
    <span class="glasschip" id="cine-hint" style="display:none;color:#fff3c4;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">read at your own pace →</span>
    <button class="glasschip" id="cine-next" title="Go to the next scene" style="color:#d7f7ff;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏭ next scene</button>
    <button class="glasschip" id="cine-exit" title="End the film and jump to the outcome" style="color:#ffd9e6;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏹ skip all</button>`;
  $('#stage-root')?.appendChild(hud);
  // ⏭ Next scene — advance this scene now. stopNarration() stops any audio and fires
  // player.onIdle, which is the promise playSceneNarration() awaits, so it works whether
  // TTS is playing, off, or has failed.
  $('#cine-next', hud).onclick = () => { stopNarration(); };
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
let REPLAY_RUN = null;   // the one active replay — starting a new one cancels it (no double-play)
async function playReplay(branchId, startIdx, endIdx = null) {
  // GUARD: accidental double-clicks (or replaying while a replay runs) must never layer
  // two loops playing scenes over each other — cancel the previous run completely first.
  if (REPLAY_RUN) { REPLAY_RUN.cancelled = true; stopNarration(); $('#cine-hud')?.remove(); }
  const rep = { cancelled: false };
  REPLAY_RUN = rep;
  const data = await loadWorld();
  let { ticks } = await api(`/api/worlds/${S.world}/export/timeline?branchId=${encodeURIComponent(branchId)}&toIdx=999999999`);
  if (endIdx != null) ticks = ticks.filter(t => t.idx <= endIdx);   // sequence replay: play exactly the film
  const start = ticks.findIndex(t => t.idx === startIdx);
  if (start < 0) { if (REPLAY_RUN === rep) REPLAY_RUN = null; return toast('That moment is no longer on this timeline', 'err'); }
  if (rep.cancelled) return;   // superseded while we were fetching
  const hud = document.createElement('div');
  hud.id = 'cine-hud';
  hud.innerHTML = `<span class="glasschip" id="rep-pos" style="color:#efeaff;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏪ replay</span>
    <span class="glasschip" id="cine-hint" style="display:none;color:#fff3c4;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">read at your own pace →</span>
    <button class="glasschip" id="cine-next" title="Go to the next scene" style="color:#d7f7ff;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">⏭ next scene</button>
    <button class="glasschip" id="rep-exit" style="color:#ffd9e6;background:rgba(34,31,69,.65);border-color:rgba(255,255,255,.18)">✕ back to now</button>`;
  $('#stage-root')?.appendChild(hud);
  $('#cine-next', hud).onclick = () => { stopNarration(); };
  $('#rep-exit', hud).onclick = () => { rep.cancelled = true; stopNarration(); };

  let prevLoc = null;
  for (let i = start; i < ticks.length && !rep.cancelled; i++) {
    const tick = ticks[i];
    if (i === start) { const bl = $('#cine-blackout'); if (bl) { bl.style.opacity = '0'; setTimeout(() => bl.remove(), 700); } }
    const rp = $('#rep-pos'); if (rp) rp.textContent = `⏪ replay · tick ${tick.idx} · ${fmtClock(tick.sim_time)}`;
    // the score switches exactly where it did in the original telling
    try { const tm = tick.music && (typeof tick.music === 'string' ? JSON.parse(tick.music) : tick.music); if (tm) playMusic(tm); } catch {}
    await showCineTransition(tick, data, prevLoc);
    if (rep.cancelled) break;
    renderCineScene(tick, data);
    await playSceneNarration(tick, data);
    prevLoc = tick.pov_location_id;
  }
  hud.remove();
  $('#cine-blackout')?.remove();
  if (REPLAY_RUN === rep) REPLAY_RUN = null;
  if (rep.cancelled && REPLAY_RUN) return;   // superseded by a newer replay — it owns the stage now
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
      factPlayer = { stop: () => { state.cancelled = true; playing = false; if (state.audio) state.audio.stop(); $$('.fact-chunk.speaking', m).forEach(el => el.classList.remove('speaking')); btn.textContent = '🔊 Read to me'; } };
      btn.textContent = '⏹ Stop';
      // fire the requests with the 500ms stagger; the array keeps them in order
      const proms = chunks.map((text, k) => new Promise(res => setTimeout(() =>
        res(fetchTts(text, null, 'curious').catch(() => null)), k * 500)));
      try {
        for (let k = 0; k < chunks.length && !state.cancelled; k++) {
          const r = await proms[k];
          if (!r || state.cancelled) continue;
          if (proms[k + 1]) proms[k + 1].then(n => n && fetch(assetUrl(n.assetId), { credentials: 'same-origin' })).catch(() => {});  // warm next
          const el = chunkEls[k];
          if (el) { el.classList.add('speaking'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
          // element pipeline: click-free ramps + the voice-speed/volume prefs apply here too
          if (!state.cancelled) await new Promise((res) => { state.audio = playClipUrl(assetUrl(r.assetId), res); });
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

// "From the beginning": find the world's opening sequence on the active lineage and play
// it start-to-end as a film. Ends on the live present — the player takes over from there.
async function playIntroSequence() {
  try {
    const w = (await loadWorld()).world;
    const { ticks } = await api(`/api/worlds/${S.world}/export/timeline?branchId=${encodeURIComponent(w.active_branch_id)}&toIdx=999999999`);
    const intro = ticks.filter(t => { try { const s = t.seq && JSON.parse(t.seq); return s?.kind === 'intro'; } catch { return false; } });
    if (!intro.length) { toast('This world has no opening sequence'); return stageScreen(); }
    playReplay(w.active_branch_id, intro[0].idx, intro[intro.length - 1].idx);
  } catch (e) { fail(e); stageScreen(); }
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
        const { results } = await api(`/api/worlds/${S.world}/gm-apply`, { method: 'POST', body: { actions, adminMode: adminOn() } });
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
      const out = await api(`/api/worlds/${S.world}/gm-chat`, { method: 'POST', body: { message: text, lang: getLang(), adminMode: adminOn() } });
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
  // everyone AT the scene location — plus anyone who SPEAKS in this scene (their sprite
  // must be visible even if their end-of-interval state says they left, e.g. Sam in the
  // lab scene): consistency between the script and what's on screen.
  const narr = localizeNarr(tick.narration);
  const speakerIds = new Set(narr.map(n => n.speaker).filter(s => s && s !== 'narrator'));
  const present = (tick.states || []).filter(st => characters.find(c => c.id === st.character_id) && (st.location_id === loc?.id || speakerIds.has(st.character_id)));
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
  if (lines) { lines.innerHTML = renderNarration(narr, characters); bindStoryLines(characters); }
  const meta = $('.story-meta span'); if (meta) meta.textContent = `tick ${tick.idx} · ${tick.mood_tag || ''} · ${tick.time_delta}`;
  // keep the top HUD chip in sync with the scene being shown (place · tick · clock)
  const hudSpans = $$('.stage-hud .glasschip span');
  if (hudSpans[0]) hudSpans[0].textContent = `· ${loc?.name || ''} · tick ${tick.idx}`;
  if (hudSpans[1]) hudSpans[1].textContent = `🕐 ${fmtClock(tick.sim_time)}`;
}

// Autoplay one scene's narration and resolve when it ends (or is stopped/skipped).
// The narration player's pipelined prefetch (line n plays while n+1/n+2 generate)
// applies here exactly as in normal play.
// Show/hide the "read at your own pace" cue on the film HUD and make the ⏭ Next-scene
// button pulse. Shown whenever a scene has no voiceover to pace it (TTS off, or TTS failed)
// so the player is never rushed off the scene before reading it.
function cineWaitHint(on) {
  const hint = document.getElementById('cine-hint');
  const next = document.getElementById('cine-next');
  if (hint) hint.style.display = on ? '' : 'none';
  if (next) next.classList.toggle('waiting', !!on);
}
function playSceneNarration(tick, data) {
  return new Promise((resolve) => {
    const lines = localizeNarr(tick.narration).filter(n => n.text);
    if (!lines.length) return setTimeout(resolve, 1600);
    stopNarration();
    setupNarrationPlayer(lines, data.characters);
    player.manual = true;                          // cinema/replay: a TTS-off or TTS-fail scene
                                                   // waits for ⏭ Next instead of self-advancing
    player.onIdle = resolve;                        // fires from stopNarration (audio end, ⏭ Next, ⏹, or error)
    const playBtn = $('#tts-play');
    // "Read each new moment aloud automatically" (Account → Voice) is the read-aloud switch.
    // Off → treat the scene as silent: the player reads it and presses ⏭ Next themselves.
    const readAloud = ttsPrefs().autoplay !== false;
    if (readAloud && playBtn && !playBtn.disabled) {
      cineWaitHint(false);
      playBtn.click();                             // TTS on: audio paces the scene & auto-advances at its end
    } else {
      // No voiceover (TTS deactivated in Settings, or nothing to speak): do NOT auto-advance
      // on a timer — the player reads the whole scene and presses ⏭ Next (or ⏹ Skip all).
      cineWaitHint(true);
    }
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
const ttsInflight = new Map(); // dedup CONCURRENT requests (entries drop once settled — the
                               // durable cache is server-side; keeping resolved entries forever
                               // made retries re-serve a dead assetId after an asset went missing)
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
  prom.then(() => ttsInflight.delete(key), () => ttsInflight.delete(key));
  return prom;
}
async function speak(text, ch, el, emotion = '', mode = '') {
  try {
    el?.classList.add('playing');
    const { assetId } = await fetchTts(text, ch, emotion, mode);
    const a = new Audio(assetUrl(assetId));
    const vp = voicePrefs();
    a.volume = vp.vol; a.playbackRate = vp.rate;
    try { a.preservesPitch = true; } catch {}
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
      <div style="display:flex;gap:7px;flex:none;align-items:center;flex-wrap:wrap">
        ${(() => { try { const s = t.seq && (typeof t.seq === 'string' ? JSON.parse(t.seq) : t.seq); return s ? `<button class="btn btn-teal small" id="tl-replay-seq" title="Replay the whole ${esc(s.label)} as one film">🎬 Replay sequence (${s.n})</button><button class="btn btn-ghost small" id="tl-edit-seq" title="Edit this sequence's script and music">✏️</button>` : ''; } catch { return ''; } })()}
        ${t.idx > 0 ? `<button class="btn btn-primary small" id="tl-replay" title="Watch again from here — does not change the story">▶ Replay</button>` : ''}
        ${here ? '<span class="tag g">you are here</span>' : `<button class="btn btn-soft small" id="tl-jump" title="Rewind the world to here — advancing then forks a new branch">⤴ Jump</button>`}
      </div>`;
    const rp = $('#tl-replay', m);
    if (rp) rp.onclick = () => {
      m.remove();
      S.replay = { branchId: selected, idx: t.idx };
      if (location.hash.includes('stage')) stageScreen(); else nav(`#/stage?w=${S.world}`);
    };
    const eds = $('#tl-edit-seq', m);
    if (eds) eds.onclick = () => { m.remove(); introEditor(S.world); };
    const rps = $('#tl-replay-seq', m);
    if (rps) rps.onclick = () => {
      // the whole film: all ticks sharing this sequence id, first to last
      let s = null; try { s = typeof t.seq === 'string' ? JSON.parse(t.seq) : t.seq; } catch {}
      const members = ticksCache.filter(x => { try { const xs = x.seq && (typeof x.seq === 'string' ? JSON.parse(x.seq) : x.seq); return xs && s && xs.id === s.id; } catch { return false; } });
      if (!members.length) return;
      m.remove();
      S.replay = { branchId: selected, idx: members[0].idx, endIdx: members[members.length - 1].idx };
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
          ${(() => { try { const s = t.seq && (typeof t.seq === 'string' ? JSON.parse(t.seq) : t.seq); return s ? `<span class="tl-seqchip" title="${esc(s.label)} — scene ${s.pos}/${s.n}">🎬 ${s.pos}/${s.n}</span>` : ''; } catch { return ''; } })()}
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
  const nowTick = S.worldData?.world?.tick_index ?? Infinity;   // hide not-yet-introduced characters
  const who = (lid) => characters.filter(c => c.state.location_id === lid && (c.intro_tick_idx || 0) <= nowTick);
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
  // RPG without 🛠 admin mode: other minds are closed — the player discovers people by
  // talking to them, not by reading their state. (Their OWN character's head is always open.)
  if (rpgPC() && !adminOn() && c.id !== rpgPC()) {
    toast(`🔒 You can't read ${c.name}'s mind — that's for the simulation's admin. Enable 🛠 Admin mode in Account settings, or just talk to them.`);
    return;
  }
  const st = c.state, per = st.perceptions || {};
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal" style="width:min(1120px,97vw)"><div class="modal-head violet"><div><b>🧠 Inside ${esc(c.name)}'s mind</b><small>right now · <span id="mm-mood">${esc(st.mood || '')}</span> · at ${esc(locations.find(l => l.id === st.location_id)?.name || '?')}</small></div><span class="x">✕</span></div>
  <div class="modal-body mind-cols">
  <div>
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
  </div>
  <div class="panel iv-panel" style="margin:0">${innerVoiceHtml(c)}</div>
  </div></div>`;
  document.body.appendChild(m);
  bindInnerVoice(m, c, { onStateChange: (stNew) => {
    // reflect insights immediately in the mind panels (mood chip + thought box)
    const md = $('#mm-mood', m); if (md) md.textContent = stNew.mood || '';
    const tb = $('.mind-box.thoughts p', m);
    if (tb) { tb.innerHTML = stNew.thought ? '"' + esc(stNew.thought) + '"' : tb.innerHTML; tb.closest('.mind-box').style.boxShadow = '0 0 0 3px rgba(240,169,46,.35)'; setTimeout(() => tb.closest('.mind-box').style.boxShadow = '', 1200); }
  } });
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
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tp-inner" ${ttsPrefs().innerVoice !== false ? 'checked' : ''}> 🕯 Read inner-voice replies aloud (the character's voice)</label>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tp-innersight" ${rpgPrefs().adminMode ? 'checked' : ''}> 🛠 Admin mode — step outside your character: see every mind, ask the Game Master anything (secrets included) and change the world at will. Off = you are only your character; the GM keeps secrets and only grants sprite refreshes &amp; new places to explore.</label>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="tp-music" ${ttsPrefs().musicOn !== false ? 'checked' : ''}> 🎵 Background music (scene-matched, chosen by the storyteller)</label>
        <div style="display:grid;grid-template-columns:130px 1fr 44px;gap:8px 10px;align-items:center;margin:6px 0 0 26px;max-width:420px">
          <span style="font-size:11.5px;color:var(--soft)">🔊 voice volume</span>
          <input type="range" id="tp-voicevol" min="0" max="100" step="1" value="${Math.round((ttsPrefs().voiceVol ?? 1) * 100)}">
          <b id="tp-voicevol-n" style="font-size:11.5px">${Math.round((ttsPrefs().voiceVol ?? 1) * 100)}%</b>
          <span style="font-size:11.5px;color:var(--soft)">⏩ voice speed</span>
          <input type="range" id="tp-voicerate" min="50" max="150" step="1" value="${Math.round((ttsPrefs().voiceRate ?? 1.15) * 100)}">
          <b id="tp-voicerate-n" style="font-size:11.5px">${Math.round((ttsPrefs().voiceRate ?? 1.15) * 100)}%</b>
          <span style="font-size:11.5px;color:var(--soft)">🎵 music volume</span>
          <input type="range" id="tp-musicvol" min="0" max="100" step="1" value="${Math.round((ttsPrefs().musicVol ?? 0.10) * 100)}">
          <b id="tp-musicvol-n" style="font-size:11.5px">${Math.round((ttsPrefs().musicVol ?? 0.10) * 100)}%</b>
        </div>
        <p style="font-size:10.5px;color:var(--soft);margin:3px 0 0 26px">speed is pitch-preserving (50-150%) · music sits far beneath the voices by default (10%)</p>
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
    <div class="panel" style="margin-top:14px;padding:14px 16px">
      <b style="font-size:13px">🎤 Microphone <span style="font-weight:400;color:var(--soft);font-size:11px">— for speaking instead of typing (the 🎙 buttons)</span></b>
      <div id="mic-settings" style="margin-top:9px;font-size:12.5px">Loading…</div>
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
  renderMicSettings($('#mic-settings', m));
  const savePrefs = () => {
    if ($('#tp-innersight', m)) saveRpgPrefs({ adminMode: $('#tp-innersight', m).checked });
    saveTtsPrefs({ narrator: $('#tp-narr', m).value, prepare: $('#tp-prepare', m).checked, autoplay: $('#tp-auto', m).checked, innerVoice: $('#tp-inner', m).checked, musicOn: $('#tp-music', m).checked, musicVol: (+$('#tp-musicvol', m).value) / 100, voiceVol: (+$('#tp-voicevol', m).value) / 100, voiceRate: (+$('#tp-voicerate', m).value) / 100, narratorStyle: $('#tp-narr-style', m).value, characterStyle: $('#tp-char-style', m).value, custom: $('#tp-custom', m).value });
    // apply live: volume ramps immediately; toggling off fades the score out, on resumes it
    if (!$('#tp-music', m).checked) stopMusic(); else setMusicVolume((+$('#tp-musicvol', m).value) / 100);
  };
  $('#tp-musicvol', m).oninput = () => { $('#tp-musicvol-n', m).textContent = $('#tp-musicvol', m).value + '%'; setMusicVolume((+$('#tp-musicvol', m).value) / 100); };
  $('#tp-voicevol', m).oninput = () => { $('#tp-voicevol-n', m).textContent = $('#tp-voicevol', m).value + '%'; };
  $('#tp-voicerate', m).oninput = () => { $('#tp-voicerate-n', m).textContent = $('#tp-voicerate', m).value + '%'; };
  ['#tp-narr', '#tp-prepare', '#tp-auto', '#tp-inner', '#tp-music', '#tp-musicvol', '#tp-voicevol', '#tp-voicerate', '#tp-narr-style', '#tp-char-style', '#tp-custom'].forEach(sel => { const el = $(sel, m); if (el) { el.addEventListener('change', savePrefs); el.addEventListener('blur', savePrefs); } });
  $('#tp-narr-reset', m).onclick = () => { $('#tp-narr-style', m).value = DEFAULT_NARRATOR_STYLE; savePrefs(); };
  $('#tp-char-reset', m).onclick = () => { $('#tp-char-style', m).value = DEFAULT_CHARACTER_STYLE; savePrefs(); };
  const saveSkip = () => saveSkipPrefs({ animate: $('#sk-animate', m).checked, detail: $('#sk-detail', m).value });
  ['#sk-animate', '#sk-detail'].forEach(sel => $(sel, m).addEventListener('change', saveSkip));
  $('#logout', m).onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); S.user = null; m.remove(); nav('#/auth'); };
}

/* boot */
route();
