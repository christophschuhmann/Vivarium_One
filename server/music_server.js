import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMusicLibrary, musicServerRoutes } from './music_library.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = process.env.MUSIC_DATA_DIR || path.join(process.env.VIV_DATA_DIR || path.join(root,'data'),'music-library');
const library = openMusicLibrary(directory);
const app = Fastify({ logger: true, bodyLimit: 32 * 1024 });
await app.register(musicServerRoutes,library);
app.post('/api/maintenance',async(req,reply)=> {
  if(!process.env.MUSIC_CONTROL_TOKEN || req.headers['x-vivarium-music-control']!==process.env.MUSIC_CONTROL_TOKEN)return reply.code(403).send({error:'Forbidden'});
  if(!['rebuild-cache','remove-library'].includes(req.body?.action))return reply.code(400).send({error:'Unknown action'});
  if(!library.stats().ready)return reply.code(409).send({error:'Music library is not installed'});
  library.close();
  const {default:fs}=await import('node:fs');
  if(req.body.action==='remove-library') {
    library.audio.clear();library.stats=()=>({ready:false,available_tracks:0});library.close=()=>{};
    fs.rmSync(directory,{recursive:true,force:true});
    return {ok:true,ready:false,message:'Music library removed. Re-download it and restart Vivarium to enable music again.'};
  }
  fs.rmSync(path.join(directory,'vivarium-bm25.db'),{force:true});
  Object.assign(library,openMusicLibrary(directory));
  return {ok:true,...library.stats()};
});
await app.listen({host:'127.0.0.1',port:Number(process.env.MUSIC_PORT || 8930)});
console.log(`Music ready: ${library.stats().available_tracks} local tracks, CPU-only BM25.`);
for (const signal of ['SIGTERM','SIGINT']) process.once(signal,async () => { await app.close();library.close();process.exit(0); });
