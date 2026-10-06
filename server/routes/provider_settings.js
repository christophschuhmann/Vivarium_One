import { db, getSetting, setSetting, pj, j, uid, now } from '../db.js';
import { requireUser, requireVerified, requireAdmin, httpErr } from '../auth.js';
import { PROVIDERS, ROLES, byokPolicy, byokActive, prefsFor, userKey, operatorKey, encryptSecret, maskKey, enterPrincipal } from '../byok.js';
import { providerCatalog, checkProviderKey, validateRoles } from '../provider_catalog.js';
import { voicesFor } from '../openrouter.js';
const routeRole = role => role === 'llm' ? 'reasoning_llm' : role;
const providerOf = r => r.base_url.includes('openrouter.ai') ? 'openrouter' : r.base_url.includes('hyprlab.io') ? 'hyprlab' : 'custom';
function centralRoles() { return Object.fromEntries(ROLES.map(role => { const r = db.prepare('SELECT * FROM model_routes WHERE role=?').get(routeRole(role)); return [role, { provider: providerOf(r), model: r.model }]; })); }
function status(user, admin) {
  const prefs = admin ? { roles: centralRoles(), tts_voice: getSetting('central_tts_voice') || 'Sulafat' } : prefsFor(user);
  return { roles: prefs.roles, models: Object.fromEntries(Object.entries(prefs.roles).map(([r,c])=>[r,c.model])), ttsVoice: prefs.tts_voice,
    enabled: admin ? true : !!user.or_enabled, active: admin ? true : byokActive(user), policyEnabled: byokPolicy().enabled,
    keys: Object.fromEntries(Object.keys(PROVIDERS).map(p => { const key = admin ? operatorKey(p) : userKey(user,p); return [p, { configured: !!key, masked: maskKey(key), source: admin && getSetting('provider_credentials')?.[p] ? 'settings' : admin && key ? 'environment' : 'personal' }]; })),
    defaults: Object.fromEntries(Object.entries(PROVIDERS).map(([p,c])=>[p,c.defaults])), central: centralRoles(), voices: voicesFor(prefs.roles.tts.model),
    hasKey: !!user?.or_key, keyMasked: maskKey(userKey(user)), ttsProvider: getSetting('tts_provider') || 'gemini' };
}
export default async function providerSettingsRoutes(app) {
  for (const admin of [false,true]) {
    const prefix = admin ? '/admin/api/provider' : '/api/provider';
    const auth = req => admin ? requireAdmin(req) : requireUser(req);
    const writeAuth = req => admin ? requireAdmin(req) : requireVerified(req);
    app.get(prefix + '/settings', async req => status(auth(req),admin));
    app.get(prefix + '/models', async req => {
      const u = auth(req), provider = req.query?.provider || 'openrouter', kind = req.query?.kind;
      const catalog = await providerCatalog(provider, admin ? operatorKey(provider) : userKey(u,provider) || operatorKey(provider), { force: req.query?.refresh === '1' });
      if (kind && !ROLES.includes(kind)) throw httpErr(400,'BAD_KIND','Unbekannte Modellaufgabe.');
      return kind ? { provider, kind, models: catalog[kind] } : { provider, catalog };
    });
    app.post(prefix + '/test', async req => {
      const u = writeAuth(req), provider = req.body?.provider || 'openrouter';
      const key = String(req.body?.key || '').trim() || (admin ? operatorKey(provider) : userKey(u,provider));
      return { ok:true, keyStatus: await checkProviderKey(provider,key) };
    });
    app.put(prefix + '/keys/:provider', async req => {
      const u = writeAuth(req), provider = req.params.provider;
      if (!PROVIDERS[provider]) throw httpErr(400,'BAD_PROVIDER','Unbekannter Anbieter.');
      const remove = req.body?.remove === true, key = String(req.body?.key || '').trim();
      if (!remove && (!key || key.length > 4096 || /\s/.test(key))) throw httpErr(400,'BAD_KEY','Bitte einen gültigen API-Schlüssel eintragen.');
      if (!remove) await checkProviderKey(provider,key);
      if (admin) {
        const credentials = getSetting('provider_credentials') || {};
        if (remove) delete credentials[provider]; else credentials[provider] = encryptSecret(key);
        db.transaction(()=> { setSetting('provider_credentials', credentials); db.prepare('INSERT INTO admin_audit(id,admin_id,action,target,payload,created_at) VALUES (?,?,?,?,?,?)').run(uid('au_'),u.id,'provider.key',provider,j({ removed:remove }),now()); })();
      } else {
        const column = provider === 'hyprlab' ? 'hypr_key' : 'or_key';
        const inUse = Object.values(prefsFor(u).roles).some(c => c.provider === provider);
        db.prepare(`UPDATE users SET ${column}=?, or_enabled=CASE WHEN ? THEN 0 ELSE or_enabled END WHERE id=?`).run(remove ? null : encryptSecret(key),remove && inUse ? 1 : 0,u.id);
      }
      return { ok:true, ...status(db.prepare('SELECT * FROM users WHERE id=?').get(u.id),admin) };
    });
    app.put(prefix + '/settings', async req => {
      const u = writeAuth(req), b = req.body || {}, old = status(u,admin);
      if (!admin && b.enabled && !byokPolicy().enabled) throw httpErr(403,'BYOK_DISABLED','Persönliche Schlüssel sind auf diesem Server deaktiviert.');
      const roles = Object.fromEntries(ROLES.map(role=>[role,b.roles?.[role] || old.roles[role]]));
      // Preserve custom central routes when the UI only changes a hosted modality.
      const changed = Object.fromEntries(Object.entries(roles).filter(([r,c]) => JSON.stringify(c) !== JSON.stringify(old.roles[r])));
      if (Object.values(changed).some(c => !c || !PROVIDERS[c.provider])) throw httpErr(400,'BAD_PROVIDER','Unbekannter Anbieter.');
      if (admin && Object.values(changed).some(c => !operatorKey(c.provider))) throw httpErr(400,'NO_KEY','Bitte zuerst den zentralen Anbieter-Schlüssel hinterlegen.');
      await validateRoles(changed, p=>admin ? operatorKey(p) : userKey(u,p));
      if (!admin && b.enabled && ROLES.some(role => !userKey(u,roles[role].provider))) throw httpErr(400,'NO_KEY','Für jede gewählte Aufgabe muss ein eigener Schlüssel hinterlegt sein.');
      const ttsVoice = String(b.ttsVoice || old.ttsVoice).slice(0,60);
      db.transaction(()=> {
        if (admin) {
          for (const [role,c] of Object.entries(changed)) {
            const base = c.provider === 'hyprlab' && role === 'tts' && /gemini/.test(c.model) ? 'https://api.hyprlab.io/v1beta' : PROVIDERS[c.provider].base;
            const previous = db.prepare('SELECT * FROM model_routes WHERE role=?').get(routeRole(role));
            const sameProvider = providerOf(previous) === c.provider;
            const costs = c.provider === 'hyprlab' && role === 'tts' && /gemini-3\.1/.test(c.model) ? {in_per_mtok:0.5,out_per_mtok:10} : c.provider === 'hyprlab' && role === 'tts' && /gemini-3\.8/.test(c.model) ? {in_per_mtok:0.5,out_per_mtok:9} : sameProvider ? pj(previous.unit_cost,{}) : c.provider === 'hyprlab' ? role === 'tts' ? {in_per_mtok:0.5,out_per_mtok:9} : role === 'image' ? {per_image:0.02} : role === 'asr' ? {per_minute:0.0042} : {in_per_mtok:0.75,out_per_mtok:4.5} : {};
            db.prepare('UPDATE model_routes SET model=?,base_url=?,key_env=?,enabled=1,unit_cost=? WHERE role=?').run(c.model,base,PROVIDERS[c.provider].env,j(costs),routeRole(role));
          }
          setSetting('central_tts_voice',ttsVoice);
          if (changed.tts) setSetting('tts_provider','gemini');
          if (b.policyEnabled !== undefined) setSetting('byok',{...byokPolicy(),enabled:!!b.policyEnabled});
          db.prepare('INSERT INTO admin_audit(id,admin_id,action,target,payload,created_at) VALUES (?,?,?,?,?,?)').run(uid('au_'),u.id,'provider.models','model_routes',j({roles:changed}),now());
        } else {
          db.prepare('UPDATE users SET provider_prefs=?,or_enabled=? WHERE id=?').run(j({roles,ttsVoice}),b.enabled === undefined ? +u.or_enabled : +!!b.enabled,u.id);
        }
      })();
      const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
      if (!admin) enterPrincipal(fresh);
      return {ok:true,...status(fresh,admin)};
    });
  }
}
