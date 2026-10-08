// Read-only scene playback. Seeking changes the frame, never the saved clock.
let livingReel=null;
function livingStopReel(){if(livingReel){livingReel.cancelled=true;livingReel.fetch?.abort();stopNarration();ivSpeakRun?.stop();}}
async function livingPlayFlashbacks({entries=null,startIndex=0}={}){
  if(livingReel)return;
  entries=entries||(S.worldData?.sceneManifest?.length?S.worldData.sceneManifest:S.worldData?.flashbacks)||[];if(!entries.length)return;
  const root=$('#stage-root'),world=S.world,hash=location.hash,pov={...stageState.pov};
  const run=livingReel={cancelled:false,target:Math.max(0,Math.min(entries.length-1,startIndex)),index:-1,revision:0},active=()=>livingReel===run&&!run.cancelled&&S.world===world&&location.hash===hash&&$('#stage-root')===root;
  stopNarration();ivSpeakRun?.stop();root.classList.add('lw-reel-active');
  document.querySelectorAll('#pc,#pl,[data-places],[data-delta],#customdelta,#advance,#intervene,#lw-recap,#lw-scenes').forEach(el=>el.disabled=true);$('#stage-bottom')?.classList.remove('collapsed');
  const hud=document.createElement('div');hud.id='cine-hud';hud.className='lw-reel-hud';
  hud.innerHTML=`<span id="cine-count" class="glasschip">Recorded scenes</span><span id="cine-hint" class="glasschip" style="display:none">Read at your own pace →</span><div class="lw-reel-controls"><button class="glasschip" id="cine-prev">← Previous</button><button class="glasschip" id="cine-next">Next scene →</button><button class="glasschip" id="cine-exit">Back to now</button></div><label class="lw-reel-seek">Scene <input id="cine-seek" aria-label="Seek recorded scene" type="range" min="0" max="${entries.length-1}" value="${run.target}" step="1"></label>`;
  root.append(hud);
  const seek=index=>{run.target=Math.max(0,Math.min(entries.length,index));run.revision++;run.fetch?.abort();ivSpeakRun?.stop();stopNarration();};
  $('#cine-prev',hud).onclick=()=>seek(run.index-1);$('#cine-next',hud).onclick=()=>seek(run.index+1);$('#cine-seek',hud).oninput=e=>seek(Number(e.target.value));$('#cine-exit',hud).onclick=livingStopReel;
  const keyboard=e=>{if(e.target.closest('input,textarea,select,.modal-bg'))return;if(e.key==='ArrowLeft'){e.preventDefault();seek(run.index-1);}if(e.key==='ArrowRight'){e.preventDefault();seek(run.index+1);}if(e.key==='Escape')livingStopReel();};document.addEventListener('keydown',keyboard);
  try{
    while(active()&&run.target<entries.length){
      const i=run.index=run.target,revision=run.revision,entry=entries[i];run.fetch=new AbortController();
      $('#cine-prev',hud).disabled=i===0;$('#cine-seek',hud).value=i;$('#cine-count',hud).textContent=`Recorded scene ${i+1} / ${entries.length} · ${entry.title}`;
      try{
        const url=entry.key?`/api/living/worlds/${world}/history/${encodeURIComponent(entry.beatId)}/scenes/${encodeURIComponent(entry.key)}`:`/api/living/worlds/${world}/flashbacks/${encodeURIComponent(entry.beat_id)}/${encodeURIComponent(entry.sim_id)}/${entry.ordinal}`;
        const scene=await api(url,{signal:run.fetch.signal});if(!active()||run.revision!==revision)continue;
        const data={characters:scene.characters,locations:scene.locations,visibleCastLimit:8};
        renderCineScene({...scene.tick,idx:'recorded'},data);$('.story-meta span').textContent=`Recorded · ${fmtClock(scene.tick.sim_time)} · ${scene.title}`;
        const note=$('.lw-episode-note');if(note)note.textContent='Recorded scene · ← / → or the slider moves through the film. Back to now returns to the live world.';
        $('#storylines')?.scrollTo({top:0});
        await playSceneNarration(scene.tick,data);
        if(run.revision===revision)run.target=i+1;
      }catch(e){if(e.name==='AbortError'&&(run.revision!==revision||!active()))continue;throw e;}
    }
  }catch(error){if(error.name!=='AbortError')fail(error);}
  finally{
    const restore=S.world===world&&location.hash===hash&&$('#stage-root')===root;
    if(livingReel===run)livingReel=null;
    run.fetch?.abort();document.removeEventListener('keydown',keyboard);hud.remove();root.classList.remove('lw-reel-active');stopNarration();ivSpeakRun?.stop();
    // Returning from replay must not automatically read the same landing scene again.
    if(restore){stageState.pov=pov;S.worldData=null;stageState.justAdvanced=false;await stageScreen();}
  }
}
