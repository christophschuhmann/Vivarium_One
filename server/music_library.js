// CPU-only BM25 search over the dataset's scene annotations, captions and moods.
// Audio streams directly from the downloaded TAR offsets, with HTTP Range support.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const MUSIC_GENRES = ['high_fantasy','low_fantasy','dark_fantasy','mythic_ancient','medieval','renaissance_pirate','wild_west','gothic_horror','cosmic_horror','modern_supernatural','modern_realistic','superhero','post_apocalyptic','cyberpunk','hard_scifi','space_opera','science_fantasy','alt_history'];
const STOPWORDS = new Set('the a an and or of to in on at with from for is are it its this that their they scene music background instrumental'.split(' '));
const parsed = value => { try { return JSON.parse(value || '[]'); } catch { return []; } };

export function openMusicLibrary(directory) {
  const root = path.resolve(directory);
  const source = path.join(root, 'indices/rpg_metadata.db');
  const audioIndex = JSON.parse(fs.readFileSync(path.join(root, 'audio-index.json'), 'utf8'));
  if (audioIndex.schema_version !== 1) throw new Error('Music audio index needs rebuilding.');
  const audio = new Map();
  for (const shard of audioIndex.shards) {
    const filename = path.resolve(root, shard.file);
    if (!filename.startsWith(root + path.sep) || fs.statSync(filename).size !== shard.bytes) throw new Error('Music shard differs from its index; run setup-music.py again.');
  }
  for (const [id, entry] of Object.entries(audioIndex.tracks)) {
    const filename = path.resolve(root, entry.tar);
    if (!filename.startsWith(root + path.sep) || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.bytes) || entry.offset < 0 || entry.bytes <= 0 || entry.offset + entry.bytes > fs.statSync(filename).size) throw new Error('Invalid music audio offset.');
    audio.set(+id, { ...entry, filename });
  }
  const metadata = new Database(source, { readonly: true, fileMustExist: true });
  const tracks = new Map(metadata.prepare('SELECT * FROM tracks').all().map(track => [track.row_id, track]));
  const db = new Database(path.join(root, 'vivarium-bm25.db'));
  const fingerprint = `v1:${fs.statSync(source).size}:${fs.statSync(source).mtimeMs}:${audio.size}`;
  db.exec('CREATE TABLE IF NOT EXISTS library_info(fingerprint TEXT)');
  if (db.prepare('SELECT fingerprint FROM library_info').get()?.fingerprint !== fingerprint) {
    db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS search_docs; CREATE VIRTUAL TABLE search_docs USING fts5(track_id UNINDEXED,genre UNINDEXED,situation,caption,emotion,tags,tokenize='porter unicode61')");
      const insert = db.prepare('INSERT INTO search_docs(track_id,genre,situation,caption,emotion,tags) VALUES (?,?,?,?,?,?)');
      for (const row of metadata.prepare('SELECT * FROM genre_situations').all()) {
        const track = tracks.get(row.row_id);
        if (!track || !audio.has(row.row_id)) continue;
        insert.run(row.row_id,row.genre_key,parsed(row.situations).join(' '),track.music_whisper_caption || '',parsed(track.evoked_emotions).join(' '),[track.title,track.tags_text,track.mood_text].filter(Boolean).join(' '));
      }
      db.exec('DELETE FROM library_info');
      db.prepare('INSERT INTO library_info VALUES (?)').run(fingerprint);
    })();
    db.exec("INSERT INTO search_docs(search_docs) VALUES ('optimize')");
  }
  const attribution = { dataset: 'laion/laion-tunes-rpg-music', url: 'https://huggingface.co/datasets/laion/laion-tunes-rpg-music', license: 'CC-BY-4.0' };
  function search(request = {}) {
    const started = performance.now();
    const genre = MUSIC_GENRES.includes(request.genre) ? request.genre : '';
    const field = /caption/.test(request.search_field || '') ? 'caption' : /emotion/.test(request.search_field || '') ? 'emotion' : 'situation';
    const tokens = [...new Set(String(request.query || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter(t => t.length > 1 && !STOPWORDS.has(t)).slice(0, 40);
    if (!tokens.length) return { results: [], search_field: `bm25_${field}`, total_tracks: tracks.size, search_time_ms: 0, attribution };
    const query = tokens.map(t => '"' + t + '"').join(' OR ');
    const match = field === 'situation' ? `{situation emotion caption tags}: (${query})` : `${field}: (${query})`;
    const rows = db.prepare(`SELECT track_id, genre, -bm25(search_docs,0,0,4,1,2,1) AS similarity FROM search_docs WHERE search_docs MATCH ? ${genre ? 'AND genre=?' : ''} ORDER BY similarity DESC LIMIT 1000`).all(match, ...(genre ? [genre] : []));
    const seen = new Set(), results = [];
    for (const row of rows) {
      if (seen.has(row.track_id)) continue;
      seen.add(row.track_id);
      const track = tracks.get(row.track_id);
      if (!track || !audio.has(track.row_id)) continue;
      if (request.singing_filter !== 'has_singing' && track.has_singing !== 'no') continue;
      if (request.singing_filter === 'has_singing' && track.has_singing !== 'yes') continue;
      if (request.nsfw_filter !== 'all' && track.nsfw_overall_label !== 'likely_sfw') continue;
      if (Number(request.min_duration) > track.duration_seconds) continue;
      results.push({ ...track, audio_url: undefined, score: row.similarity, score_type: 'bm25_score', genre_key: row.genre, available: true, attribution });
    }
    if (request.rank_by === 'aesthetics') results.sort((a,b) => (b.score_average || 0) - (a.score_average || 0));
    const top = Math.min(50, Math.max(1, Number(request.top_k) || 10));
    return { results: results.slice(0,top), search_field: `bm25_${field}`, total_tracks: tracks.size, total_filtered: results.length, search_time_ms: Math.round(performance.now()-started), attribution };
  }
  return { root, audio, search, attribution,
    stats: () => ({ ready: true, engine: 'SQLite FTS5 BM25', total_tracks: tracks.size, available_tracks: audio.size,
      instrumental_tracks: [...tracks.values()].filter(t => t.has_singing === 'no' && t.nsfw_overall_label === 'likely_sfw' && audio.has(t.row_id)).length,
      genres: MUSIC_GENRES, attribution }),
    close: () => { metadata.close(); db.close(); } };
}

export async function musicServerRoutes(app, library) {
  app.get('/api/stats', async () => library.stats());
  app.get('/api/genres', async () => ({ genres: library.stats().genres.map(key => ({ key, name: key.replaceAll('_',' ') })) }));
  app.post('/api/search', async (request,reply) => library.stats().ready ? library.search(request.body) : reply.code(503).send({error:'Music library removed; download it again and restart Vivarium.'}));
  app.route({ method: ['GET','HEAD'], url: '/api/audio/:rowId', handler: async (request, reply) => {
    if (!/^\d+$/.test(request.params.rowId)) return reply.code(404).send({error:'Unknown track'});
    const entry = library.audio.get(+request.params.rowId);
    if (!entry) return reply.code(404).send({error:'Unknown track'});
    let start = 0, end = entry.bytes - 1;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || !match[1] && !match[2]) return reply.code(416).header('Content-Range',`bytes */${entry.bytes}`).send();
      if (!match[1]) start = Math.max(0, entry.bytes - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end,Number(match[2])); }
      if (start >= entry.bytes || start > end) return reply.code(416).header('Content-Range',`bytes */${entry.bytes}`).send();
      reply.code(206).header('Content-Range',`bytes ${start}-${end}/${entry.bytes}`);
    }
    reply.header('Accept-Ranges','bytes').header('Content-Length',end-start+1).header('Cache-Control','public, max-age=31536000, immutable').type('audio/mpeg');
    if (request.method === 'HEAD') return reply.send();
    return reply.send(fs.createReadStream(entry.filename,{start:entry.offset+start,end:entry.offset+end}));
  }});
}
