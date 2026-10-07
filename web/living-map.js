/* Circular hierarchy, independent group expansion and a bounded viewport image cache. */
'use strict';
const lwGroupColours=['#cc9468','#78a68e','#819fc2','#bc898d','#9b92b7','#959e9e'];
function lwColour(id){let n=0;for(const c of id)n=(n*31+c.charCodeAt(0))>>>0;return lwGroupColours[n%lwGroupColours.length];}
function lwPack(items){
  const placed=[];
  for(const item of [...items].sort((a,b)=>b.space-a.space)){
    let x=0,y=0;
    if(placed.length)for(let i=1;i<80000;i++){
      const radius=10*Math.sqrt(i),angle=i*2.399963229728653;x=radius*Math.cos(angle);y=radius*Math.sin(angle);
      if(placed.every(p=>Math.hypot(p.x-x,p.y-y)>=p.space+item.space+12))break;
    }
    item.x=x;item.y=y;placed.push(item);
  }
  return Math.max(0,...placed.map(p=>Math.hypot(p.x,p.y)+p.space));
}
function lwCircleLayout(graph){
  const children=new Map();for(const n of graph.nodes){if(!children.has(n.parent_id))children.set(n.parent_id,[]);children.get(n.parent_id).push(n);}
  function size(n){
    n.children=(children.get(n.id)||[]).map(size);if(n.kind==='entry'){n.x=0;n.y=0;}
    n.r=n.expanded?lwPack(n.children.filter(c=>c.kind!=='entry'))+68:n.kind==='entry'?19:n.landmark?76:n.kind==='street'?66:n.presentCount?88:58;
    n.space=n.r+(n.expanded?12:27);return n;
  }
  const roots=(children.get(null)||[]).map(size),radius=lwPack(roots);
  function locate(n,x,y){n.x+=x;n.y+=y;for(const child of n.children)locate(child,n.x,n.y);}
  for(const n of roots)locate(n,0,0);
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const n of graph.nodes.filter(n=>n.kind==='entry')){
    const group=byId.get(n.parent_id),edge=graph.edges.find(e=>e.from_id===n.id&&byId.get(e.to_id)?.parent_id!==group.id||e.to_id===n.id&&byId.get(e.from_id)?.parent_id!==group.id),other=edge?byId.get(edge.from_id===n.id?edge.to_id:edge.from_id):null;
    const target=other?.kind==='entry'?byId.get(other.parent_id):other;const angle=target?Math.atan2(target.y-group.y,target.x-group.x):Math.PI/2;n.x=group.x+Math.cos(angle)*(group.r-25);n.y=group.y+Math.sin(angle)*(group.r-25);
  }
  return {radius,roots};
}
async function livingGraph(root,{focus,expanded,onPick,onSelect,onChange,onOpen,selectOnly=false}={}){
  root.livingMap?.dispose();
  const touch=id=>{recent=recent.filter(p=>p!==id);recent.push(id);};
  const worldId=S.world,uid='map'+Math.random().toString(36).slice(2),state=lwMapState.get(worldId)||{};
  let open=new Set(expanded||state.expanded||[]),recent=[...(state.order||expanded||state.expanded||[])],graph=null,layout,request=0,disposed=false,drag=null,moved=false,scale=1,tx=0,ty=0,frame=0,zoomTimer=0,viewFocus;
  root.innerHTML=`<div class="lw-map-bar"><button class="btn btn-soft small" data-city title="Alle Gruppen schließen und Stadtübersicht zeigen">⌂ Stadt</button><button class="btn btn-soft small" data-fit title="Alle offenen Gruppen zeigen">Übersicht</button><span data-level>Nachbarschaften · Häuser · Räume</span><button class="btn btn-soft small" data-minus aria-label="Herauszoomen">−</button><button class="btn btn-soft small" data-plus aria-label="Hineinzoomen">+</button></div><div class="lw-map-wrap"><svg class="lw-map-svg" aria-label="Interaktive Weltkarte"><defs></defs><g data-viewport></g></svg><div class="lw-map-hint">Klick: auswählen · Doppelklick: öffnen · +/−: Gruppe · Ziehen: bewegen</div></div>`;
  const wrap=$('.lw-map-wrap',root),vp=$('[data-viewport]',root);
  const camera=()=>{vp.setAttribute('transform',`translate(${tx},${ty}) scale(${scale})`);cancelAnimationFrame(frame);frame=requestAnimationFrame(refreshVisibility);};
  function refreshVisibility(){
    if(!graph||disposed)return;const width=wrap.clientWidth,height=wrap.clientHeight;
    // Show the routes relevant to the area under the camera. Distant routes
    // must not cut across the rooms of the house currently being inspected.
    const centre={x:(width/2-tx)/scale,y:(height/2-ty)/scale},byId=new Map(graph.nodes.map(n=>[n.id,n]));
    const field=graph.nodes.filter(n=>n.expanded&&n.r*scale>170&&Math.hypot(n.x-centre.x,n.y-centre.y)<n.r).sort((a,b)=>a.r-b.r)[0];
    const inside=n=>{for(let at=n;at;at=byId.get(at.parent_id))if(at.id===field?.id)return true;return false;};
    for(const edge of vp.querySelectorAll('.lw-route-link')){const a=graph.nodes[+edge.dataset.from],b=graph.nodes[+edge.dataset.to];edge.style.display=!field||inside(a)||inside(b)?'':'none';}
    const others=document.querySelectorAll('img,svg image').length-vp.querySelectorAll('image').length;
    let budget=Math.max(0,Math.min(50,50-others));
    const candidates=graph.nodes.filter(n=>!n.expanded).map(n=>({n,x:tx+n.x*scale,y:ty+n.y*scale,r:n.r*scale})).filter(p=>p.x+p.r>0&&p.y+p.r>0&&p.x-p.r<width&&p.y-p.r<height).sort((a,b)=>Math.hypot(a.x-width/2,a.y-height/2)-Math.hypot(b.x-width/2,b.y-height/2));
    const lastOpen=recent.filter(id=>graph.expanded.includes(id)).at(-1),lastGroup=byId.get(lastOpen);
    const detailGroup=lastGroup?.children?.filter(c=>c.kind!=='entry').every(c=>c.leaf)?lastOpen:null;
    const avatarItems=candidates.filter(p=>p.n.parent_id===detailGroup&&p.r>=55).flatMap(p=>(p.n.presentSims||[]).slice(0,4).filter(s=>s.asset_id).map(s=>({n:p.n,s}))).slice(0,Math.min(12,Math.max(0,budget-4)));
    const avatarKeys=new Set(avatarItems.map(p=>p.n.id+'|'+p.s.id));
    const images=new Set(candidates.filter(p=>p.n.thumbnail&&p.r>=14).slice(0,Math.max(0,budget-avatarItems.length)).map(p=>p.n.id));
    for(const n of graph.nodes){const el=vp.querySelector(`[data-index="${n.index}"]`);if(!el)continue;
      const label=el.querySelector('.lw-circle-label'),meta=el.querySelector('.lw-circle-meta');
      if(label){label.style.fontSize=Math.max(14,14/scale)+'px';label.style.display=n.kind!=='entry'&&(n.expanded||n.r*scale>=28)?'':'none';}
      if(meta){meta.style.fontSize=Math.max(11,11/scale)+'px';meta.style.display=n.kind!=='entry'&&n.r*scale>=46?'':'none';}
      const close=el.querySelector('.lw-collapse');if(close){close.querySelector('circle').setAttribute('r',Math.max(16,16/scale));close.querySelector('text').style.fontSize=Math.max(18,18/scale)+'px';}
      const names=el.querySelector('.lw-node-presence');if(names){names.style.display=n.r*scale>=55?'':'none';const texts=names.querySelectorAll('text');texts.forEach((text,i)=>{text.style.fontSize=12/scale+'px';text.setAttribute('y',n.y+(-3+i*14)/scale);});const shade=names.querySelector('rect');shade.setAttribute('y',n.y-14/scale);shade.setAttribute('height',90/scale);}
      const avatars=el.querySelector('.lw-node-portraits');if(avatars){
        for(const old of avatars.querySelectorAll('[data-avatar]'))if(!avatarKeys.has(n.id+'|'+old.dataset.avatar))old.remove();
        const sims=(n.presentSims||[]).slice(0,4).filter(s=>avatarKeys.has(n.id+'|'+s.id));
        sims.forEach((s,i)=>{let item=avatars.querySelector(`[data-avatar="${s.id}"]`);if(!item){item=document.createElementNS('http://www.w3.org/2000/svg','g');item.dataset.avatar=s.id;item.innerHTML=`<circle class="lw-portrait-ring" r="13" fill="#fff" stroke="${esc(s.colour)}"/><image href="/api/living/library/${encodeURIComponent(s.asset_id)}?variant=sprite" x="-12" y="-12" width="24" height="24" preserveAspectRatio="xMidYMin slice" clip-path="url(#${uid}-portrait)"/><title>${esc(s.name+' · '+livingPreviewSummary(s))}</title>`;item.onclick=e=>{e.stopPropagation();livingProfileDrawer(s.id).catch(fail);};item.ondblclick=e=>e.stopPropagation();avatars.appendChild(item);}item.setAttribute('transform',`translate(${n.x+(i-(sims.length-1)/2)*28/scale},${n.y-36/scale}) scale(${1/scale})`);});
      }
      let img=el.querySelector('.lw-circle-art image');if(!images.has(n.id)){img?.remove();continue;}
      if(!img){img=document.createElementNS('http://www.w3.org/2000/svg','image');img.setAttribute('href',n.thumbnail);img.setAttribute('x',n.x-n.r+6);img.setAttribute('y',n.y-n.r+6);img.setAttribute('width',n.r*2-12);img.setAttribute('height',n.r*2-12);img.setAttribute('preserveAspectRatio','xMidYMid slice');img.setAttribute('clip-path',`url(#${uid}-${n.index})`);el.querySelector('.lw-circle-art').appendChild(img);}
    }
  }
  function fit(id){
    viewFocus=id;
    const n=graph?.nodes.find(n=>n.id===id||n.placeId===id&&n.virtual),r=n?n.r+50:layout.radius+45;
    scale=Math.max(.08,Math.min(1.6,Math.min(wrap.clientWidth,wrap.clientHeight)/(r*2)));
    tx=wrap.clientWidth/2-(n?.x||0)*scale;ty=wrap.clientHeight/2-(n?.y||0)*scale;camera();
  }
  function render(){
    layout=lwCircleLayout(graph);const byId=new Map(graph.nodes.map(n=>[n.id,n]));graph.nodes.forEach((n,i)=>n.index=i);
    $('defs',root).innerHTML='<clipPath id="'+uid+'-portrait"><circle r="12"/></clipPath>'+graph.nodes.filter(n=>!n.expanded).map(n=>`<clipPath id="${uid}-${n.index}"><circle cx="${n.x}" cy="${n.y}" r="${n.r-6}"/></clipPath>`).join('');
    const groups=graph.nodes.filter(n=>n.expanded).sort((a,b)=>b.r-a.r).map(n=>`<g class="lw-circle-group" data-index="${n.index}" data-group="${esc(n.id)}"><circle class="lw-group-halo" cx="${n.x}" cy="${n.y}" r="${n.r+5}" style="--group-colour:${lwColour(n.id)}"/><circle class="lw-group-boundary" cx="${n.x}" cy="${n.y}" r="${n.r}" style="--group-colour:${lwColour(n.id)}"/><text class="lw-circle-label lw-group-label" x="${n.x}" y="${n.y-n.r+31}">${esc(n.name)}${n.kind==='building'?' · '+n.children.filter(c=>c.kind==='room').length+' Räume':''}</text><g class="lw-collapse" data-collapse="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.name)} schließen" transform="translate(${n.x+n.r*.48},${n.y-n.r+32})"><circle r="16"/><text y="5">−</text><title>Gruppe schließen</title></g></g>`).join('');
    const edges=graph.edges.map(e=>{
      const a=byId.get(e.from_id),b=byId.get(e.to_id);if(!a||!b)return '';
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ax=a.x+dx*a.r/len,ay=a.y+dy*a.r/len,bx=b.x-dx*b.r/len,by=b.y-dy*b.r/len;
      const bend=Math.min(32,len*.09),px=-dy/len*bend,py=dx/len*bend,d=`M${ax},${ay} C${ax+dx*.32+px},${ay+dy*.32+py} ${bx-dx*.32+px},${by-dy*.32+py} ${bx},${by}`;
      const colour=a.parent_id===b.parent_id?lwColour(a.parent_id||a.id):'#a1afba';
      return `<g class="lw-route-link" data-from="${a.index}" data-to="${b.index}" style="--route-colour:${colour}"><path class="lw-route-under" d="${d}"/><path class="lw-route" d="${d}"/><circle class="lw-route-junction" cx="${ax}" cy="${ay}" r="3"/><circle class="lw-route-junction" cx="${bx}" cy="${by}" r="3"/></g>`;
    }).join('');
    const nodeLabel=n=>{const parent=graph.nodes.find(p=>p.id===n.parent_id),prefix=parent?.name+' · ';const name=n.kind==='room'&&n.name.startsWith(prefix)?n.name.slice(prefix.length):n.name;return name.length>25?name.slice(0,24)+'…':name;};
    const nodes=graph.nodes.filter(n=>!n.expanded).map(n=>`<g class="lnode lw-circle-node ${n.anchored||n.simAnchors?'lw-has-anchor':''}" data-index="${n.index}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.name)}"><title>${esc(n.name)} · ${n.occupants} Sims${n.simAnchors?' · '+n.simAnchors+' Sim-Anker':''}${n.leaf?'':' · öffnen'}</title><circle class="lw-circle-frame" cx="${n.x}" cy="${n.y}" r="${n.r}" style="--group-colour:${lwColour(n.parent_id||n.id)}"/><g class="lw-circle-art"></g>${n.kind==='entry'?`<g class="lw-door-icon" transform="translate(${n.x},${n.y})"><path d="M-7 8V-8H7V8 M-9 8H9 M3 0h1"/></g>`:''}<text class="lw-circle-symbol" x="${n.x}" y="${n.y+5}">${n.kind==='entry'?'':n.kind==='street'?'↔':n.kind==='room'?'◇':n.landmark?'✦':n.kind==='building'?'⌂':'◉'}</text>${n.presentCount?`<g class="lw-node-presence"><rect x="${n.x-n.r+8}" y="${n.y-14}" width="${n.r*2-16}" height="90" rx="12" clip-path="url(#${uid}-${n.index})"/>${n.presentSims.map((s,i)=>`<text class="lw-presence-name" data-person="${esc(s.id)}" x="${n.x}" y="${n.y-3+i*14}" tabindex="0" role="button"><title>${esc(s.name)} · ${s.age}</title>${esc(s.name.length>20?s.name.slice(0,19)+'…':s.name)}</text>`).join('')}${n.overflow?`<text class="lw-presence-more" data-presence-more="${esc(n.placeId)}" x="${n.x}" y="${n.y+53}" tabindex="0" role="button" aria-label="Alle ${n.presentCount} Sims anzeigen">… +${n.overflow}</text>`:''}</g><g class="lw-node-portraits"></g>`:''}<text class="lw-circle-label" x="${n.x}" y="${n.y+n.r+18}">${esc(nodeLabel(n))}</text><text class="lw-circle-meta" x="${n.x}" y="${n.y+n.r+35}">${n.anchored?'⚓ Ort · ':''}${n.simAnchors?'⚓ '+n.simAnchors+' · ':''}${n.occupants} Sims</text>${!n.leaf?`<g class="lw-expand" data-expand="${esc(n.id)}" transform="translate(${n.x+n.r*.72},${n.y+n.r*.72})" tabindex="0" role="button" aria-label="${esc(n.name)} öffnen"><circle r="16"/><text y="5">+</text></g>`:''}${n.anchored||n.simAnchors?`<g class="lw-anchor-badge" transform="translate(${n.x+n.r*.72},${n.y-n.r*.72})"><circle r="15"/><text y="5">⚓</text></g>`:''}</g>`).join('');
    vp.innerHTML=groups+edges+nodes;
    $('[data-level]',root).textContent=graph.expanded.length?graph.expanded.length+' offene Gruppen':'Stadt · Nachbarschaften & öffentliche Orte';if(graph.omittedRoots)$('[data-level]',root).textContent+=' · weitere Stadtteile per Suche';
    const expandNode=n=>{touchBranch(n.id);open.add(n.id);load(n.id).catch(fail);};
    $$('[data-id]',vp).forEach(el=>{
      const n=byId.get(el.dataset.id),pick=()=>{if(moved)return;touchBranch(n.id);onSelect?.(n);if(!n.leaf&&!selectOnly)expandNode(n);else if(n.leaf)onPick?.({...n,id:n.placeId});};
      el.onclick=pick;el.ondblclick=e=>{e.preventDefault();if(moved)return;if(n.leaf&&n.asset_id)onOpen?.({...n,id:n.placeId});else if(!n.leaf)expandNode(n);};
      el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();moved=false;if(n.leaf&&n.asset_id&&onOpen)onOpen({...n,id:n.placeId});else if(!n.leaf)expandNode(n);else pick();}};
      el.oncontextmenu=e=>{e.preventDefault();livingPlaceModal(n.placeId);};
    });
    $$('[data-person]',vp).forEach(el=>{el.onclick=e=>{e.stopPropagation();livingProfileDrawer(el.dataset.person).catch(fail);};el.ondblclick=e=>e.stopPropagation();el.onkeydown=e=>{if(e.key==='Enter'){e.stopPropagation();livingProfileDrawer(el.dataset.person).catch(fail);}};});
    $$('[data-presence-more]',vp).forEach(el=>{const show=()=>livingPresenceModal(el.dataset.presenceMore,byId.get(el.closest('[data-id]').dataset.id).name).catch(fail);el.onclick=e=>{e.stopPropagation();show();};el.ondblclick=e=>e.stopPropagation();el.onkeydown=e=>{if(e.key==='Enter'){e.stopPropagation();show();}};});
    $$('[data-expand]',vp).forEach(el=>{el.onclick=e=>{e.stopPropagation();if(!moved)expandNode(byId.get(el.dataset.expand));};el.onkeydown=e=>{if(e.key==='Enter'){e.stopPropagation();expandNode(byId.get(el.dataset.expand));}};});
    $$('[data-collapse]',vp).forEach(el=>{const collapse=()=>{if(moved)return;const id=el.dataset.collapse,n=byId.get(id);for(const p of graph.nodes){let at=p;while(at){if(at.id===id){open.delete(p.id);break;}at=byId.get(at.parent_id);}}load(n.parent_id).catch(fail);};el.onclick=collapse;el.onkeydown=e=>{if(e.key==='Enter'){moved=false;collapse();}};});
    onChange?.(graph);
  }
  function touchBranch(id){const byId=new Map((graph?.nodes||[]).map(n=>[n.id,n])),branch=[];for(let at=byId.get(id);at;at=byId.get(at.parent_id))branch.unshift(at);for(const at of branch)if(at.expanded||!at.leaf)touch(at.id);touch(id);}
  function closeBranch(id,data){const byId=new Map(data.nodes.map(n=>[n.id,n]));for(const n of data.nodes){for(let at=n;at;at=byId.get(at.parent_id))if(at.id===id){open.delete(n.id);recent=recent.filter(p=>p!==n.id);break;}}open.delete(id);}
  async function load(nextFocus){
    const token=++request;let data,evicted=0;
    for(let retry=0;retry<25;retry++){
      data=await api(`/api/living/worlds/${worldId}/map?`+new URLSearchParams({expanded:JSON.stringify([...open].slice(-24)),...(nextFocus?{focus:nextFocus}:{})}));
      if(disposed||token!==request||!root.isConnected||S.world!==worldId)return;
      const protectedIds=new Set(data.ancestors.map(p=>p.id));if(nextFocus)protectedIds.add(nextFocus);
      const oldest=recent.find(id=>data.expanded.includes(id)&&!protectedIds.has(id));
      if((data.refused.length||data.nodes.filter(n=>!n.expanded&&n.asset_id).length>50)&&oldest){closeBranch(oldest,data);evicted++;continue;}
      break;
    }
    graph=data;open=new Set(data.expanded);recent=recent.filter(id=>open.has(id));for(const id of open)if(!recent.includes(id))recent.push(id);
    lwMapState.set(worldId,{focus:nextFocus||data.focus,expanded:[...open],order:[...recent]});render();fit(nextFocus);
    if(evicted)toast('Ältere Gruppen wurden zugeklappt · maximal 50 Thumbnails.');else if(data.refused.length)toast('Diese Gruppe ist für den Kartenausschnitt zu groß.');
  }
  const zoom=(factor,mx=wrap.clientWidth/2,my=wrap.clientHeight/2)=>{
    if(!graph)return;const next=Math.max(.05,Math.min(3,scale*factor));tx=mx-(mx-tx)*next/scale;ty=my-(my-ty)*next/scale;scale=next;camera();clearTimeout(zoomTimer);
    zoomTimer=setTimeout(()=>{
      if(disposed||!graph)return;
      if(factor<1){const small=graph.nodes.filter(n=>n.expanded&&n.r*scale<110);if(small.length){for(const n of small)open.delete(n.id);load().catch(fail);}}
      else {const x=(mx-tx)/scale,y=(my-ty)/scale,n=graph.nodes.filter(n=>!n.expanded&&!n.leaf&&n.r*scale>105&&Math.hypot(n.x-x,n.y-y)<n.r*1.5).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(n){touchBranch(n.id);open.add(n.id);load(n.id).catch(fail);}}
    },220);
  };
  $('[data-city]',root).onclick=()=>{open.clear();load().catch(fail);};$('[data-fit]',root).onclick=()=>fit();$('[data-plus]',root).onclick=()=>zoom(1.3);$('[data-minus]',root).onclick=()=>zoom(.77);
  wrap.onwheel=e=>{e.preventDefault();const rect=wrap.getBoundingClientRect();zoom(e.deltaY<0?1.14:.88,e.clientX-rect.left,e.clientY-rect.top);};
  wrap.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,tx,ty};moved=false;};
  wrap.onpointermove=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5){moved=true;wrap.setPointerCapture(e.pointerId);tx=drag.tx+e.clientX-drag.x;ty=drag.ty+e.clientY-drag.y;camera();}};
  wrap.onpointercancel=()=>drag=null;
  // Capture must not swallow the node's click. Release before native click dispatch.
  wrap.onpointerup=e=>{drag=null;if(wrap.hasPointerCapture(e.pointerId))wrap.releasePointerCapture(e.pointerId);};
  const imageObserver=new MutationObserver(records=>{if(records.some(r=>!vp.contains(r.target)))camera();});imageObserver.observe(document.body,{childList:true,subtree:true});
  const observer=new ResizeObserver(()=>{if(!root.isConnected){disposed=true;observer.disconnect();imageObserver.disconnect();cancelAnimationFrame(frame);clearTimeout(zoomTimer);}else if(graph)fit(viewFocus);});observer.observe(wrap);
  await load(focus||state.focus);
  const controller={reveal:async(result)=>{for(const p of result.path||[])if(!['country','city','room'].includes(p.kind)){open.add(p.id);touch(p.id);}await load(result.revealId);},expand:async id=>{touchBranch(id);open.add(id);await load(id);},fit:()=>fit(),dispose:()=>{disposed=true;request++;observer.disconnect();imageObserver.disconnect();cancelAnimationFrame(frame);clearTimeout(zoomTimer);},getGraph:()=>graph};root.livingMap=controller;return controller;
}
async function livingJump(target){
  if(livingJump.busy||stageState.advanceAbort&&$('#veil .thinking-veil'))return;livingJump.busy=true;
  try{stopNarration();stageState.pov=target;if(location.hash.includes('/stage'))await stageScreen();else nav(`#/stage?w=${S.world}`);}finally{livingJump.busy=false;}
}
function livingWorldJump(id){nav(`#/atlas?w=${S.world}&sim=${encodeURIComponent(id)}`);}
function livingBondsJump(id){nav(`#/bonds?w=${S.world}&sim=${encodeURIComponent(id)}`);}
async function livingAtlasScreen(){
  const data=await loadWorld();
  app.innerHTML=chrome('world',{worldTitle:'World',sub:data.world.title+' · die Stadt entdecken'})+`<main class="lw-world"><div class="lw-world-heading"><div><p class="eyebrow">DEINE LEBENDIGE WELT</p><h1>${esc(data.world.title)}</h1><p>Nachbarschaften öffnen, Häuser erkunden, Sims wiederfinden.</p></div><button class="btn btn-teal" id="lw-anchors">⚓ Anker verwalten</button><button class="btn btn-soft" id="lw-open-scene">Zur Bühne ↗</button></div><div class="lw-world-layout"><div id="lw-atlas" class="lw-atlas"></div><aside class="lw-world-sidebar"><label class="lw-search-label" for="lw-world-search">Orte & Sims finden</label><input id="lw-world-search" placeholder="Library, Schule, Name…" autocomplete="off"><div id="lw-world-results"></div><div class="lw-sidebar-heading"><h3>⚓ Deine Anker</h3><span id="lw-anchor-count"></span></div><p class="lw-sidebar-note">Aktueller Aufenthaltsort · Klick zeigt den Ort auf der Karte.</p><select id="lw-anchor-filter" aria-label="Anker filtern"><option value="all">Alle Anker</option><option value="sim">Sims</option><option value="place">Orte</option></select><div id="lw-world-anchors"></div><div id="lw-world-selection"></div></aside></div></main>`;
  bindChrome();$('#lw-anchors').onclick=livingAnchorModal;$('#lw-open-scene').onclick=()=>nav(`#/stage?w=${S.world}`);
  let map,timer,searchToken=0;const currentWorld=S.world,atlasRoot=$('#lw-atlas');
  const pick=(n,target={type:'location',id:n.placeId})=>{const panel=$('#lw-world-selection');panel.innerHTML=`<h3>${esc(n.name)}</h3><p>${esc(n.community?.character||(n.kind==='room'?'Raum · ':n.kind==='building'?'Gebäude · ':'Ort · ')+n.name)} · ${n.occupants} Sims${n.community?'<br><small>'+esc(n.community.ritual)+'</small>':''}</p>${!n.leaf?'<button class="btn btn-primary small" data-open-group>Gruppe öffnen +</button>':''}<button class="btn btn-teal small" data-details>Anker & Hintergrund</button>${n.presentCount!==undefined?`<div class="lw-selected-presence"><h4>Hier sind ${n.presentCount} Sims</h4>${n.presentSims.map(s=>`<button data-selected-person="${esc(s.id)}">${esc(s.name)} · ${esc(livingPreviewSummary(s))}</button>`).join('')}${n.overflow?'<button class="lw-selected-more" data-selected-more>… Alle '+n.presentCount+' anzeigen</button>':''}</div>`:''}${n.kind==='room'||n.kind==='street'||target.type==='character'?'<button class="btn btn-primary small" data-scene>Bühne öffnen ↗</button>':''}`;$$('[data-selected-person]',panel).forEach(el=>el.onclick=()=>livingProfileDrawer(el.dataset.selectedPerson).catch(fail));const more=$('[data-selected-more]',panel);if(more)more.onclick=()=>livingPresenceModal(n.placeId,n.name).catch(fail);const expand=$('[data-open-group]',panel);if(expand)expand.onclick=()=>map.expand(n.id).catch(fail);$('[data-details]',panel).onclick=()=>livingPlaceModal(n.placeId);const scene=$('[data-scene]',panel);if(scene)scene.onclick=()=>livingJump(target);};
  map=await livingGraph(atlasRoot,{...(lwMapState.get(S.world)||{}),onPick:pick,onSelect:pick,selectOnly:true,onOpen:n=>livingJump({type:'location',id:n.placeId}).catch(fail)});if(!atlasRoot.isConnected)return;
  const revealSim=new URLSearchParams(location.hash.split('?')[1]||'').get('sim');if(revealSim){const position=await api(lwPath()+`/sims/${encodeURIComponent(revealSim)}/position`);if(!atlasRoot.isConnected)return;await map.reveal(position);const node=map.getGraph().nodes.find(n=>n.placeId===position.revealId);if(node)pick({...node,name:position.name+' · '+node.name},position.target);}
  const {anchors}=await api(lwPath()+'/map/anchors');if(S.world!==currentWorld||!$('#lw-world-anchors'))return;
  const renderAnchors=()=>{const mode=$('#lw-anchor-filter').value,list=anchors.filter(a=>mode==='all'||a.type===mode);$('#lw-anchor-count').textContent=list.length;$('#lw-world-anchors').innerHTML=list.map((a,i)=>`<div class="lw-anchor-row"><button data-reveal-anchor="${i}"><span class="lw-anchor-dot" style="background:${a.colour||'#899ba0'}"></span><b>${esc(a.name)}</b><small>${esc(a.location)}${a.travelling?' · unterwegs'+(a.destination?' → '+esc(a.destination):''):''}</small></button><button class="lw-row-scene" data-jump-anchor="${i}" title="Auf der Bühne ansehen" aria-label="${esc(a.name)} auf der Bühne ansehen">↗</button></div>`).join('')||'<p class="lw-sidebar-note">Noch keine Anker. Wähle einen Ort oder setze einen Anker im Kopf eines Sims.</p>';$$('[data-reveal-anchor]').forEach(el=>el.onclick=()=>map.reveal(list[+el.dataset.revealAnchor]).catch(fail));$$('[data-jump-anchor]').forEach(el=>el.onclick=()=>livingJump(list[+el.dataset.jumpAnchor].target).catch(fail));};
  $('#lw-anchor-filter').onchange=renderAnchors;renderAnchors();
  $('#lw-world-search').oninput=e=>{clearTimeout(timer);const query=e.target.value,token=++searchToken;$('#lw-world-results').innerHTML=query?'<p class="lw-sidebar-note">Suche…</p>':'';timer=setTimeout(async()=>{try{const r=await api(lwPath()+'/map/search?q='+encodeURIComponent(query));if(token!==searchToken||S.world!==currentWorld||!atlasRoot.isConnected||!$('#lw-world-results'))return;$('#lw-world-results').innerHTML=r.results.map((n,i)=>`<button class="lw-search-result" data-result="${i}"><b>${esc(n.name)}</b><small>${esc(n.path.map(p=>p.name).slice(-3).join(' › '))}</small></button>`).join('')||(query?'<p class="lw-sidebar-note">Kein Treffer. Versuche einen Ortsnamen oder ein anderes Stichwort.</p>':'');$$('[data-result]').forEach(el=>el.onclick=async()=>{const n=r.results[+el.dataset.result];await map.reveal(n);const visible=map.getGraph().nodes.find(p=>p.placeId===n.revealId);if(visible)pick(n.type==='sim'?{...visible,name:n.name+' · '+visible.name}:visible,n.type==='sim'?n.target:undefined);});}catch(e){fail(e);}},180);};
}
async function livingAnchorNavigation(loc){
  const root=document.createElement('aside');root.className='lw-anchor-nav';root.innerHTML=`<button class="tchip" id="lw-anchor-prev" disabled aria-label="Vorheriger Anker" title="Vorheriger Anker (←)">←</button><div class="lw-anchor-current"><b id="lw-current-anchor"></b><small id="lw-current-anchor-location"></small></div><button class="tchip" id="lw-anchor-next" disabled aria-label="Nächster Anker" title="Nächster Anker (→)">→</button><select id="lw-play-anchor-filter" disabled aria-label="Ankernavigation"><option value="all">Alle Anker</option><option value="sim">Sims</option><option value="place">Orte</option></select><button class="tchip" id="lw-stage-anchors" title="Anker verwalten">⚓</button><button class="tchip" id="lw-atlas-open">World ↗</button><button class="tchip" id="lw-turbo" title="Advance all Sims without Storyteller calls">Turbo</button>`;$('#stage-root').after(root);
  $('#lw-turbo').onclick=()=>livingTurboModal().catch(fail);livingTurboBadge(root);$('#lw-stage-anchors').onclick=livingAnchorModal;$('#lw-atlas-open').onclick=()=>nav(`#/atlas?w=${S.world}`);
  const worldId=S.world,{anchors}=await api(lwPath()+'/map/anchors');if(!root.isConnected||worldId!==S.world)return;
  $('#lw-play-anchor-filter').value=localStorage.getItem('viv_lw_anchor_filter')||'all';
  let list=[],index=-1;
  const update=()=>{const mode=$('#lw-play-anchor-filter').value;localStorage.setItem('viv_lw_anchor_filter',mode);list=anchors.filter(a=>mode==='all'||a.type===mode);index=list.findIndex(a=>a.target.type===stageState.pov?.type&&a.target.id===stageState.pov?.id);const active=list[index];$('#lw-current-anchor').textContent=active?active.name+' · '+(index+1)+'/'+list.length:list.length+' Anker · ← → wechseln';$('#lw-current-anchor-location').textContent=active?.location||loc.name;$('#lw-anchor-prev').disabled=$('#lw-anchor-next').disabled=!list.length;};
  const cycle=direction=>{if(!list.length||!root.isConnected)return;const next=index<0?(direction>0?0:list.length-1):(index+direction+list.length)%list.length;livingJump(list[next].target).catch(fail);};
  $('#lw-play-anchor-filter').onchange=update;$('#lw-anchor-prev').onclick=()=>cycle(-1);$('#lw-anchor-next').onclick=()=>cycle(1);root.cycle=cycle;update();$('#lw-play-anchor-filter').disabled=false;
}
async function livingRefreshAnchorNavigation(){const root=document.querySelector('.lw-anchor-nav');if(root){const data=await loadWorld(true);if(root.isConnected){root.remove();await livingAnchorNavigation(data.locations[0]);}}else if(document.querySelector('#lw-atlas')&&location.hash.includes('/atlas'))await livingAtlasScreen();}
document.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight'].includes(e.key)||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('.modal-bg,.drawer-bg,.thinking-veil,#gmchat'))return;
  const root=document.querySelector('.lw-anchor-nav');if(root?.cycle&&location.hash.includes('/stage')){e.preventDefault();root.cycle(e.key==='ArrowRight'?1:-1);}
});
