/* Shared personal studio and operator provider console. Secrets are write-only. */
window.VivariumProviders = {
  async mount(box, { admin = false, api, esc, toast, onSave = async () => {} }) {
    const prefix = admin ? '/admin/api/provider' : '/api/provider';
    let state;
    try { state = await api(prefix + '/settings'); }
    catch (e) { box.textContent = e.message; return; }
    const labels = { hyprlab:'HyprLab', openrouter:'OpenRouter' };
    const roles = { llm:['Language model','Story, dialogue & world simulation'], image:['Image model','Locations, characters & outfits'], tts:['Speech model','Narration & character voices'], asr:['Transcription','Speech input from your microphone'] };
    const catalogs = {}, loading = {}, picks = structuredClone(state.roles);
    box.classList.add('provider-studio');
    box.innerHTML = `<div class="studio-intro"><span class="studio-eyebrow">${admin ? 'OPERATOR CONSOLE' : 'YOUR AI STUDIO'}</span><h2>${admin ? 'Providers & models' : 'Make Vivarium your own'}</h2><p>${admin ? 'Set the central providers and default models for your players.' : 'Connect your accounts and choose the models that power your worlds. Your choices apply only to you.'}</p></div>
      ${admin ? '' : `<div class="studio-mode" role="group" aria-label="AI billing mode"><label><input type="radio" name="studio-mode" value="central" ${!state.enabled?'checked':''}> <span><b>Server AI</b><small>Uses Vivarium credits</small></span></label><label><input type="radio" name="studio-mode" value="personal" ${state.enabled?'checked':''} ${!state.policyEnabled?'disabled':''}> <span><b>My own providers</b><small>No Vivarium credits · billed by your providers</small></span></label></div>`}
      <div class="studio-banner">${admin ? 'Central settings apply when a player uses Server AI.' : state.active ? 'Your personal models are active. No Vivarium credits are used.' : state.enabled ? 'Personal mode needs a key for every selected provider.' : 'Server AI is active. Save your keys and model choices, then select My own providers.'}${!state.policyEnabled && !admin ? ' Personal mode has been disabled by the operator.' : ''}</div>
      <h3>API connections</h3><div class="studio-keys">${Object.entries(labels).map(([p,label])=>`<section class="studio-key" data-key-provider="${p}"><div class="studio-card-head"><b>${label}</b><span class="studio-badge ${state.keys[p].configured?'connected':''}">${state.keys[p].configured ? 'Connected · '+esc(state.keys[p].masked) : 'Not connected'}</span></div><label class="studio-field">${state.keys[p].configured?'Replace API key':'API key'}<input type="password" data-key="${p}" autocomplete="new-password" spellcheck="false" placeholder="${p==='openrouter'?'sk-or-v1-…':'HyprLab API key'}"></label><div class="studio-actions"><button class="btn btn-soft small" data-key-test="${p}">Test</button><button class="btn btn-primary small" data-key-save="${p}">Save key</button>${state.keys[p].configured && (!admin || state.keys[p].source==='settings')?`<button class="btn btn-ghost small" data-key-remove="${p}">${admin && state.keys[p].source==='environment'?'Use environment':'Remove'}</button>`:''}</div><small>${admin ? state.keys[p].source==='environment'?'Loaded from server environment. A saved key takes precedence.':'Available to players using Server AI.' : 'Stored for your account. The saved key is never displayed.'}</small><div data-key-result="${p}" class="studio-feedback" role="status"></div></section>`).join('')}</div>
      <div class="studio-section-heading"><h3>${admin?'Default models':'Your model choices'}</h3><button class="btn btn-ghost small" data-refresh-catalog>Refresh catalog</button></div>
      <div class="studio-models">${Object.entries(roles).map(([role,[label,description]])=>`<section class="studio-model" data-role="${role}"><div class="studio-card-head"><div><b>${label}</b><small>${description}</small></div><span class="studio-role">${role.toUpperCase()}</span></div><label class="studio-field">Provider<select data-provider="${role}">${Object.entries(labels).map(([p,label])=>`<option value="${p}" ${p===picks[role].provider?'selected':''}>${label}</option>`).join('')}${picks[role].provider==='custom'?'<option value="custom" selected>Custom endpoint (advanced)</option>':''}</select></label><label class="studio-field">Find a model<input type="search" data-search="${role}" placeholder="Search model names…" aria-label="Search ${label}"></label><label class="studio-field">Model<select data-model="${role}"><option value="${esc(picks[role].model)}">${esc(picks[role].model)} · current</option></select></label><div class="studio-model-meta" data-meta="${role}" role="status">Loading catalog…</div>${role==='tts'?'<label class="studio-field">Fallback voice<select data-voice></select></label>':''}</section>`).join('')}</div>
      ${admin?`<label class="studio-policy"><input type="checkbox" data-policy ${state.policyEnabled?'checked':''}> Allow players to use their own HyprLab and OpenRouter keys</label>`:''}
      <div class="studio-footer"><span data-save-result class="studio-feedback" role="status">Model changes take effect after saving.</span><button class="btn btn-primary" data-save-models>Save ${admin?'defaults':'my settings'}</button></div>`;
    const $ = s => box.querySelector(s);
    const feedback = (el,message,error=false) => { el.textContent=message; el.classList.toggle('error',error); };
    const busy = async (button,fn) => { button.disabled=true; try { await fn(); } catch(e) { feedback($('[data-save-result]'),e.message,true); } finally { if(button.isConnected)button.disabled=false; } };
    const price = m => m.free ? 'Free model' : m.output?.includes('speech') ? 'Speech model · provider pricing applies' : m.in_per_mtok != null ? `$${m.in_per_mtok.toFixed(2)} input / $${(m.out_per_mtok || 0).toFixed(2)} output per million tokens` : 'Provider pricing applies';
    function fill(role) {
      const provider=picks[role].provider, list=catalogs[provider]?.[role] || [], query=$(`[data-search="${role}"]`).value.trim().toLowerCase();
      const visible=list.filter(m=>(m.name+' '+m.id).toLowerCase().includes(query)), select=$(`[data-model="${role}"]`);
      const current=list.find(m=>m.id===picks[role].model);
      select.innerHTML = `${visible.some(m=>m.id===picks[role].model)?'':`<option value="${esc(picks[role].model)}">${esc(picks[role].model)} · selected</option>`}`+visible.map(m=>`<option value="${esc(m.id)}" ${m.id===picks[role].model?'selected':''}>${m.free?'★ Free · ':''}${esc(m.name || m.id)}</option>`).join('');
      if(provider==='custom') feedback($(`[data-meta="${role}"]`),'Custom endpoint: edit in Advanced routes.');
      else if(catalogs[provider]) feedback($(`[data-meta="${role}"]`),`${visible.length} models · ${current?price(current):'Current model is not listed in this catalog.'}`);
      if(role==='tts') {
        const voices=current?.voices?.length ? current.voices : ['Sulafat'];
        const oldVoice=$('[data-voice]').value || state.ttsVoice;
        $('[data-voice]').innerHTML=voices.map(v=>`<option value="${esc(v)}" ${v===oldVoice?'selected':''}>${esc(v)}</option>`).join('');
      }
    }
    async function load(provider) {
      if(provider==='custom')return;
      if(!catalogs[provider]) { if(!loading[provider])loading[provider]=api(`${prefix}/models?provider=${provider}&refresh=1`).then(response=>{catalogs[provider]=response.catalog;}).finally(()=>{delete loading[provider];});await loading[provider]; }
    }
    async function loadRole(role) {
      try { await load(picks[role].provider); if(box.isConnected) fill(role); }
      catch(e) { feedback($(`[data-meta="${role}"]`),e.message+' Use Refresh catalog to retry.',true); }
    }
    await Promise.all(Object.keys(roles).map(loadRole));
    for(const role of Object.keys(roles)) {
      $(`[data-search="${role}"]`).oninput=()=>fill(role);
      $(`[data-provider="${role}"]`).onchange=async e=> { picks[role]={provider:e.target.value,model:state.defaults[e.target.value]?.[role] || state.roles[role].model}; await loadRole(role); };
      $(`[data-model="${role}"]`).onchange=e=> { picks[role].model=e.target.value; fill(role); };
    }
    $('[data-refresh-catalog]').onclick=e=>busy(e.currentTarget,async()=> { for(const p of Object.keys(catalogs))delete catalogs[p]; await Promise.all(Object.keys(roles).map(loadRole)); });
    for(const p of Object.keys(labels)) {
      const result=$(`[data-key-result="${p}"]`);
      $(`[data-key-test="${p}"]`).onclick=e=>busy(e.currentTarget,async()=> { feedback(result,'Testing connection…'); try { await api(prefix+'/test',{method:'POST',body:{provider:p,key:$(`[data-key="${p}"]`).value}}); feedback(result,'Connection verified.'); } catch(err){feedback(result,err.message,true);} });
      $(`[data-key-save="${p}"]`).onclick=e=>busy(e.currentTarget,async()=> { const input=$(`[data-key="${p}"]`);feedback(result,'Testing and saving…'); try { const firstConnection=!Object.values(state.keys).some(k=>k.configured);const r=await api(prefix+'/keys/'+p,{method:'PUT',body:{key:input.value}});input.value='';state.keys=r.keys;if(firstConnection&&!admin){for(const role of Object.keys(roles)){picks[role]={provider:p,model:state.defaults[p][role]};$(`[data-provider="${role}"]`).value=p;}$('input[name="studio-mode"][value="personal"]').checked=true;await Promise.all(Object.keys(roles).map(loadRole));}const badge=$(`[data-key-provider="${p}"] .studio-badge`);badge.textContent='Connected · '+r.keys[p].masked;badge.classList.add('connected');feedback(result,'Key saved. Choose your models below and save settings.');await onSave(); } catch(err){feedback(result,err.message,true);} });
      $(`[data-key-remove="${p}"]`)?.addEventListener('click',e=>busy(e.currentTarget,async()=> { await api(prefix+'/keys/'+p,{method:'PUT',body:{remove:true}}); await onSave(); await window.VivariumProviders.mount(box,{admin,api,esc,toast,onSave}); }));
    }
    $('[data-save-models]').onclick=e=>busy(e.currentTarget,async()=> {
      feedback($('[data-save-result]'),'Saving…');
      const enabled=admin || $('input[name="studio-mode"]:checked').value==='personal';
      const r=await api(prefix+'/settings',{method:'PUT',body:{roles:picks,ttsVoice:$('[data-voice]').value,enabled,...(admin?{policyEnabled:$('[data-policy]').checked}:{})}});
      state=r;feedback($('[data-save-result]'),'Saved.');$('.studio-banner').textContent=admin?'Central defaults saved.':r.active?'Your personal models are active. No Vivarium credits are used.':'Server AI is active. Uses Vivarium credits.';
      toast(admin?'Default models saved':'Your AI settings saved');await onSave();
    });
  }
};
