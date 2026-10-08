// Scene history uses the original Vivarium filmstrip idiom. Only the selected
// scene is fetched in full; offscreen thumbnail images are unloaded.
async function livingSceneMonitor({beatId=null}={}){
  const world=S.world,path=`/api/living/worlds/${world}`;
  const m=lwModal('Scene monitor','Browse saved moments · replay never changes the simulation',`<div class="lw-history-toolbar"><select id="lw-history-episode" aria-label="Time step"></select><button class="btn btn-soft small" id="lw-history-older">Older steps</button></div><div id="lw-history-strip" class="tl-strip"></div><div id="lw-history-detail" aria-live="polite"></div>`,1060);m.classList.add('lw-scene-monitor');
  let beats=[],nextBefore=null,scenes=[],selected=-1,epoch=0,io;
  const detail=$('#lw-history-detail',m),strip=$('#lw-history-strip',m),select=$('#lw-history-episode',m),alive=()=>m.isConnected&&S.world===world;
  const observer=new MutationObserver(()=>{if(!m.isConnected){io?.disconnect();observer.disconnect();epoch++;}});observer.observe(document.body,{childList:true});
  const choose=async i=>{
    if(!alive())return;selected=i;const stamp=++epoch,entry=scenes[i];
    $$('[data-scene-index]',strip).forEach(b=>{b.classList.toggle('sel',Number(b.dataset.sceneIndex)===i);b.setAttribute('aria-pressed',String(Number(b.dataset.sceneIndex)===i));});
    $(`[data-scene-index="${i}"]`,strip)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
    detail.innerHTML='<p class="lw-history-loading">Loading this scene…</p>';
    try{
      const scene=await api(`${path}/history/${encodeURIComponent(entry.beatId)}/scenes/${encodeURIComponent(entry.key)}`);
      if(!alive()||stamp!==epoch)return;
      const names=new Map(scene.characters.map(c=>[c.id,c.name]));
      detail.innerHTML=`<div class="lw-history-detail-head"><div><h3>${esc(scene.title)}</h3><small>${esc(fmtClock(scene.tick.sim_time))} · ${esc(scene.locations[0]?.name||'')} · ${entry.words} words</small></div><div class="lw-history-controls"><button class="btn btn-soft small" id="lw-history-prev" ${i?'':'disabled'}>← Previous</button><button class="btn btn-primary small" id="lw-history-play">▶ Play from here</button><button class="btn btn-soft small" id="lw-history-next" ${i+1<scenes.length?'':'disabled'}>Next →</button></div></div><div class="lw-history-script" tabindex="0" aria-label="Scene screenplay">${scene.tick.narration.map(n=>`<div class="lw-script-beat ${n.speaker==='narrator'?'narrator':'character'}"><b>${esc(n.speaker==='narrator'?'Narrator':names.get(n.speaker)||'Recorded Sim')}${n.mode==='thought'?' · thought':''}</b><p>${esc(n.text)}</p></div>`).join('')}</div>${scene.recording?.startsWith('legacy')?'<small>Earlier recording: saved dialogue and participants, with current artwork. Historical stats were not saved.</small>':''}`;
      $('#lw-history-prev',m).onclick=()=>choose(i-1);$('#lw-history-next',m).onclick=()=>choose(i+1);
      $('#lw-history-play',m).onclick=async()=>{m.remove();if(!location.hash.includes('/stage')){nav(`#/stage?w=${world}`);for(let n=0;n<100&&!$('#stage-root');n++)await sleep(50);}if(S.world===world&&$('#stage-root'))livingPlayFlashbacks({entries:scenes,startIndex:i}).catch(fail);};
    }catch(e){if(alive()&&stamp===epoch)detail.textContent=e.message;}
  };
  const episode=async id=>{
    const b=beats.find(b=>b.id===id);if(!b)return;beatId=id;const stamp=++epoch;io?.disconnect();strip.innerHTML='';detail.textContent='Loading recorded scenes…';
    try{const r=await api(`${path}/history/${encodeURIComponent(id)}/scenes`);if(!alive()||stamp!==epoch)return;scenes=r.scenes;selected=-1;
      $('#lw-history-summary',m)?.remove();
      const summary=document.createElement('details');summary.id='lw-history-summary';summary.innerHTML=`<summary>Episode overview & timing · ${Math.round((b.metrics.totalMs||0)/1000)} s</summary><div>${b.story.flatMap(s=>s.split(/\n\s*\n/)).filter(Boolean).map(s=>'<p>'+esc(s)+'</p>').join('')||'<p>Procedural step · see individual journals for recorded activities.</p>'}<small>${b.metrics.population||0} Sims · CPU ${((b.metrics.cpuMs||0)/1000).toFixed(1)} s${b.metrics.modelMs!=null?' · model '+(b.metrics.modelMs/1000).toFixed(1)+' s':''} · ${b.metrics.modelCalls||0} model calls${b.metrics.promptTokens?' · '+b.metrics.promptTokens.toLocaleString('en-US')+' input / '+b.metrics.completionTokens.toLocaleString('en-US')+' output tokens':''}</small></div>`;detail.after(summary);
      strip.innerHTML=scenes.map((s,i)=>`<button class="tl-card lw-history-card" data-scene-index="${i}" aria-pressed="false"><div class="tl-thumb" data-bg="${esc(s.thumbnail||'')}"></div><div class="tl-cap"><b>${i+1} · ${esc(s.kind==='flashback'?'Earlier':'Closing scene')}</b><span>${esc(fmtClock(new Date(Date.UTC(2026,8,21)+s.seconds*1000).toISOString()))}</span></div><strong>${esc(s.title)}</strong><small>${esc(s.place||'')}<br>${esc(s.cast.slice(0,3).map(c=>c.name).join(', '))}</small></button>`).join('');
      io=new IntersectionObserver(entries=>{for(const e of entries){const node=e.target;node.style.backgroundImage=e.isIntersecting&&node.dataset.bg?`url("${node.dataset.bg}")`:'';}},{root:strip,rootMargin:'0px 200px'});$$('.tl-thumb',strip).forEach(el=>io.observe(el));$$('[data-scene-index]',strip).forEach(el=>el.onclick=()=>choose(Number(el.dataset.sceneIndex)));
      if(scenes.length)await choose(0);else{detail.innerHTML='<p>No scene recording was saved for this step. The episode overview and personal journals remain available.</p>';summary.open=true;}
    }catch(e){if(alive()&&stamp===epoch)detail.textContent=e.message;}
  };
  const load=async older=>{const r=await api(path+'/history?limit=15'+(older&&nextBefore?'&before='+nextBefore:''));if(!alive())return;beats=older?beats.concat(r.beats):r.beats;nextBefore=r.nextBefore;$('#lw-history-older',m).disabled=!nextBefore;select.innerHTML=beats.map(b=>`<option value="${esc(b.id)}">Step ${b.version} · ${fmtClock(new Date(Date.UTC(2026,8,21)+b.end*1000).toISOString())} · +${Math.round((b.end-b.start)/60)} min</option>`).join('');select.value=beatId&&beats.some(b=>b.id===beatId)?beatId:beats[0]?.id||'';if(!older)await episode(select.value);};
  select.onchange=()=>{beatId=select.value;episode(select.value);};$('#lw-history-older',m).onclick=()=>load(true).catch(fail);
  m.onkeydown=e=>{if(e.target.matches('input,select,textarea')||selected<0)return;if(e.key==='ArrowLeft'&&selected>0){e.preventDefault();choose(selected-1);}if(e.key==='ArrowRight'&&selected+1<scenes.length){e.preventDefault();choose(selected+1);}};
  await load(false);return m;
}
