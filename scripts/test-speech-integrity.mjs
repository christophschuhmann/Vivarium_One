import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'viv-speech-integrity-'));process.env.VIV_DATA_DIR=scratch;process.env.VIV_SECRET='speech-test';process.env.MOCK_PROVIDERS='0';
const {db}=await import('../server/db.js'),{withPrincipal,encryptSecret}=await import('../server/byok.js'),{synthesizeLine,completeAudio}=await import('../server/tts_service.js'),{hostedTtsCacheVoice,tts}=await import('../server/providers.js'),{saveAsset}=await import('../server/assets.js');
const user={id:'speech',or_enabled:1,hypr_key:encryptSecret('fixture'),provider_prefs:JSON.stringify({roles:{tts:{provider:'hyprlab',model:'eleven-v3'}}})};
db.prepare('INSERT INTO users(id,email,display_name,created_at,hypr_key,or_enabled,provider_prefs) VALUES (?,?,?,?,?,1,?)').run(user.id,'speech@test.local','Speech',new Date().toISOString(),user.hypr_key,user.provider_prefs);
const original=globalThis.fetch;let attempts=0,mode='normal',sent=[];
globalThis.fetch=async(url,options)=>{
 assert.equal(new URL(url).hostname,'api.hyprlab.io');attempts++;const body=JSON.parse(options.body);sent.push(body);
 if(String(url).includes(':generateContent')){
  if(mode==='abort'&&attempts===1)return Response.json({error:{message:'aborted',type:'client_side_error'}},{status:400});
  if(mode==='bad-key')return Response.json({error:{message:'invalid api key',type:'authentication_error'}},{status:400});
  return Response.json({candidates:[{content:{parts:[{inlineData:{data:Buffer.alloc(4800).toString('base64'),mimeType:'audio/pcm;rate=24000'}}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:10}});
 }
 return new Response(Buffer.from('audio fixture'),{headers:{'Content-Type':'audio/mpeg'}});
};
try{
 await withPrincipal(user,async()=>{
  const text='A complete sentence matters. '.repeat(36)+'This final fragment must survive',voice='Leda',style='calm';
  const token=hostedTtsCacheVoice(voice),legacy=saveAsset({userId:user.id,kind:'audio',prompt:`${token}|${style}|${text}`,buffer:Buffer.from('old truncated audio'),mime:'audio/mpeg',meta:{voice:token,style,text}});
  assert(!completeAudio(legacy,text));
  const result=await synthesizeLine(user,{text,voice,style});assert.equal(sent.at(-1).text,text);assert.notEqual(result.assetId,legacy.id);
  assert.equal(JSON.parse(db.prepare('SELECT meta FROM assets WHERE id=?').get(result.assetId).meta).spokenCharacters,text.length);
  const count=attempts;assert.equal((await synthesizeLine(user,{text,voice,style})).assetId,result.assetId);assert.equal(attempts,count);
  await synthesizeLine(user,{text,voice,style,regenerate:true});assert.equal(attempts,count+1);
  await assert.rejects(synthesizeLine(user,{text:'a'.repeat(12001)}),e=>e.code==='TEXT_TOO_LONG');
 });
 console.log('PASS complete long speech, legacy truncated-cache rejection, normal cache reuse and explicit corrupt-clip regeneration');
 const gemini={...user,provider_prefs:JSON.stringify({roles:{tts:{provider:'hyprlab',model:'gemini-3.8-flash-tts'}}})};
 attempts=0;mode='abort';await withPrincipal(gemini,()=>tts('Every last word.'));assert.equal(attempts,2);
 attempts=0;mode='bad-key';await assert.rejects(withPrincipal(gemini,()=>tts('Do not retry a bad key.')),/invalid api key/);assert.equal(attempts,1);
 console.log('PASS observed HyprLab HTTP-400 aborted response retries successfully; permanent authentication error is not retried');
}finally{globalThis.fetch=original;db.close();fs.rmSync(scratch,{recursive:true,force:true});}
