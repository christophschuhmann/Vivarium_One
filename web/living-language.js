/* English defaults; stored journals preserve their original wording. */
'use strict';
const livingGermanLabels=new Map(Object.entries({
 'Cast':'Figuren','World':'Welt','The Web':'Beziehungsnetz','Inner voice':'Innere Stimme','🕯 Inner voice':'🕯 Innere Stimme','Send':'Senden','close':'Schließen','✕ close':'✕ Schließen','Own API':'Eigener API-Key','HERE':'HIER','Thoughts':'Gedanken','💭 Thoughts':'💭 Gedanken','👁 Perceptions':'👁 Wahrnehmung','Senses not yet observed.':'Noch keine Sinneseindrücke protokolliert.','🔊 Hear their thought':'🔊 Gedanken anhören','📍 Move':'📍 Versetzen','📖 Full profile':'📖 Vollständiges Profil','👁 See through their eyes':'👁 Aus ihrer Sicht','World ↗':'Welt ↗','🧠 Mind':'🧠 Gedanken','No shifts yet — bonds evolve as the story runs.':'Beziehungen verändern sich im Laufe der Geschichte.','stats':'Zustand','conditions':'Bedingungen','Play':'Spielen','▶ Play':'▶ Spielen','Stats & Protokoll':'Zustand & Protokoll','Cast · alle Sims':'Figuren · alle Sims',
 'an inner dialogue — they\'re used to voices like yours. It may colour their next scene; clearing it removes every trace.':'Ein inneres Gespräch beeinflusst Gedanken und Gefühle. Die Weltzeit bleibt dabei stehen.',
 'Clear — the dialogue never happened; nothing reaches the story':'Inneres Gespräch löschen','School':'Schule','Teacher':'Lehrer/in','Researcher':'Forscher/in','Retired':'im Ruhestand','Pupil':'Schüler/in','Kindergarten child':'Kindergartenkind','Baker':'Bäcker/in','Gardener':'Gärtner/in','Carpenter':'Tischler/in','Civic planner':'Stadtplaner/in','Physician':'Arzt/Ärztin','Bookseller':'Buchhändler/in','Illustrator':'Illustrator/in','Programmer':'Programmierer/in'
}));
function livingGermanText(text){const trim=text.trim(),label=livingGermanLabels.get(trim);if(label)return text.replace(trim,label);
 return text.replace(/Inside (.+)'s mind$/, 'Gedanken von $1').replace(/^right now · /,'jetzt · ').replace(/ · at /,' · in ').replace(/^speak inside (.+)'s head — this moment$/,'Ein inneres Gespräch mit $1 · jetzt').replace(/^whisper to (.+)…$/,'Sprich mit $1…').replace(/Stats & Protokoll/,'Zustand & Protokoll').replace(/^Stats · /,'Zustand · ').replace(/^an inner dialogue /,'ein inneres Gespräch ').replace(/^…a familiar presence settles at the edge of (.+)'s thoughts, listening\.$/,'…eine vertraute Stimme begleitet $1 und hört zu.');
}
const livingDisplay={language:localStorage.getItem('viv_living_display')||'en',translator:null,cache:new Map(),nodes:new WeakMap(),attributes:new WeakMap(),running:false,again:false,timer:null};
function livingLanguageActive(){return S.world&&S.livingWorld===S.world;}
function livingTranslateEligible(node){const parent=node.parentElement;return parent&&!parent.closest('script,style,svg,#lang-chip,[data-no-translate],input,textarea,option:not([value]),code,pre')&&node.textContent.trim().length>1&&/[A-Za-zÄÖÜäöüß]/.test(node.textContent);}
async function livingApplyLanguage(){
 if(!livingLanguageActive())return;if(livingDisplay.running){livingDisplay.again=true;return;}livingDisplay.running=true;const language=livingDisplay.language;
 try{
  const nodes=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(livingTranslateEligible(node))nodes.push(node);}
  const chip=$('#lang-chip');if(chip&&chip.textContent!=='🌐 '+language.toUpperCase())chip.textContent='🌐 '+language.toUpperCase();document.documentElement.lang=livingDisplay.language;
  for(const node of nodes){if(!node.isConnected||!livingLanguageActive())continue;
   let state=livingDisplay.nodes.get(node);if(state&&node.textContent===state.displayed){if(state.language===livingDisplay.language)continue;}else state={original:node.textContent};
   let displayed=language==='en'?livingEnglishLabel(state.original):livingGermanText(state.original);
   if(livingDisplay.language==='en'&&livingDisplay.translator&&displayed===state.original&&/\b(ich|nicht|eine|einen|werden|kann|möchte|Meine|Keine)\b|[äöüß]/i.test(displayed)&&displayed.trim().length<6000){const key=displayed.trim();let translated=livingDisplay.cache.get(key);if(!translated){translated=await livingDisplay.translator.translate(key);livingDisplay.cache.set(key,translated);if(livingDisplay.cache.size>1000)livingDisplay.cache.delete(livingDisplay.cache.keys().next().value);}displayed=displayed.replace(key,translated);}
   if(language!==livingDisplay.language){livingDisplay.again=true;break;}if(!node.isConnected||!livingLanguageActive())continue;state.displayed=displayed;state.language=livingDisplay.language;livingDisplay.nodes.set(node,state);if(node.textContent!==displayed)node.textContent=displayed;
  }
  // Translate display hints without ever editing input values or stored records.
  for(const el of $$('[placeholder],[title],[aria-label]')){if(el.closest('svg,[data-no-translate]')||el.id==='lang-chip')continue;let values=livingDisplay.attributes.get(el)||{};
   for(const attr of ['placeholder','title','aria-label']){const current=el.getAttribute(attr);if(!current)continue;let item=values[attr];if(!item||current!==item.displayed)item={original:current};let displayed=language==='en'?livingEnglishLabel(item.original):livingGermanText(item.original);
    if(language==='en'&&livingDisplay.translator&&displayed===item.original&&/\b(nicht|eine|einen|werden|kann)\b|[äöüß]/i.test(displayed)){let translated=livingDisplay.cache.get(displayed);if(!translated){translated=await livingDisplay.translator.translate(displayed);livingDisplay.cache.set(displayed,translated);if(livingDisplay.cache.size>1000)livingDisplay.cache.delete(livingDisplay.cache.keys().next().value);}displayed=translated;}
    if(language!==livingDisplay.language){livingDisplay.again=true;break;}values[attr]={original:item.original,displayed};if(el.getAttribute(attr)!==displayed)el.setAttribute(attr,displayed);
   }livingDisplay.attributes.set(el,values);
  }
  for(const label of $$('.lw-bond-central')){const value=language==='en'?'CENTER':'MITTELPUNKT';if(label.textContent!==value)label.textContent=value;}

 }catch(error){livingDisplay.language='en';livingDisplay.translator?.destroy?.();livingDisplay.translator=null;localStorage.removeItem('viv_living_display');livingDisplay.again=true;toast('Local translation is unavailable. English labels remain available; older passages retain their original language.','err');}
 finally{livingDisplay.running=false;if(livingDisplay.again){livingDisplay.again=false;livingQueueLanguage();}}
}
function livingQueueLanguage(){clearTimeout(livingDisplay.timer);livingDisplay.timer=setTimeout(livingApplyLanguage,30);}
async function livingLanguageModal(){
 const m=lwModal('Language & reading','English is the default for the interface and new stories.',`<p>Existing journal entries keep their original wording. Language selection changes the display and the language requested for conversations.</p><div class="lw-language-options"><button class="btn btn-teal" id="lw-language-en">English</button><button class="btn btn-soft" id="lw-language-de">Deutsch</button></div>${'Translator' in window?'<p>Optional: translate older German passages locally in this browser.</p><button class="btn btn-soft" id="lw-translate-legacy">Enable local translation</button>':''}<p id="lw-language-status"></p>`,640);
 for(const lang of ['en','de'])$('#lw-language-'+lang,m).onclick=()=>{livingDisplay.language=lang;localStorage.setItem('viv_living_display',lang);m.remove();livingQueueLanguage();};
 const button=$('#lw-translate-legacy',m);if(button)button.onclick=async()=>{button.disabled=true;try{livingDisplay.translator=await Translator.create({sourceLanguage:'de',targetLanguage:'en'});livingDisplay.language='en';localStorage.setItem('viv_living_display','en');m.remove();livingQueueLanguage();}catch(error){$('#lw-language-status',m).textContent='Local translation is unavailable. English interface labels remain available.';button.disabled=false;}};
}
new MutationObserver(records=>{if(livingLanguageActive()&&records.some(r=>r.type==='childList'||r.type==='characterData'))livingQueueLanguage();}).observe(document.body,{subtree:true,childList:true,characterData:true});
// Language packs requiring a download are only started by the user's explicit click.
if(localStorage.getItem('viv_living_display')==='en'&&'Translator' in window)Translator.availability({sourceLanguage:'de',targetLanguage:'en'}).then(async status=>{if(status==='available'){livingDisplay.translator=await Translator.create({sourceLanguage:'de',targetLanguage:'en'});livingDisplay.language='en';livingQueueLanguage();}}).catch(()=>{});
