/* Shared personal studio and operator provider console. Secrets are write-only. */
window.VivariumProviders = {
  async mount(box, { admin = false, api, esc, toast, onSave = async () => {} }) {
    const prefix = admin ? '/admin/api/provider' : '/api/provider';
    let state;
    try { state = await api(prefix + '/settings'); }
    catch (e) { box.textContent = e.message; return; }
    const labels = { openrouter:'OpenRouter', hyprlab:'HyprLab' };
    const roles = { llm:['Language model','Story, dialogue & character decisions'], image:['Image model','Optional new images · confirmation required'], tts:['Speech model','Narration & character voices'], asr:['Transcription','Speech input from your microphone'] };
    const endpoints = {}, endpointLoads = {}, endpointRequests = {}, catalogs = {}, loading = {}, picks = structuredClone(state.roles);
    box.classList.add('provider-studio');
    box.innerHTML = `<div class="studio-intro"><span class="studio-eyebrow">${admin ? 'OPERATOR CONSOLE' : 'YOUR AI STUDIO'}</span><h2>${admin ? 'Providers & models' : 'Make Vivarium your own'}</h2><p>${admin ? 'Set the central providers and default models for your players.' : 'One OpenRouter key powers story, voices, microphone transcription and optional new images. Library images need no image API calls. Your choices apply only to you.'}</p></div>
      ${admin ? '' : `<div class="studio-mode" role="group" aria-label="AI billing mode"><label><input type="radio" name="studio-mode" value="central" ${!state.enabled?'checked':''}> <span><b>Server AI</b><small>Uses Vivarium credits</small></span></label><label><input type="radio" name="studio-mode" value="personal" ${state.enabled?'checked':''} ${!state.policyEnabled?'disabled':''}> <span><b>My own providers</b><small>No Vivarium credits · billed by your providers</small></span></label></div>`}
      <div class="studio-banner">${admin ? 'Central settings apply when a player uses Server AI.' : state.active ? 'Your personal models are active. No Vivarium credits are used.' : state.enabled ? 'Connect either HyprLab or OpenRouter to use personal mode.' : 'Server AI is active. One API key is enough. Enter HyprLab or OpenRouter, choose your models, and save.'}${!state.policyEnabled && !admin ? ' Personal mode has been disabled by the operator.' : ''}</div>
      <h3>API connections</h3><div class="studio-keys">${Object.entries(labels).map(([p,label])=>`<section class="studio-key" data-key-provider="${p}"><div class="studio-card-head"><b>${label}</b><span class="studio-badge ${state.keys[p].configured?'connected':''}">${state.keys[p].configured ? 'Connected · '+esc(state.keys[p].masked) : 'Not connected'}</span></div><label class="studio-field">${state.keys[p].configured?'Replace API key':'API key'}<input type="password" data-key="${p}" autocomplete="new-password" spellcheck="false" placeholder="${p==='openrouter'?'sk-or-v1-…':'HyprLab API key'}"></label><div class="studio-actions"><button class="btn btn-soft small" data-key-test="${p}">Test</button><button class="btn btn-primary small" data-key-save="${p}">Save key</button>${state.keys[p].configured && (!admin || state.keys[p].source==='settings')?`<button class="btn btn-ghost small" data-key-remove="${p}">${admin && state.keys[p].source==='environment'?'Use environment':'Remove'}</button>`:''}</div><small>${admin ? state.keys[p].source==='environment'?'Loaded from server environment. A saved key takes precedence.':'Available to players using Server AI.' : 'Stored for your account. The saved key is never displayed.'}</small><div data-key-result="${p}" class="studio-feedback" role="status"></div></section>`).join('')}</div>
      <div class="studio-section-heading"><h3>${admin?'Default models':'Your model choices'}</h3><button class="btn btn-ghost small" data-refresh-catalog>Refresh catalog</button></div>
      <div class="studio-models">${Object.entries(roles).map(([role,[label,description]])=>`<section class="studio-model" data-role="${role}"><div class="studio-card-head"><div><b>${label}</b><small>${description}</small></div><span class="studio-role">${role.toUpperCase()}</span></div><label class="studio-field">API service<select data-provider="${role}">${Object.entries(labels).map(([p,label])=>`<option value="${p}" ${p===picks[role].provider?'selected':''}>${label}</option>`).join('')}${picks[role].provider==='custom'?'<option value="custom" selected>Custom endpoint (advanced)</option>':''}</select></label><label class="studio-field">Find a model<input type="search" data-search="${role}" placeholder="Search models or authors…" aria-label="Search ${label}"></label><label class="studio-field">Model<select data-model="${role}"><option value="${esc(picks[role].model)}">${esc(picks[role].model)} · current</option></select></label><div class="studio-model-meta" data-meta="${role}" role="status">Loading catalog…</div><details class="studio-hosting" data-hosting="${role}" ${picks[role].provider!=='openrouter'?'hidden':''}><summary>Hosting provider <span data-host-summary="${role}">${esc(picks[role].openrouter?.endpoint || 'Automatic')}</span></summary><p>Choose who runs this model on OpenRouter. The model author and hosting provider can be different companies.</p><label class="studio-field">Run this model on<select data-endpoint="${role}" aria-label="Hosting provider for ${label}"><option value="">Automatic · all available hosts</option></select></label><label class="studio-field">Automatic routing priority<select data-routing-sort="${role}"><option value="default">Balanced · OpenRouter default</option><option value="throughput">Fastest generation · tokens per second</option><option value="latency">Quickest first token</option><option value="price">Lowest price</option></select></label><label class="studio-fallback"><input type="checkbox" data-host-fallback="${role}" checked> Allow another host if the selected host fails</label><div class="studio-host-meta" data-host-meta="${role}" role="status"></div><button class="btn btn-ghost small" data-host-refresh="${role}">Refresh hosts</button></details>${role==='tts'?'<label class="studio-field">Fallback voice<select data-voice></select></label><label class="studio-field" data-eleven-voice-field hidden>ElevenLabs voice ID<input data-eleven-voice maxlength="20" placeholder="JBFqnCBsd6RMkjVDRZzb"><small>Default: George. Paste an ID from the ElevenLabs voice library.</small></label>':''}</section>`).join('')}</div>
      ${admin?`<label class="studio-policy"><input type="checkbox" data-policy ${state.policyEnabled?'checked':''}> Allow players to use their own HyprLab and OpenRouter keys</label>`:''}
      <div class="studio-footer"><span data-save-result class="studio-feedback" role="status">Model changes take effect after saving.</span><button class="btn btn-primary" data-save-models>Save ${admin?'defaults':'my settings'}</button></div>`;
    const $ = s => box.querySelector(s);
    const feedback = (el,message,error=false) => { el.textContent=message; el.classList.toggle('error',error); };
    const busy = async (button,fn) => { button.disabled=true; try { await fn(); } catch(e) { feedback($('[data-save-result]'),e.message,true); } finally { if(button.isConnected)button.disabled=false; } };
    const defaultPick = (provider,role) => ({provider,model:state.defaults[provider]?.[role] || state.roles[role].model,...(state.routingDefaults?.[provider]?.[role]?{openrouter:structuredClone(state.routingDefaults[provider][role])}:{})});
    const price = m => m.free ? 'Free model' : m.output?.includes('speech') ? 'Speech model · provider pricing applies' : m.per_image != null ? `$${m.per_image} per image` : m.in_per_mtok != null ? `$${m.in_per_mtok.toFixed(2)} input / $${(m.out_per_mtok || 0).toFixed(2)} output per million tokens` : 'Provider pricing applies';
    function fill(role) {
      const provider=picks[role].provider, list=catalogs[provider]?.[role] || [], query=$(`[data-search="${role}"]`).value.trim().toLowerCase();
      const author=m=>m.provider || m.id.split('/')[0];
      const visible=list.filter(m=>(author(m)+' '+m.name+' '+m.id).toLowerCase().includes(query)).sort((a,b)=>author(a).localeCompare(author(b),'en') || (a.name||a.id).localeCompare(b.name||b.id,'en',{numeric:true})), select=$(`[data-model="${role}"]`);
      const current=list.find(m=>m.id===picks[role].model);
      const groups=new Map();
      for(const m of visible){const name=author(m);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(m);}
      select.innerHTML = `${visible.some(m=>m.id===picks[role].model)?'':`<option value="${esc(picks[role].model)}">${esc(picks[role].model)} · selected</option>`}`+[...groups].map(([name,models])=>`<optgroup label="${esc(name)} · ${models.length}">${models.map(m=>`<option value="${esc(m.id)}" ${m.id===picks[role].model?'selected':''}>${m.free?'★ Free · ':''}${esc(m.name || m.id)}</option>`).join('')}</optgroup>`).join('');
      select.value=picks[role].model;
      $(`[data-hosting="${role}"]`).hidden=provider!=='openrouter';
      if(provider==='custom') feedback($(`[data-meta="${role}"]`),'Custom endpoint: edit in Advanced routes.');
      else if(catalogs[provider]) feedback($(`[data-meta="${role}"]`),`${visible.length} models · ${current?(provider==='openrouter'?'Catalog rates from ':'')+price(current):'Current model is not listed in this catalog.'}`);
      if(role==='tts') {
        const voices=current?.voices?.length ? current.voices : ['Sulafat'];
        const oldVoice=$('[data-voice]').value || state.ttsVoice;
        const eleven=provider==='hyprlab'&&picks.tts.model.startsWith('eleven-');
        $('[data-eleven-voice-field]').hidden=!eleven; $('[data-voice]').closest('label').hidden=eleven;
        if(eleven&&!$('[data-eleven-voice]').value)$('[data-eleven-voice]').value=/^[A-Za-z0-9]{20}$/.test(state.ttsVoice || '')?state.ttsVoice:'JBFqnCBsd6RMkjVDRZzb';
        $('[data-voice]').innerHTML=voices.map(v=>`<option value="${esc(v)}" ${v===oldVoice?'selected':''}>${esc(v)}</option>`).join('');
      }
    }
    function routing(role) { return picks[role].openrouter || {endpoint:'',sort:'default',allowFallbacks:true}; }
    function hostMeta(role) {
      const pref=routing(role), selected=(endpoints[picks[role].model]?.endpoints||[]).find(e=>e.id===pref.endpoint);
      $(`[data-host-summary="${role}"]`).textContent=pref.endpoint || (pref.sort==='throughput'?'Automatic · fastest':'Automatic');
      $(`[data-routing-sort="${role}"]`).value=pref.sort || 'default';
      $(`[data-host-fallback="${role}"]`).checked=pref.allowFallbacks!==false;
      $(`[data-host-fallback="${role}"]`).disabled=!pref.endpoint;
      const el=$(`[data-host-meta="${role}"]`);el.classList.remove('error');
      if(!pref.endpoint) {el.textContent='OpenRouter chooses an available host at request time. Speed and price vary with load.';return;}
      if(!selected){el.textContent='Saved host is not in the current list. Refresh or choose Automatic.';return;}
      const cost=n=>n!=null&&Number.isFinite(Number(n))?'$'+(Number(n)*1e6).toFixed(3):'—';
      const number=n=>n==null?'Not reported':Number(n).toLocaleString('en',{maximumFractionDigits:1});
      el.innerHTML=`<dl><div><dt>Input / output · per 1M tokens</dt><dd>${cost(selected.pricing.prompt)} / ${cost(selected.pricing.completion)}</dd></div><div><dt>Generation speed · recent median</dt><dd>${number(selected.throughput)}${selected.throughput!=null?' tokens/s':''}</dd></div><div><dt>First token · recent median</dt><dd>${number(selected.latency)}${selected.latency!=null?' s':''}</dd></div><div><dt>Context / precision</dt><dd>${number(selected.contextLength)} / ${esc(selected.quantization || 'Not reported')}</dd></div><div><dt>Availability</dt><dd>${selected.available?'Available':'Currently unavailable'}${selected.uptime!=null?' · '+number(selected.uptime)+'% recent uptime':''}</dd></div></dl><small>${pref.allowFallbacks!==false?'This host is tried first; another may be used on failure.':'Only this endpoint is allowed. An outage or rate limit will stop the request.'} Reported speed is an observation, not a guarantee.</small>`;
    }
    async function loadHosts(role,force=false) {
      const config=picks[role], request=endpointRequests[role]=(endpointRequests[role]||0)+1;
      const details=$(`[data-hosting="${role}"]`);details.hidden=config.provider!=='openrouter';
      if(config.provider!=='openrouter')return;
      const model=config.model, select=$(`[data-endpoint="${role}"]`);
      select.innerHTML='<option value="">Automatic · all available hosts</option>'+(routing(role).endpoint?`<option value="${esc(routing(role).endpoint)}">${esc(routing(role).endpoint)} · saved</option>`:'');select.value=routing(role).endpoint||'';
      select.disabled=true;feedback($(`[data-host-meta="${role}"]`),'Loading available hosts…');
      try {
        if(force)delete endpoints[model];
        if(!endpoints[model]) {
          if(!endpointLoads[model])endpointLoads[model]=api(`${prefix}/endpoints?model=${encodeURIComponent(model)}${force?'&refresh=1':''}`).then(data=>endpoints[model]=data).finally(()=>delete endpointLoads[model]);
          await endpointLoads[model];
        }
        if(!box.isConnected||request!==endpointRequests[role]||picks[role].model!==model||picks[role].provider!=='openrouter')return;
        const pref=routing(role), rows=endpoints[model].endpoints;
        const groups=new Map();for(const e of rows){if(!groups.has(e.provider))groups.set(e.provider,[]);groups.get(e.provider).push(e);}
        select.innerHTML='<option value="">Automatic · all available hosts</option>'+(!pref.endpoint||rows.some(e=>e.id===pref.endpoint)?'':`<option value="${esc(pref.endpoint)}">${esc(pref.endpoint)} · unavailable</option>`)+[...groups].sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,hosts])=>`<optgroup label="${esc(name)}">${hosts.map(e=>`<option value="${esc(e.id)}" ${!e.available?'disabled':''}>${esc(e.id)}${e.throughput!=null?' · '+Math.round(e.throughput)+' tok/s':''}${!e.available?' · unavailable':''}</option>`).join('')}</optgroup>`).join('');
        select.value=pref.endpoint||'';hostMeta(role);
      }catch(e){if(box.isConnected&&request===endpointRequests[role])feedback($(`[data-host-meta="${role}"]`),e.message+' Your saved preference is preserved.',true);}
      finally{if(box.isConnected&&request===endpointRequests[role])select.disabled=false;}
    }
    async function load(provider) {
      if(provider==='custom')return;
      if(!catalogs[provider]) { if(!loading[provider])loading[provider]=api(`${prefix}/models?provider=${provider}&refresh=1`).then(response=>{catalogs[provider]=response.catalog;}).finally(()=>{delete loading[provider];});await loading[provider]; }
    }
    async function loadRole(role) {
      try { await load(picks[role].provider); if(box.isConnected) {fill(role); await loadHosts(role);} }
      catch(e) { feedback($(`[data-meta="${role}"]`),e.message+' Use Refresh catalog to retry.',true); }
    }
    await Promise.all(Object.keys(roles).map(loadRole));
    for(const role of Object.keys(roles)) {
      $(`[data-search="${role}"]`).oninput=()=>fill(role);
      $(`[data-provider="${role}"]`).onchange=async e=> { picks[role]=defaultPick(e.target.value,role); await loadRole(role); };
      $(`[data-model="${role}"]`).onchange=e=> { picks[role].model=e.target.value; delete picks[role].openrouter; fill(role); loadHosts(role); };
      $(`[data-endpoint="${role}"]`).onchange=e=>{picks[role].openrouter={...routing(role),endpoint:e.target.value};hostMeta(role);};
      $(`[data-routing-sort="${role}"]`).onchange=e=>{picks[role].openrouter={...routing(role),sort:e.target.value};hostMeta(role);};
      $(`[data-host-fallback="${role}"]`).onchange=e=>{picks[role].openrouter={...routing(role),allowFallbacks:e.target.checked};hostMeta(role);};
      $(`[data-host-refresh="${role}"]`).onclick=e=>busy(e.currentTarget,()=>loadHosts(role,true));
    }
    $('[data-refresh-catalog]').onclick=e=>busy(e.currentTarget,async()=> { for(const p of Object.keys(catalogs))delete catalogs[p]; for(const m of Object.keys(endpoints))delete endpoints[m]; await Promise.all(Object.keys(roles).map(loadRole)); });
    function useConnectedProvider() {
      if(admin)return;
      const connected=Object.keys(labels).filter(p=>state.keys[p].configured);
      if(connected.length===1) {
        const provider=connected[0];
        for(const role of Object.keys(roles)) {
          if(picks[role].provider!==provider)picks[role]=defaultPick(provider,role);
          $(`[data-provider="${role}"]`).value=provider;
        }
      }
      for(const role of Object.keys(roles)) for(const option of $(`[data-provider="${role}"]`).options) {
        option.disabled=connected.length>0&&!state.keys[option.value]?.configured;
      }
    }
    async function saveKey(provider) {
      const input=$(`[data-key="${provider}"]`),result=$(`[data-key-result="${provider}"]`);
      const key=input.value.trim();
      if(!key)throw new Error('Enter an API key before saving.');
      feedback(result,'Testing and saving…');
      const response=await api(prefix+'/keys/'+provider,{method:'PUT',body:{key}});
      input.value='';state.keys=response.keys;
      const badge=$(`[data-key-provider="${provider}"] .studio-badge`);
      badge.textContent='Connected · '+response.keys[provider].masked;badge.classList.add('connected');
      if(!admin) {
        useConnectedProvider();
        $('input[name="studio-mode"][value="personal"]').checked=true;
        await Promise.all(Object.keys(roles).map(loadRole));
      }
      feedback(result,'Key saved. One connected provider is enough.');
      await onSave();
    }
    useConnectedProvider();
    for(const provider of Object.keys(labels)) {
      const result=$(`[data-key-result="${provider}"]`);
      $(`[data-key-test="${provider}"]`).onclick=e=>busy(e.currentTarget,async()=> {
        feedback(result,'Testing connection…');
        try { await api(prefix+'/test',{method:'POST',body:{provider,key:$(`[data-key="${provider}"]`).value}});feedback(result,'Connection verified.'); }
        catch(error){feedback(result,error.message,true);}
      });
      $(`[data-key-save="${provider}"]`).onclick=e=>busy(e.currentTarget,async()=> {
        try {await saveKey(provider);}catch(error){feedback(result,error.message,true);}
      });
      $(`[data-key-remove="${provider}"]`)?.addEventListener('click',e=>busy(e.currentTarget,async()=> {
        await api(prefix+'/keys/'+provider,{method:'PUT',body:{remove:true}});
        await onSave();await window.VivariumProviders.mount(box,{admin,api,esc,toast,onSave});
      }));
    }
    $('[data-save-models]').onclick=e=>busy(e.currentTarget,async()=> {
      feedback($('[data-save-result]'),'Saving…');
      // Save typed credentials too: the main Save button completes the whole setup.
      for(const provider of Object.keys(labels))if($(`[data-key="${provider}"]`).value.trim())await saveKey(provider);
      useConnectedProvider();
      const enabled=admin || $('input[name="studio-mode"]:checked').value==='personal';
      if(!admin&&enabled&&!Object.values(state.keys).some(key=>key.configured))throw new Error('Connect either HyprLab or OpenRouter. One key is enough.');
      const r=await api(prefix+'/settings',{method:'PUT',body:{roles:picks,ttsVoice:picks.tts.provider==='hyprlab'&&picks.tts.model.startsWith('eleven-')?$('[data-eleven-voice]').value.trim():$('[data-voice]').value,enabled,...(admin?{policyEnabled:$('[data-policy]').checked}:{})}});
      state=r;Object.assign(picks,structuredClone(r.roles));await Promise.all(Object.keys(roles).map(loadRole));feedback($('[data-save-result]'),'Saved.');$('.studio-banner').textContent=admin?'Central defaults saved.':r.active?'Your personal models are active. No Vivarium credits are used.':'Server AI is active. Uses Vivarium credits.';
      toast(admin?'Default models saved':'Your AI settings saved');await onSave();
    });
  }
};
