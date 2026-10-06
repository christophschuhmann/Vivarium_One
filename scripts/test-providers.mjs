// Isolated integration tests: real routing/credentials/metering, stubbed provider HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vivarium-providers-'));
process.env.VIV_DATA_DIR = scratch;
process.env.MOCK_PROVIDERS = '0';
process.env.HYPRLAB_API_KEY = 'test-central-hyprlab';
process.env.OPENROUTER_API_KEY = 'test-central-openrouter';
const {db,setSetting,getSetting}=await import('../server/db.js');
const {withPrincipal,encryptSecret,decryptSecret,isolatedRequest,currentPrincipal,PROVIDERS}=await import('../server/byok.js');
const {route,llmChat,genImage,tts,asr,hostedTtsCacheVoice}=await import('../server/providers.js');
const {preflight,debitCall,balance}=await import('../server/credits.js');
const {createSession}=await import('../server/auth.js');
const {default:providerRoutes}=await import('../server/routes/provider_settings.js');
const {default:Fastify}=await import('fastify');
const {default:cookie}=await import('@fastify/cookie');
const requests=[];
const hpIds=Object.values(PROVIDERS.hyprlab.defaults).concat('gemini-3.1-flash-tts');
const orModels=[
 {id:PROVIDERS.openrouter.defaults.llm,architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:'0.000001',completion:'0.000002'}},
 {id:PROVIDERS.openrouter.defaults.image,architecture:{input_modalities:['text','image'],output_modalities:['image']},supported_parameters:{aspect_ratio:{type:'enum',values:['1:1','2:3']}}},
 ...['google/gemini-3.8-flash-tts','google/gemini-3.1-flash-tts-preview'].map(id=>({id,architecture:{input_modalities:['text'],output_modalities:['speech']},supported_voices:['Sulafat','Iapetus'],pricing:{prompt:'0.0000005',completion:'0.000009'}})),
 {id:PROVIDERS.openrouter.defaults.asr,architecture:{input_modalities:['text','audio'],output_modalities:['text']},pricing:{prompt:'0.000001',completion:'0.000002'}},
];
const json=(data,init)=>Response.json(data,init);
const audio=Buffer.alloc(4800);
globalThis.fetch=async (url,opts={})=>{
 const parsed=new URL(url),hp=parsed.hostname.includes('hyprlab'),body=typeof opts.body==='string'?JSON.parse(opts.body):null;
 const auth=opts.headers?.Authorization || parsed.searchParams.get('key');requests.push({url:String(url),body,auth});
 if(auth?.includes('rejected')) return json({error:{message:'Rejected'}},{status:401});
 if(parsed.pathname.endsWith('/models')) return json({data:hp?hpIds.map(id=>({id})):parsed.pathname.includes('/images/')?orModels.filter(m=>m.architecture.output_modalities.includes('image')):orModels});
 if(parsed.pathname.endsWith('/key'))return json({data:{limit_remaining:100}});
 if(parsed.pathname.endsWith('/generation'))return json({data:{total_cost:0.003}});
 if(parsed.pathname.endsWith('/chat/completions'))return json({choices:[{message:{content:body.messages[0].content?.[0]?.type==='text'?'A spoken test.':'Test response.'}}],usage:{prompt_tokens:10,completion_tokens:10,cost:0.005}});
 if(parsed.pathname.endsWith('/images')||parsed.pathname.endsWith('/images/generations'))return json({data:[{b64_json:Buffer.from('image fixture').toString('base64'),media_type:'image/png'}],usage:{cost:0.02}});
 if(parsed.pathname.endsWith('/audio/speech'))return new Response(Buffer.from('mp3-fixture'),{headers:{'content-type':'audio/mpeg','x-generation-id':'test-generation'}});
 if(parsed.pathname.endsWith(':generateContent'))return json({candidates:[{content:{parts:[{inlineData:{data:audio.toString('base64'),mimeType:'audio/pcm;rate=24000'}}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:10}});
 if(parsed.pathname.endsWith('/audio/transcriptions'))return json({text:'A spoken test.',usage:{seconds:2}});
 throw new Error('Unexpected provider URL '+parsed.pathname);
};
function insertUser(id,role='player') { db.prepare("INSERT INTO users(id,email,display_name,role,email_verified_at,created_at,credit_balance) VALUES (?,?,?,?,?,?,?)").run(id,id+'@test.local',id,role,new Date().toISOString(),new Date().toISOString(),0);return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
const player=insertUser('player'),other=insertUser('other'),admin=insertUser('admin','admin');
function personal(provider,id='player') {return {...player,id,or_enabled:1,or_key:provider==='openrouter'?encryptSecret('test-personal-or-'+id):null,hypr_key:provider==='hyprlab'?encryptSecret('test-personal-hp-'+id):null,provider_prefs:JSON.stringify({roles:Object.fromEntries(Object.entries(PROVIDERS[provider].defaults).map(([r,m])=>[r,{provider,model:m}]))})};}
function setCentral(provider) {for(const [role,model] of Object.entries(PROVIDERS[provider].defaults)){const r=role==='llm'?'reasoning_llm':role;db.prepare('UPDATE model_routes SET model=?,base_url=?,key_env=? WHERE role=?').run(model,provider==='hyprlab'&&role==='tts'?'https://api.hyprlab.io/v1beta':PROVIDERS[provider].base,PROVIDERS[provider].env,r);}}
const modalities=[['llm',()=>llmChat([{role:'user',content:'Test'}])],['image',()=>genImage('Test',{refs:['data:image/png;base64,dGVzdA==']})],['tts',()=>tts('Only this sentence.',{style:'Warm voice'})],['asr',()=>asr(audio,'audio/wav','test.wav')]];
for(const provider of ['hyprlab','openrouter'])for(const own of [false,true]){
 setCentral(own ? provider==='hyprlab'?'openrouter':'hyprlab' : provider);
 const u=own?personal(provider):player;
 await withPrincipal(u,async()=>{
  for(const [kind,fn] of modalities){const before=requests.length,r=await fn();assert.equal(r.provider,provider);assert.equal(!!r.byok,own);assert.ok(Number.isFinite(r.rawUsd));assert.ok(requests.slice(before).some(q=>q.auth?.includes(own?'personal':'central')));}
  assert.ok(hostedTtsCacheVoice('Sulafat').includes(PROVIDERS[provider].defaults.tts));
 });
 console.log('PASS',provider,own?'personal':'central','all four modalities');
}
const hp=personal('hyprlab');db.prepare('UPDATE users SET hypr_key=?,or_enabled=1,provider_prefs=? WHERE id=?').run(hp.hypr_key,hp.provider_prefs,player.id);
assert.doesNotThrow(()=>preflight(player.id,1000000));assert.equal(debitCall(player.id,{provider:'hyprlab',byok:true,rawUsd:1},'test'),0);assert.equal(balance(player.id),0);
assert.ok(debitCall(other.id,{provider:'openrouter',byok:false,rawUsd:0.01},'test')>0);assert.ok(balance(other.id)<0);
await Promise.all([withPrincipal(personal('hyprlab','A'),async()=>{await new Promise(r=>setTimeout(r,10));assert.equal(route('tts').api_key,'test-personal-hp-A');}),withPrincipal(personal('openrouter','B'),async()=>{await new Promise(r=>setTimeout(r,5));assert.equal(route('tts').api_key,'test-personal-or-B');})]);
console.log('PASS credit bypass, central OpenRouter debit, concurrent user isolation');
const app=Fastify();app.addHook('onRequest',(req,reply,done)=>isolatedRequest(done));await app.register(cookie);await app.register(providerRoutes);
const playerCookie='vsession='+createSession(player.id),adminCookie='asession='+createSession(admin.id,'admin');
const inject=(method,url,payload,cookieValue=playerCookie)=>app.inject({method,url,headers:{cookie:cookieValue},...(payload?{payload}:{})});
let res=await inject('GET','/admin/api/provider/settings');assert.equal(res.statusCode,401);
res=await inject('GET','/api/provider/settings');assert.equal(res.statusCode,200);assert.ok(!res.body.includes('test-personal-hp'));assert.ok(!res.body.includes(hp.hypr_key));assert.equal(res.json().active,true);
const savedBefore=db.prepare('SELECT or_key,hypr_key,provider_prefs,or_enabled FROM users WHERE id=?').get(player.id);
res=await inject('PUT','/api/provider/settings',{enabled:true,roles:{tts:{provider:'openrouter',model:PROVIDERS.openrouter.defaults.llm}}});assert.equal(res.statusCode,400);assert.deepEqual(db.prepare('SELECT or_key,hypr_key,provider_prefs,or_enabled FROM users WHERE id=?').get(player.id),savedBefore);
res=await inject('PUT','/api/provider/settings',{enabled:true,roles:{tts:{provider:'openrouter',model:PROVIDERS.openrouter.defaults.tts}}});assert.equal(res.statusCode,400);
res=await inject('PUT','/api/provider/keys/openrouter',{key:'test-saved-or-key'});assert.equal(res.statusCode,200);assert.ok(!res.body.includes('test-saved-or-key'));const row=db.prepare('SELECT * FROM users WHERE id=?').get(player.id);assert.notEqual(row.or_key,'test-saved-or-key');assert.equal(decryptSecret(row.or_key),'test-saved-or-key');
res=await inject('PUT','/api/provider/keys/openrouter',{key:'rejected-test-key'});assert.equal(res.statusCode,400);assert.equal(db.prepare('SELECT or_key FROM users WHERE id=?').get(player.id).or_key,row.or_key);
res=await inject('PUT','/api/provider/keys/openrouter',{remove:true});assert.equal(res.statusCode,200);assert.equal(res.json().active,true);
res=await inject('PUT','/api/provider/keys/openrouter',{key:'test-saved-or-key'});assert.equal(res.statusCode,200);
res=await inject('PUT','/api/provider/settings',{enabled:true,roles:{tts:{provider:'openrouter',model:'google/gemini-3.1-flash-tts-preview'}}});assert.equal(res.statusCode,200);assert.equal(res.json().active,true);
res=await inject('PUT','/admin/api/provider/keys/openrouter',{key:'test-admin-or-key'},adminCookie);assert.equal(res.statusCode,200);assert.ok(!res.body.includes('test-admin-or-key'));assert.ok(!db.prepare('SELECT payload FROM admin_audit').all().some(a=>a.payload.includes('test-admin-or-key')));
res=await inject('PUT','/api/provider/keys/openrouter',{remove:true});assert.equal(res.statusCode,200);assert.equal(res.json().active,false);
console.log('PASS API permissions, encrypted write-only keys, model validation, atomic failure, mixed providers, key removal');
const modern=requests.find(q=>q.body?.contents?.[0]?.parts?.[0]?.speechMetadata);assert.ok(modern);assert.equal(modern.body.contents[0].parts[0].text,'Only this sentence.');
const imageRequest=requests.find(q=>q.url.endsWith('/images')&&q.body?.input_references);assert.ok(imageRequest);
console.log('PASS Gemini 3.8 verbatim text and dedicated OpenRouter image references');
await app.close();db.close();fs.rmSync(scratch,{recursive:true,force:true});process.exit(0);
