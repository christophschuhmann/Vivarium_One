/* Same-origin sprite alpha masks keep transparent PNG margins from stealing a
   click from the visible person behind them. Cached, small masks stay local. */
'use strict';
const livingSpriteMasks=new WeakMap();
function livingPrepareHitMask(img){
  if(!img.complete||!img.naturalWidth)return;
  try{const canvas=document.createElement('canvas'),scale=Math.min(1,192/img.naturalWidth);canvas.width=Math.ceil(img.naturalWidth*scale);canvas.height=Math.ceil(img.naturalHeight*scale);const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,canvas.width,canvas.height);livingSpriteMasks.set(img,{width:canvas.width,height:canvas.height,pixels:c.getImageData(0,0,canvas.width,canvas.height).data});}catch{livingSpriteMasks.set(img,null);}
}
function livingSpriteAt(cast,x,y){
  const candidates=Array.from(cast.querySelectorAll('.stage-char')).reverse();
  // Reverse paint order; CSS does not give the selected sprite a higher z-index.
  for(const el of candidates){const img=el.querySelector('img'),rect=img?.getBoundingClientRect();if(!rect||x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)continue;
    const mask=livingSpriteMasks.get(img);if(!mask)continue;
    const px=Math.min(mask.width-1,Math.floor((x-rect.left)/rect.width*mask.width)),py=Math.min(mask.height-1,Math.floor((y-rect.top)/rect.height*mask.height));if(mask.pixels[(py*mask.width+px)*4+3]>32)return el;
  }return null;
}
function livingBindSceneSelection(){
 const cast=document.querySelector('#stage-cast');if(!cast)return;
 for(const el of cast.querySelectorAll('.stage-char'))el.style.cursor='inherit';
 for(const img of cast.querySelectorAll('.stage-char img')){livingPrepareHitMask(img);img.addEventListener('load',()=>livingPrepareHitMask(img),{once:true});}
 let openTimer;
 cast.addEventListener('click',e=>{if(e.target.closest('.bubble'))return;const tag=e.target.closest('.lw-name-tag'),picked=tag?.closest('.stage-char')||(e.detail===0?e.target.closest('.stage-char'):null)||livingSpriteAt(cast,e.clientX,e.clientY);e.stopImmediatePropagation();clearTimeout(openTimer);if(picked){if(e.detail>1||e.detail===0)mindModal(picked.dataset.id);else openTimer=setTimeout(()=>{if(cast.isConnected)mindModal(picked.dataset.id);},250);}},true);
 cast.addEventListener('pointermove',e=>{if(e.target.closest('.bubble,.lw-name-tag'))return;cast.style.cursor=livingSpriteAt(cast,e.clientX,e.clientY)?'pointer':'default';});
 for(const el of document.querySelectorAll('[data-pov]')){
   let timer;const id=el.dataset.pov;
   el.tabIndex=0;el.setAttribute('role','button');el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();mindModal(id);}else if(e.key===' '){e.preventDefault();el.click();}};
   el.title=(el.title||'Select this Sim')+' · Double-click to open Mind';
   el.onclick=e=>{clearTimeout(timer);if(e.detail>1)return;timer=setTimeout(()=>{if(el.isConnected){stopNarration();stageState.pov={type:'character',id};stageScreen();}},320);};
   el.ondblclick=async e=>{e.preventDefault();clearTimeout(timer);stopNarration();stageState.pov={type:'character',id};await stageScreen();mindModal(id);};
 }
}
