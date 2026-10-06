import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import {openMusicLibrary,musicServerRoutes} from '../server/music_library.js';
const directory=process.env.MUSIC_DATA_DIR || path.join(process.env.VIV_DATA_DIR || 'data','music-library');
const library=openMusicLibrary(directory),app=Fastify();
try {
  await app.register(musicServerRoutes,library);
  const stats=library.stats();assert.equal(stats.available_tracks,2580);assert.equal(stats.instrumental_tracks,2075);
  const query=async body=>{const result=await app.inject({method:'POST',url:'/api/search',payload:body});assert.equal(result.statusCode,200);return result.json();};
  const calm=await query({query:'quiet library study peaceful gentle piano',genre:'modern_realistic',top_k:6});
  const battle=await query({query:'epic battle siege drums urgent heroic victory',genre:'high_fantasy',top_k:6});
  assert.ok(calm.results.length);assert.ok(battle.results.length);assert.notEqual(calm.results[0].row_id,battle.results[0].row_id);
  for(const result of [calm,battle]) {
    assert.ok(result.search_time_ms<2000);
    for(const track of result.results) {assert.equal(track.has_singing,'no');assert.equal(track.nsfw_overall_label,'likely_sfw');assert.equal(track.available,true);assert.equal(track.attribution.license,'CC-BY-4.0');}
    assert.ok(result.results.every((track,i)=>!i||track.score<=result.results[i-1].score));
  }
  assert.ok(calm.results.every(track=>track.genre_key==='modern_realistic'));
  assert.ok(battle.results.every(track=>track.genre_key==='high_fantasy'));
  assert.equal((await query({query:'!!!'})).results.length,0);
  const id=calm.results[0].row_id,entry=library.audio.get(id);
  const head=await app.inject({method:'HEAD',url:'/api/audio/'+id});assert.equal(head.statusCode,200);assert.equal(Number(head.headers['content-length']),entry.bytes);assert.equal(head.rawPayload.length,0);
  const range=await app.inject({method:'GET',url:'/api/audio/'+id,headers:{range:'bytes=0-2047'}});
  assert.equal(range.statusCode,206);assert.equal(range.rawPayload.length,2048);assert.equal(range.headers['content-range'],`bytes 0-2047/${entry.bytes}`);
  const expected=Buffer.alloc(2048),file=fs.openSync(entry.filename,'r');fs.readSync(file,expected,0,2048,entry.offset);fs.closeSync(file);assert.deepEqual(range.rawPayload,expected);
  const suffix=await app.inject({url:'/api/audio/'+id,headers:{range:'bytes=-128'}});assert.equal(suffix.statusCode,206);assert.equal(suffix.rawPayload.length,128);
  const invalid=await app.inject({url:'/api/audio/'+id,headers:{range:`bytes=${entry.bytes}-`}});assert.equal(invalid.statusCode,416);
  assert.equal((await app.inject({url:'/api/audio/not-a-track'})).statusCode,404);
  console.log(`PASS 2,580 local tracks, SFW/instrumental/genre filters, relevant distinct scores, TAR streaming, HEAD and byte/suffix ranges; queries ${calm.search_time_ms}/${battle.search_time_ms} ms`);
} finally {await app.close();library.close();}
