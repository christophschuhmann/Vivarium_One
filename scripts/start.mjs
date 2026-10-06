// Run the optional local music service alongside the game, with one lifecycle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const children = [];
const environment={...process.env,MUSIC_CONTROL_TOKEN:process.env.MUSIC_CONTROL_TOKEN || randomBytes(32).toString('hex')};
const musicRoot = process.env.MUSIC_DATA_DIR || path.join(process.env.VIV_DATA_DIR || path.join(root,'data'),'music-library');
let stopping = false;
const stop = () => { if (stopping) return;stopping=true;for (const child of children) child.kill('SIGTERM'); };
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,stop);
if (process.env.MUSIC_AUTOSTART !== '0' && !process.env.MUSIC_API_URL && fs.existsSync(path.join(musicRoot,'audio-index.json'))) {
  const music=spawn(process.execPath,[path.join(root,'server/music_server.js')],{cwd:root,env:environment,stdio:'inherit'});
  children.push(music);
  music.on('exit',code => {if(!stopping && code)console.error('Music service stopped. The game remains available; check the music log.');});
} else if (!process.env.MUSIC_API_URL) console.log('Music is optional. Run npm run music:setup to download and enable the local library.');
const game = spawn(process.execPath,[path.join(root,'server/index.js')],{cwd:root,env:environment,stdio:'inherit'});
children.push(game);
game.on('exit',code => {stop();process.exitCode=code || 0;});
