export { MUSIC_GENRES } from './music_library.js';
import { MUSIC_GENRES } from './music_library.js';
export const MUSIC_API = process.env.MUSIC_API_URL || `http://127.0.0.1:${process.env.MUSIC_PORT || 8930}`;
export async function searchMusicCandidates({ query, genre, emotion, field } = {}) {
  const genreKey = MUSIC_GENRES.includes(genre) ? genre : '';
  const searchField = field === 'bm25_caption' ? field : process.env.MUSIC_SEARCH_FIELD || 'bm25_situation';
  const response = await fetch(`${MUSIC_API}/api/search`, { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ query: [String(query || '').slice(0,400),String(emotion || '').slice(0,80)].filter(Boolean).join(', '), genre:genreKey,
      search_field:searchField,top_k:10,singing_filter:'no_singing',nsfw_filter:'sfw_only',rank_by:'similarity' }), signal:AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`music search ${response.status}`);
  const payload = await response.json();
  const available = await Promise.all((payload.results || []).slice(0,10).map(async track => {
    if (!Number.isSafeInteger(Number(track.row_id))) return null;
    if (track.available !== true) {
      try { const head = await fetch(`${MUSIC_API}/api/audio/${track.row_id}`,{method:'HEAD',signal:AbortSignal.timeout(3000)}); if (!head.ok) return null; }
      catch { return null; }
    }
    return {row_id:track.row_id,title:track.title,url:`/api/music/audio/${track.row_id}`,duration:track.duration_seconds,
      tags:String(track.tags_text || '').slice(0,80),upvotes:track.upvote_count || 0,
      aesthetics:track.score_average == null ? null : Number(Number(track.score_average).toFixed(2)),
      relevance:track.score ?? null,attribution:track.attribution || payload.attribution || null};
  }));
  // Search relevance chooses the score. Aesthetics remain visible for manual choices.
  return available.filter(Boolean).slice(0,6);
}
