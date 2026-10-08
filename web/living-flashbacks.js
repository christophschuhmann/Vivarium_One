// Read-only highlights, loaded one at a time. The saved clock never moves here.
let livingReel=null;
function livingStopReel(){if(livingReel){livingReel.cancelled=true;livingReel.controller.abort();stopNarration();ivSpeakRun?.stop();}}
async function livingPlayFlashbacks(){
  if(livingReel)return;
  const entries=S.worldData?.flashbacks||[];if(!entries.length)return;
  const root=$('#stage-root'),world=S.world,hash=location.hash,pov={...stageState.pov};
  const run=livingReel={cancelled:false,controller:new AbortController()},active=()=>livingReel===run&&!run.cancelled&&S.world===world&&location.hash===hash&&$('#stage-root')===root;
  stopNarration();ivSpeakRun?.stop();root.classList.add('lw-reel-active');
  document.querySelectorAll('#pc,#pl,[data-places],[data-delta],#customdelta,#advance,#intervene,#lw-recap').forEach(el=>el.disabled=true);$('#stage-bottom')?.classList.remove('collapsed');
  const hud=document.createElement('div');hud.id='cine-hud';hud.className='lw-reel-hud';
  hud.innerHTML='<span id="cine-count" class="glasschip">Earlier in this interval</span><span id="cine-hint" class="glasschip" style="display:none">Read at your own pace →</span><button class="glasschip" id="cine-next">Next scene →</button><button class="glasschip" id="cine-exit">Back to now</button>';
  root.append(hud);$('#cine-next',hud).onclick=()=>{ivSpeakRun?.stop();stopNarration();};$('#cine-exit',hud).onclick=()=>livingStopReel();
  let complete=false;
  try{
    for(let i=0;i<entries.length&&active();i++){
      const entry=entries[i];$('#cine-count',hud).textContent=`Earlier · ${i+1} / ${entries.length} · ${entry.title}`;
      const scene=await api(`/api/living/worlds/${world}/flashbacks/${encodeURIComponent(entry.beat_id)}/${encodeURIComponent(entry.sim_id)}/${entry.ordinal}`,{signal:run.controller.signal});
      if(!active())break;
      // One frame's sprites/background in memory. The following frame replaces
      // these DOM nodes; a town's entire thumbnail library is never prefetched.
      const data={characters:scene.characters,locations:scene.locations};
      root.classList.add('lw-reel-transition');await sleep(180);if(!active())break;
      renderCineScene({...scene.tick,idx:'flashback'},data);root.classList.remove('lw-reel-transition');
      $('.story-meta span').textContent=`Earlier · ${fmtClock(scene.tick.sim_time)} · ${scene.title}`;
      await playSceneNarration(scene.tick,data);
    }
    complete=active();
  }catch(error){if(error.name!=='AbortError')fail(error);}
  finally{
    const restore=S.world===world&&location.hash===hash&&$('#stage-root')===root;
    if(livingReel===run)livingReel=null;
    hud.remove();root.classList.remove('lw-reel-active','lw-reel-transition');stopNarration();ivSpeakRun?.stop();
    if(restore){stageState.pov=pov;S.worldData=null;stageState.justAdvanced=complete;await stageScreen();toast('Back to now · the saved world has not been rewound.');}
  }
}
