/* Living World originals stay German. Optional English is a local display layer. */
'use strict';
const livingGermanLabels=new Map(Object.entries({
 'Cast':'Figuren','World':'Welt','The Web':'Beziehungsnetz','Inner voice':'Innere Stimme','🕯 Inner voice':'🕯 Innere Stimme','Send':'Senden','close':'Schließen','✕ close':'✕ Schließen','Own API':'Eigener API-Key','HERE':'HIER','Thoughts':'Gedanken','💭 Thoughts':'💭 Gedanken','👁 Perceptions':'👁 Wahrnehmung','Senses not yet observed.':'Noch keine Sinneseindrücke protokolliert.','🔊 Hear their thought':'🔊 Gedanken anhören','📍 Move':'📍 Versetzen','📖 Full profile':'📖 Vollständiges Profil','👁 See through their eyes':'👁 Aus ihrer Sicht','World ↗':'Welt ↗','🧠 Mind':'🧠 Gedanken','No shifts yet — bonds evolve as the story runs.':'Beziehungen verändern sich im Laufe der Geschichte.','stats':'Zustand','conditions':'Bedingungen','Play':'Spielen','▶ Play':'▶ Spielen','Stats & Protokoll':'Zustand & Protokoll','Cast · alle Sims':'Figuren · alle Sims',
 'an inner dialogue — they\'re used to voices like yours. It may colour their next scene; clearing it removes every trace.':'Ein inneres Gespräch beeinflusst Gedanken und Gefühle. Die Weltzeit bleibt dabei stehen.',
 'Clear — the dialogue never happened; nothing reaches the story':'Inneres Gespräch löschen','School':'Schule','Teacher':'Lehrer/in','Researcher':'Forscher/in','Retired':'im Ruhestand','Pupil':'Schüler/in','Kindergarten child':'Kindergartenkind','Baker':'Bäcker/in','Gardener':'Gärtner/in','Carpenter':'Tischler/in','Civic planner':'Stadtplaner/in','Physician':'Arzt/Ärztin','Bookseller':'Buchhändler/in','Illustrator':'Illustrator/in','Programmer':'Programmierer/in'
}));
function livingGermanText(text){const trim=text.trim(),label=livingGermanLabels.get(trim);if(label)return text.replace(trim,label);
 return text.replace(/Inside (.+)'s mind$/, 'Gedanken von $1').replace(/^right now · /,'jetzt · ').replace(/ · at /,' · in ').replace(/^speak inside (.+)'s head — this moment$/,'Ein inneres Gespräch mit $1 · jetzt').replace(/^whisper to (.+)…$/,'Sprich mit $1…').replace(/Stats & Protokoll/,'Zustand & Protokoll').replace(/^Stats · /,'Zustand · ').replace(/^an inner dialogue /,'ein inneres Gespräch ').replace(/^…a familiar presence settles at the edge of (.+)'s thoughts, listening\.$/,'…eine vertraute Stimme begleitet $1 und hört zu.');
}
const livingDisplay={language:'de',translator:null,cache:new Map(),nodes:new WeakMap(),attributes:new WeakMap(),running:false,again:false,timer:null};
function livingLanguageActive(){return S.world&&S.livingWorld===S.world;}
function livingTranslateEligible(node){const parent=node.parentElement;return parent&&!parent.closest('script,style,svg,#lang-chip,[data-no-translate],input,textarea,option,code,pre')&&node.textContent.trim().length>1&&/[A-Za-zÄÖÜäöüß]/.test(node.textContent);}
async function livingApplyLanguage(){
 if(!livingLanguageActive())return;if(livingDisplay.running){livingDisplay.again=true;return;}livingDisplay.running=true;const language=livingDisplay.language;
 try{
  const nodes=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(livingTranslateEligible(node))nodes.push(node);}
  const chip=$('#lang-chip');if(chip&&chip.textContent!=='🌐 '+language.toUpperCase())chip.textContent='🌐 '+language.toUpperCase();document.documentElement.lang=livingDisplay.language;
  for(const node of nodes){if(!node.isConnected||!livingLanguageActive())continue;
   let state=livingDisplay.nodes.get(node);if(state&&node.textContent===state.displayed){if(state.language===livingDisplay.language)continue;}else state={original:livingGermanText(node.textContent)};
   let displayed=state.original;
   if(livingDisplay.language==='en'&&livingDisplay.translator&&displayed.trim().length<6000){const key=displayed.trim();let translated=livingDisplay.cache.get(key);if(!translated){translated=await livingDisplay.translator.translate(key);livingDisplay.cache.set(key,translated);if(livingDisplay.cache.size>1000)livingDisplay.cache.delete(livingDisplay.cache.keys().next().value);}displayed=displayed.replace(key,translated);}
   if(language!==livingDisplay.language){livingDisplay.again=true;break;}if(!node.isConnected||!livingLanguageActive())continue;state.displayed=displayed;state.language=livingDisplay.language;livingDisplay.nodes.set(node,state);if(node.textContent!==displayed)node.textContent=displayed;
  }
  // Translate display hints without ever editing input values or stored records.
  for(const el of $$('[placeholder],[title],[aria-label]')){if(el.closest('svg,[data-no-translate]')||el.id==='lang-chip')continue;let values=livingDisplay.attributes.get(el)||{};
   for(const attr of ['placeholder','title','aria-label']){const current=el.getAttribute(attr);if(!current)continue;let item=values[attr];if(!item||current!==item.displayed)item={original:livingGermanText(current)};let displayed=item.original;
    if(language==='en'&&livingDisplay.translator){let translated=livingDisplay.cache.get(displayed);if(!translated){translated=await livingDisplay.translator.translate(displayed);livingDisplay.cache.set(displayed,translated);if(livingDisplay.cache.size>1000)livingDisplay.cache.delete(livingDisplay.cache.keys().next().value);}displayed=translated;}
    if(language!==livingDisplay.language){livingDisplay.again=true;break;}values[attr]={original:item.original,displayed};if(el.getAttribute(attr)!==displayed)el.setAttribute(attr,displayed);
   }livingDisplay.attributes.set(el,values);
  }
  for(const label of $$('.lw-bond-central')){const value=language==='en'?'CENTER':'MITTELPUNKT';if(label.textContent!==value)label.textContent=value;}

 }catch(error){livingDisplay.language='de';livingDisplay.translator?.destroy?.();livingDisplay.translator=null;localStorage.removeItem('viv_living_display');livingDisplay.again=true;toast('Lokale Übersetzung nicht verfügbar. Die deutschen Originaltexte werden angezeigt.','err');}
 finally{livingDisplay.running=false;if(livingDisplay.again){livingDisplay.again=false;livingQueueLanguage();}}
}
function livingQueueLanguage(){clearTimeout(livingDisplay.timer);livingDisplay.timer=setTimeout(livingApplyLanguage,30);}
async function livingLanguageModal(){
 const available='Translator' in window,m=lwModal('Sprache & Anzeige','Die Welt und ihre Protokolle werden auf Deutsch geführt.',`<p>Deutsch zeigt Originaltexte und passende deutsche Feldbeschreibungen. Englisch übersetzt die sichtbaren Texte lokal im Browser; Originale, Simulation und Audio bleiben Deutsch.</p><div class="lw-language-options"><button class="btn btn-teal" id="lw-language-de">Deutsch · Original</button><button class="btn btn-soft" id="lw-language-en" ${available?'':'disabled'}>English · lokale Übersetzung</button></div><p id="lw-language-status">${available?'Beim ersten Mal kann der Browser ein Sprachpaket herunterladen. Es werden keine Spieltexte an einen Übersetzungsdienst gesendet.':'Dieser Browser bietet keine lokale Translator API. Die deutsche Darstellung bleibt verfügbar; auf unterstütztem Desktop-Chrome kannst du Englisch aktivieren.'}</p>`,640);
 $('#lw-language-de',m).onclick=()=>{livingDisplay.language='de';localStorage.removeItem('viv_living_display');m.remove();livingQueueLanguage();};
 $('#lw-language-en',m).onclick=async e=>{e.target.disabled=true;const status=$('#lw-language-status',m);try{status.textContent='Lokale Übersetzung wird vorbereitet…';const translator=await Translator.create({sourceLanguage:'de',targetLanguage:'en',monitor:monitor=>monitor.addEventListener('downloadprogress',e=>status.textContent='Sprachpaket: '+Math.round(e.loaded*100)+'%')});livingDisplay.translator?.destroy?.();livingDisplay.translator=translator;livingDisplay.language='en';localStorage.setItem('viv_living_display','en');m.remove();livingQueueLanguage();}catch(error){status.textContent='Das Sprachpaket ist derzeit nicht verfügbar. Deutsch bleibt aktiv.';e.target.disabled=false;}};
}
new MutationObserver(records=>{if(livingLanguageActive()&&records.some(r=>r.type==='childList'||r.type==='characterData'))livingQueueLanguage();}).observe(document.body,{subtree:true,childList:true,characterData:true});
// Language packs requiring a download are only started by the user's explicit click.
if(localStorage.getItem('viv_living_display')==='en'&&'Translator' in window)Translator.availability({sourceLanguage:'de',targetLanguage:'en'}).then(async status=>{if(status==='available'){livingDisplay.translator=await Translator.create({sourceLanguage:'de',targetLanguage:'en'});livingDisplay.language='en';livingQueueLanguage();}}).catch(()=>{});
