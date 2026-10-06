// A separate storage view inside Settings; no operator login needed for personal files.
window.VivariumStorage={
  async mount(box,{api,esc,toast,onChange=async()=>{}}) {
    const size=value=>{const units=['B','KB','MB','GB','TB'];let i=0;while(value>=1024&&i<units.length-1){value/=1024;i++;}return `${value.toFixed(i?1:0)} ${units[i]}`;};
    let offset=0,unused=false,kind='',selected=new Set(),loaded=[];
    const download=url=>{const link=document.createElement('a');link.href=url;link.download='';document.body.appendChild(link);link.click();link.remove();};
    const action=async(button,work)=>{button.disabled=true;try{await work();}catch(error){toast(error.message,'err');}finally{if(button.isConnected)button.disabled=false;}};
    async function render() {
      box.innerHTML='<p role="status">Reading your storage…</p>';
      try {
        const [summary,page]=await Promise.all([api('/api/storage'),api(`/api/storage/assets?offset=${offset}&limit=30&unused=${unused?'1':'0'}&kind=${encodeURIComponent(kind)}`)]);
        loaded=page.assets;
        box.innerHTML=`<div class="studio-intro"><span class="studio-eyebrow">YOUR LIBRARY</span><h2>Storage & scenarios</h2><p>Keep a backup, make an independent copy, or free space. These controls apply to your own account.</p></div>
          <div class="storage-metrics"><article><small>Your assets</small><b>${size(summary.assets.bytes)}</b><span>${summary.assets.count} files · ${size(summary.assets.unusedBytes)} unused</span></article><article><small>Your scenarios</small><b>${summary.projects.count}</b><span>${size(summary.projects.bytes)} of story & state data</span></article><article><small>Shared music library</small><b>${size(summary.music.bytes)}</b><span>${summary.music.ready?summary.music.available_tracks+' playable tracks':'Music service offline'}</span></article><article><small>Free disk space</small><b>${size(summary.volume.freeBytes)}</b><span>${size(summary.volume.totalBytes)} total volume capacity</span></article></div>
          <section class="storage-section"><div class="studio-section-heading"><h3>Scenarios</h3><button class="btn btn-ghost small" data-storage-refresh>Refresh</button></div>
          ${summary.worlds.length?summary.worlds.map(world=>`<article class="storage-row"><div><b>${esc(world.title)}</b><small>Tick ${world.tick_index} · ${world.assets} assets · ${size(world.assetBytes)} media + ${size(world.projectBytes)} story data</small></div><div class="studio-actions"><a class="btn btn-soft small" href="/api/worlds/${encodeURIComponent(world.id)}/export/zip" download>Export ZIP</a><button class="btn btn-soft small" data-duplicate-world="${esc(world.id)}">Duplicate</button><button class="btn btn-ghost small storage-delete" data-delete-world="${esc(world.id)}">Delete</button></div></article>`).join(''):'<p>No scenarios yet. Create one from the home screen.</p>'}
          <label class="storage-import">Restore a scenario ZIP <input type="file" data-import-world accept=".zip"></label><p class="storage-note">An exported ZIP contains the full scenario, timelines, cast and linked assets. Duplicates copy their media files. ${esc(summary.note)}</p></section>
          <section class="storage-section"><div class="studio-section-heading"><h3>Assets</h3><button class="btn btn-soft small" data-export-assets ${selected.size?'':'disabled'}>Export selected ZIP (${selected.size})</button></div>
          <div class="storage-filters"><label><input type="checkbox" data-unused ${unused?'checked':''}> Only unused</label><label>Type <select data-kind><option value="">All</option>${['background','portrait','cutout','cover','audio','music','voice_ref','asr_input'].map(type=>`<option value="${type}" ${kind===type?'selected':''}>${type}</option>`).join('')}</select></label><label><input type="checkbox" data-select-page> Select this page</label></div>
          <div class="storage-assets">${page.assets.map(asset=>`<article class="storage-asset"><label><input type="checkbox" data-select-asset="${esc(asset.id)}" ${selected.has(asset.id)?'checked':''}> <span>${esc(asset.kind)} · ${size(asset.bytes)}</span></label>${asset.mime.startsWith('image/')&&!asset.missing?`<img src="/api/assets/${encodeURIComponent(asset.id)}?w=320" loading="lazy" alt="${esc(asset.kind)}">`:asset.mime.startsWith('audio/')&&!asset.missing?`<audio controls preload="none" src="/api/assets/${encodeURIComponent(asset.id)}"></audio>`:'<div class="storage-file">'+(asset.missing?'File missing':esc(asset.mime))+'</div>'}<small>${esc(asset.file)}</small><small>${asset.usedBy.length?'Used by '+asset.usedBy.map(world=>esc(world.title)).join(', '):'Unused · can be removed'}</small><div class="studio-actions"><a class="btn btn-soft small" href="/api/assets/${encodeURIComponent(asset.id)}" download="${esc(asset.file)}">Download</a><button class="btn btn-soft small" data-duplicate-asset="${esc(asset.id)}" ${asset.missing?'disabled':''}>Duplicate</button><button class="btn btn-ghost small storage-delete" data-delete-asset="${esc(asset.id)}" ${asset.usedBy.length?'disabled title="A scenario still uses this asset"':''}>Delete</button></div></article>`).join('')}</div>
          <div class="storage-pager"><button class="btn btn-soft small" data-prev ${offset?'':'disabled'}>Previous</button><span>${page.total?offset+1:0}–${Math.min(offset+page.limit,page.total)} of ${page.total}</span><button class="btn btn-soft small" data-next ${offset+page.limit<page.total?'':'disabled'}>Next</button></div><p class="storage-note">Assets used by a scenario or saved scene cannot be deleted separately. Removing an unused asset also removes its thumbnail cache.</p></section>
          <section class="storage-section"><h3>Shared libraries & server</h3><p>Music: ${summary.music.ready?esc(summary.music.engine):'not ready'} · <a href="https://huggingface.co/datasets/laion/laion-tunes-rpg-music" target="_blank" rel="noopener">LAION-Tunes RPG Music</a> · CC BY 4.0</p><p>Pre-generated image library: ${size(summary.assetLibrary.bytes)} · shared database: ${size(summary.database.bytes)}</p>
          ${summary.music.canManage?`<div class="studio-actions"><a class="btn btn-soft small" href="/api/storage/music/export" download>Export music ZIP</a><button class="btn btn-soft small" data-music-cache ${summary.music.ready&&summary.music.managed?'':'disabled'}>Rebuild search cache</button><button class="btn btn-ghost small storage-delete" data-music-remove ${summary.music.ready&&summary.music.managed?'':'disabled'}>Remove music library</button></div><small>Shared music changes affect this installation. After removal, run npm run music:setup and restart to restore it.</small>`:'<small>The shared library is managed by the installation owner. Your assets and scenarios remain independent.</small>'}</section>`;
        const $=selector=>box.querySelector(selector),all=selector=>[...box.querySelectorAll(selector)];
        $('[data-storage-refresh]').onclick=()=>render();
        for(const button of all('[data-duplicate-world]'))button.onclick=()=>action(button,async()=> {
          const world=summary.worlds.find(w=>w.id===button.dataset.duplicateWorld),title=prompt('Name the independent copy:',world.title+' · copy');if(!title)return;
          await api(`/api/worlds/${encodeURIComponent(world.id)}/duplicate`,{method:'POST',body:{title}});toast('Independent scenario copied.');await onChange();await render();
        });
        for(const button of all('[data-delete-world]'))button.onclick=()=>action(button,async()=> {
          const world=summary.worlds.find(w=>w.id===button.dataset.deleteWorld);
          if(!confirm(`Delete “${world.title}” permanently, including its history and unshared media? Export a ZIP first if you want a backup.`))return;
          await api(`/api/worlds/${encodeURIComponent(world.id)}`,{method:'DELETE'});toast('Scenario removed.');await onChange();await render();
        });
        $('[data-import-world]').onchange=async event=> {
          const file=event.target.files[0];if(!file)return;event.target.disabled=true;
          try{const body=new FormData();body.append('file',file);await api('/api/worlds/import',{method:'POST',body});toast('Scenario restored as a new copy.');await onChange();await render();}
          catch(error){toast(error.message,'err');event.target.disabled=false;}
        };
        const updateSelection=()=>{const button=$('[data-export-assets]');button.disabled=!selected.size;button.textContent=`Export selected ZIP (${selected.size})`;};
        for(const checkbox of all('[data-select-asset]'))checkbox.onchange=()=>{checkbox.checked?selected.add(checkbox.dataset.selectAsset):selected.delete(checkbox.dataset.selectAsset);updateSelection();};
        $('[data-select-page]').onchange=event=>{for(const checkbox of all('[data-select-asset]')){checkbox.checked=event.target.checked;checkbox.onchange();}};
        $('[data-export-assets]').onclick=event=>action(event.currentTarget,async()=>{
          const {url}=await api('/api/storage/assets/export-link',{method:'POST',body:{ids:[...selected]}});download(url);
        });
        $('[data-unused]').onchange=event=>{unused=event.target.checked;offset=0;render();};
        $('[data-kind]').onchange=event=>{kind=event.target.value;offset=0;render();};
        $('[data-prev]').onclick=()=>{offset=Math.max(0,offset-30);render();};$('[data-next]').onclick=()=>{offset+=30;render();};
        for(const button of all('[data-duplicate-asset]'))button.onclick=()=>action(button,async()=>{await api(`/api/storage/assets/${encodeURIComponent(button.dataset.duplicateAsset)}/duplicate`,{method:'POST'});toast('Asset copied.');await render();});
        for(const button of all('[data-delete-asset]'))button.onclick=()=>action(button,async()=> {
          const id=button.dataset.deleteAsset;if(!confirm('Permanently delete this unused asset and its previews?'))return;
          await api(`/api/storage/assets/${encodeURIComponent(id)}`,{method:'DELETE',body:{confirm:id}});selected.delete(id);toast('Asset removed.');await render();
        });
        $('[data-music-cache]')?.addEventListener('click',event=>action(event.currentTarget,async()=>{await api('/api/storage/music/manage',{method:'POST',body:{action:'rebuild-cache'}});toast('Music search cache rebuilt.');await render();}));
        $('[data-music-remove]')?.addEventListener('click',event=>action(event.currentTarget,async()=>{if(prompt('This removes the shared music files. Type DELETE MUSIC LIBRARY to confirm.')!=='DELETE MUSIC LIBRARY')return;await api('/api/storage/music/manage',{method:'POST',body:{action:'remove-library',confirm:'DELETE MUSIC LIBRARY'}});toast('Music library removed.');await render();}));
      } catch(error){box.textContent=error.message;}
    }
    await render();
  }
};
