/* All residents, with bounded pages; anchoring is a filter, never a prerequisite. */
'use strict';
async function livingCastScreen(){
  const worldId=S.world,r=await api(lwPath()),filters=await api(lwPath()+'/sims/filters');if(S.world!==worldId)return;
  app.innerHTML=chrome('cast',{worldTitle:'Cast',sub:r.world.title+' · all '+r.population+' Sims'})+`<main class="screen"><div class="container lw-explorer">
    <div class="lw-world-heading"><div><p class="eyebrow">PEOPLE & THEIR LIVES</p><h1>Sim Explorer</h1><p>Find a familiar face, a shared ambition, or someone who needs a little warmth.</p></div><button class="btn btn-teal" id="lw-cast-anchor">Manage anchors</button><button class="btn btn-soft" id="lw-library">Image library</button><button class="btn btn-soft" id="lw-browse">Quick pick</button></div>
    <section class="lw-explorer-search" aria-label="Find residents">
      <div class="lw-explorer-filters">
        <label>Name<input id="lw-explore-search" type="search" placeholder="Search all residents"></label>
        <label>First name<input id="lw-explore-first" placeholder="e.g. Fiona"></label>
        <label>Family name<input id="lw-explore-family" placeholder="e.g. Santos"></label>
        <label>Home neighborhood<select id="lw-explore-neighborhood"><option value="">All neighborhoods</option>${filters.neighborhoods.map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('')}</select></label>
        <label>Age group<select id="lw-explore-age"><option value="">All ages</option><option value="0:2">0–2 · Infants</option><option value="3:5">3–5 · Preschoolers</option><option value="6:9">6–9 · Children</option><option value="10:14">10–14 · Children & young teens</option><option value="15:17">15–17 · Teens</option><option value="18:29">18–29 · Young adults</option><option value="30:49">30–49 · Adults</option><option value="50:69">50–69 · Adults</option><option value="70:120">70+ · Older adults</option></select></label>
        <label>Story focus<select id="lw-explore-anchor"><option value="">All Sims</option><option value="1">Anchored</option><option value="0">Unanchored</option></select></label>
      </div>
      <details class="lw-explorer-advanced" id="lw-explore-advanced"><summary><span><b>Explore their inner lives</b><small>Feelings, needs, attributes, skills, relationships & ambitions</small></span><span id="lw-rule-count">Add filters</span></summary>
        <div class="lw-explorer-builder"><p>Match <b>all</b> selected conditions, anywhere in town. Add the same category more than once to combine different needs or skills.</p>
          <div class="lw-filter-categories" aria-label="Add a filter">${filters.categories.map(c=>`<button type="button" data-add-filter="${esc(c.id)}">+ ${esc(c.label)}</button>`).join('')}<button type="button" id="lw-explore-show-results">View matching Sims ↓</button></div>
          <div id="lw-explore-rules"></div><p class="lw-filter-empty" id="lw-filter-empty">Start with a feeling, a need or a goal. Your results update as you choose.</p>
        </div>
      </details>
      <div id="lw-explore-chips" class="lw-explorer-chips" aria-label="Active filters"></div>
    </section>
    <div class="lw-explorer-summary"><div><b id="lw-explore-total" role="status" aria-live="polite"></b><small>Current state · no time passes while browsing</small></div><div><button class="btn btn-soft small" id="lw-explore-refresh">Refresh</button><button class="btn btn-soft small" id="lw-explore-reset">Clear all</button></div></div>
    <p id="lw-explore-error" role="alert" hidden></p><div id="lw-explore-grid" class="cast-grid" aria-label="Matching residents"></div>
    <div class="lw-pages"><button class="btn btn-soft" id="lw-explore-prev">← Previous</button><span id="lw-explore-page"></span><button class="btn btn-soft" id="lw-explore-next">Next →</button></div>
  </div></main>`;
  bindChrome();$('#lw-library').onclick=()=>livingLibraryModal();$('#lw-cast-anchor').onclick=livingAnchorModal;$('#lw-browse').onclick=()=>livingSimPicker(c=>livingProfileDrawer(c.id));
  let offset=0,token=0,timer,nextRule=0;const rules=[],grid=$('#lw-explore-grid'),basic=$('.lw-explorer-filters'),category=id=>filters.categories.find(c=>c.id===id);
  const ruleLabel=rule=>{
    const c=category(rule.category),field=c.fields.find(f=>f.id===rule.field);
    return field.label+(['relationship','income','interaction'].includes(rule.category)?'':` · ${rule.min}–${rule.max}`)+(rule.text?` · “${rule.text}”`:'');
  };
  function renderChips(){
    $('#lw-rule-count').textContent=rules.length?rules.length+' active':'Add filters';
    $('#lw-filter-empty').hidden=!!rules.length;
    $$('[data-add-filter]').forEach(el=>el.disabled=rules.length>=filters.maxRules);
    const basics=$$('input,select',basic).filter(el=>el.value).map(el=>({id:el.id,label:el.tagName==='SELECT'?el.options[el.selectedIndex].text:el.parentElement.firstChild.textContent.trim()+': '+el.value}));
    $('#lw-explore-chips').innerHTML=basics.map(x=>`<button type="button" data-clear-basic="${x.id}" aria-label="Remove ${esc(x.label)}">${esc(x.label)} <span aria-hidden="true">×</span></button>`).join('')+rules.map(rule=>`<button type="button" data-remove-filter="${rule.key}" aria-label="Remove ${esc(ruleLabel(rule))}">${esc(ruleLabel(rule))} <span aria-hidden="true">×</span></button>`).join('');
  }
  function renderRules(){
    $('#lw-explore-rules').innerHTML=rules.map(rule=>{
      const c=category(rule.category),id='lw-rule-'+rule.key;
      return `<fieldset class="lw-filter-rule" data-rule="${rule.key}"><legend>${esc(c.label)}</legend><div class="lw-filter-rule-controls">
        <label class="lw-filter-field" for="${id}-field">${['relationship','income','interaction'].includes(rule.category)?'Status or social tie':rule.category==='ambition'?'Goal theme':'Measure'}<select id="${id}-field" data-filter-prop="field">${c.fields.map(f=>`<option value="${esc(f.id)}"${f.id===rule.field?' selected':''}>${esc(f.label)}</option>`).join('')}</select></label>
        ${rule.category==='ambition'?`<label class="lw-filter-text" for="${id}-text">Words in the goal<input id="${id}-text" data-filter-prop="text" value="${esc(rule.text||'')}" maxlength="100" placeholder="Optional, e.g. learn"></label>`:''}
        ${!['relationship','income','interaction'].includes(rule.category)?`<div class="lw-filter-range"><label for="${id}-min">${rule.category==='ambition'?'Progress from':'From'}<input id="${id}-min" data-filter-prop="min" type="number" min="0" max="100" step="1" value="${rule.min}"></label><span aria-hidden="true">–</span><label for="${id}-max">To / 100<input id="${id}-max" data-filter-prop="max" type="number" min="0" max="100" step="1" value="${rule.max}"></label></div>`:''}
        <button type="button" class="lw-filter-remove" data-remove-filter="${rule.key}" aria-label="Remove ${esc(c.label)} filter">×</button>
        </div><p>${esc(c.hint)}</p></fieldset>`;
    }).join('');renderChips();
  }
  function validate(){
    const invalid=rules.find(rule=>!['relationship','income','interaction'].includes(rule.category)&&(!Number.isFinite(rule.min)||!Number.isFinite(rule.max)||rule.min<0||rule.max>100||rule.min>rule.max));
    $$('.lw-filter-rule').forEach(el=>el.classList.toggle('invalid',Number(el.dataset.rule)===invalid?.key));
    return invalid?'Choose a range from 0 to 100, with the lower value first. Your previous results are hidden until the range is valid.':'';
  }
  const badge=m=>`<span class="lw-match" title="${esc(m.title||m.label)}${m.value!==null?' · '+esc(m.unit)+' '+m.value+'/100':''}"><span>${esc(m.title||m.label)}</span>${m.value!==null?`<b>${m.value}<small>/100</small></b><i style="--match-value:${m.value}%" aria-hidden="true"></i>`:''}</span>`;
  const load=async()=>{
    if(!grid.isConnected)return;
    const current=++token,error=$('#lw-explore-error'),invalid=validate();error.textContent=invalid;error.hidden=!invalid;
    if(invalid){grid.innerHTML='';$('#lw-explore-total').textContent='Adjust your filters';$('#lw-explore-page').textContent='';$('#lw-explore-prev').disabled=$('#lw-explore-next').disabled=true;grid.setAttribute('aria-busy','false');return;}
    const query=new URLSearchParams({limit:'18',offset:String(offset),search:$('#lw-explore-search').value,firstName:$('#lw-explore-first').value,familyName:$('#lw-explore-family').value,neighborhood:$('#lw-explore-neighborhood').value,anchored:$('#lw-explore-anchor').value});
    const age=$('#lw-explore-age').value;if(age){const [min,max]=age.split(':');query.set('minAge',min);query.set('maxAge',max);}
    if(rules.length)query.set('filters',JSON.stringify(rules.map(({key,...rule})=>rule)));
    grid.setAttribute('aria-busy','true');$('#lw-explore-total').textContent='Searching all residents…';$('#lw-explore-prev').disabled=$('#lw-explore-next').disabled=true;
    try{
      const result=await api(`/api/living/worlds/${worldId}/sims?`+query);if(current!==token||!grid.isConnected||S.world!==worldId)return;
      $('#lw-explore-total').textContent=result.total+' of '+r.population+' Sims';$('#lw-explore-page').textContent=result.total?`${offset+1}–${Math.min(offset+18,result.total)} / ${result.total}`:'No matches';
      $('#lw-explore-prev').disabled=!offset;$('#lw-explore-next').disabled=offset+18>=result.total;
      grid.innerHTML=result.sims.map(c=>`<article class="cast-tile lw-resident-card"><button class="lw-resident-profile" data-resident="${c.id}"><div class="lw-resident-portrait" style="border-color:${esc(c.colour)}">${c.asset_id?`<img loading="lazy" src="/api/living/library/${encodeURIComponent(c.asset_id)}?variant=sprite" alt="">`:'<span>'+esc(c.name.charAt(0).toUpperCase())+'</span>'}</div><b data-no-translate>${esc(c.name)}</b><small>${c.age} years · ${c.anchored?'⚓ Anchored':'procedural'}</small></button><p class="lw-resident-status">${esc(c.activityStatus?.label || 'Daily life')} ${typeof exInfo==='function'?(exInfo(c.activityStatus?.kind || 'status') || exInfo('status')): ''}</p><p class="lw-resident-location">${esc(c.locationSummary)}</p><small>${esc(c.activityText||'')}</small>
        ${c.matches?.length?`<div class="lw-resident-matches" aria-label="Why this Sim matches">${c.matches.slice(0,4).map(badge).join('')}${c.matches.length>4?`<details><summary>+ ${c.matches.length-4} more matches</summary>${c.matches.slice(4).map(badge).join('')}</details>`:''}</div>`:''}
        <div class="lw-resident-actions"><button data-scene-sim="${c.id}" title="See ${esc(c.name)} in the scene">▶ Play</button><button data-world-sim="${c.id}" title="Find this Sim on the world map">◎ World</button><button data-bonds-sim="${c.id}" title="Explore this Sim’s relationships">♡ Bonds</button></div></article>`).join('')||'<div class="lw-explorer-no-results"><b>No residents match every condition.</b><p>Widen a range or remove one of the filter chips above. All filters are combined with AND.</p><button class="btn btn-soft" id="lw-empty-reset">Clear all filters</button></div>';
      $$('[data-resident]',grid).forEach(el=>el.onclick=()=>livingProfileDrawer(el.dataset.resident).catch(fail));
      $$('[data-scene-sim]',grid).forEach(el=>el.onclick=()=>livingJump({type:'character',id:el.dataset.sceneSim}).catch(fail));
      $$('[data-world-sim]',grid).forEach(el=>el.onclick=()=>livingWorldJump(el.dataset.worldSim));
      $$('[data-bonds-sim]',grid).forEach(el=>el.onclick=()=>livingBondsJump(el.dataset.bondsSim));
      if($('#lw-empty-reset'))$('#lw-empty-reset').onclick=()=>$('#lw-explore-reset').click();
    }catch(e){if(current===token&&grid.isConnected){error.textContent=e.message||'The search could not be loaded. Please try Refresh.';error.hidden=false;grid.innerHTML='';$('#lw-explore-total').textContent='Search unavailable';$('#lw-explore-page').textContent='';}}
    finally{if(current===token&&grid.isConnected)grid.setAttribute('aria-busy','false');}
  };
  function schedule(delay=0){clearTimeout(timer);++token;offset=0;renderChips();$('#lw-explore-prev').disabled=$('#lw-explore-next').disabled=true;timer=setTimeout(load,delay);}
  basic.oninput=el=>schedule(el.target.tagName==='INPUT'?220:0);
  $('.lw-explorer-search').onclick=e=>{
    const add=e.target.closest('[data-add-filter]'),remove=e.target.closest('[data-remove-filter]'),clear=e.target.closest('[data-clear-basic]');
    if(add&&rules.length<filters.maxRules){const c=category(add.dataset.addFilter),defaults={income:'middle',interaction:'any',emotion:'distress',need:'social',attribute:'reputation',skill:'empathy',relationship:'single',ambition:'any'},key=++nextRule;rules.push({key,category:c.id,field:defaults[c.id],...(['relationship','income','interaction'].includes(c.id)?{}:{min:c.id==='ambition'?0:c.id==='emotion'?20:50,max:100}),...(c.id==='ambition'?{text:''}:{})});renderRules();schedule();$('#lw-rule-'+key+'-field').focus();}
    if(remove){const index=rules.findIndex(r=>r.key===Number(remove.dataset.removeFilter));if(index>=0)rules.splice(index,1);renderRules();schedule();}
    if(clear){$('#'+clear.dataset.clearBasic).value='';schedule();}
  };
  $('#lw-explore-rules').oninput=e=>{const el=e.target,field=el.dataset.filterProp;if(!field)return;const rule=rules.find(r=>r.key===Number(el.closest('[data-rule]').dataset.rule));rule[field]=['min','max'].includes(field)?(el.value===''?(field==='min'?0:100):Number(el.value)):el.value;schedule(el.tagName==='INPUT'?300:0);};
  $('#lw-explore-prev').onclick=()=>{offset=Math.max(0,offset-18);load();};$('#lw-explore-next').onclick=()=>{offset+=18;load();};
  $('#lw-explore-refresh').onclick=()=>schedule();
  $('#lw-explore-show-results').onclick=()=>{if(validate()){$('#lw-explore-error').scrollIntoView({block:'center'});return;}$('#lw-explore-advanced').open=false;$('.lw-explorer-summary').scrollIntoView({block:'start',behavior:'smooth'});};
  $('#lw-explore-reset').onclick=()=>{$$('input,select',basic).forEach(el=>el.value='');rules.length=0;renderRules();schedule();};
  await load();
}
async function livingPresenceModal(placeId,title){
  const m=lwModal('Anwesend · '+title,'Tatsächliche Anwesenheit am aktuellen Simulationszeitpunkt','<div id="lw-presence-list"></div><div class="lw-pages"><button class="btn btn-soft small" id="lw-presence-prev">←</button><span id="lw-presence-count"></span><button class="btn btn-soft small" id="lw-presence-next">→</button></div>',640);let offset=0;
  const load=async()=>{const r=await api(lwPath()+'/sims?'+new URLSearchParams({place:placeId,limit:'40',offset:String(offset)}));if(!m.isConnected)return;$('#lw-presence-list',m).innerHTML=r.sims.map(s=>`<div class="lw-presence-row"><span style="background:${esc(s.colour)}" class="lw-anchor-dot"></span><button data-presence-profile="${s.id}"><b>${esc(s.name)}</b><small>${s.age} Jahre · ${esc(s.activityText||'')} · ${s.anchored?'Anker':'ohne Anker'}</small></button><button class="btn btn-soft small" data-presence-scene="${s.id}">Bühne ↗</button></div>`).join('')||'<p>Hier ist gerade niemand.</p>';$('#lw-presence-count',m).textContent=`${r.total?offset+1:0}–${Math.min(offset+40,r.total)} / ${r.total}`;$('#lw-presence-prev',m).disabled=!offset;$('#lw-presence-next',m).disabled=offset+40>=r.total;$$('[data-presence-profile]',m).forEach(el=>el.onclick=()=>livingProfileDrawer(el.dataset.presenceProfile).catch(fail));$$('[data-presence-scene]',m).forEach(el=>el.onclick=()=>{m.remove();livingJump({type:'character',id:el.dataset.presenceScene}).catch(fail);});};
  $('#lw-presence-prev',m).onclick=()=>{offset=Math.max(0,offset-40);load().catch(fail);};$('#lw-presence-next',m).onclick=()=>{offset+=40;load().catch(fail);};await load();
}
