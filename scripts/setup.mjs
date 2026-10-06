// One-command local installation: dependencies, Python sidecar and a verified player.
// No operator account, central API key or credit purchase is required.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const flags=new Set(process.argv.slice(2));
function run(command,args,env=process.env) {
  const child=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});
  if(child.error || child.status!==0)throw new Error(`${command} failed. ${child.error?.message || 'See the output above.'}`);
}
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<20 || major===20&&minor<12)throw new Error('Use Node 22 LTS or newer (minimum Node 20.12).');
for(const tool of ['ffmpeg','zip','unzip','python3']) {
  const result=spawnSync('sh',['-c','command -v "$1"','sh',tool],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Missing ${tool}. On Debian/Ubuntu: sudo apt install ffmpeg zip unzip python3 python3-venv`);
}
if(!flags.has('--no-install'))run('npm',['install','--no-audit','--no-fund']);
const envFile=path.join(root,'.env');
if(!fs.existsSync(envFile)) {
  let initial=fs.readFileSync(path.join(root,'.env.example'),'utf8');
  if(!fs.existsSync(path.join(process.env.VIV_DATA_DIR || path.join(root,'data'),'vivarium.db')))initial+=`\nVIV_SECRET=${randomBytes(32).toString('hex')}\n`;
  fs.writeFileSync(envFile,initial,{mode:0o600});console.log('Created .env for local BYOK use.');
}
process.loadEnvFile(envFile);
const python=process.env.VIV_PYTHON_BIN || path.join(root,'.venv','bin','python');
if(!flags.has('--no-python')) {
  if(!fs.existsSync(python))run('python3',['-m','venv',path.join(root,'.venv')]);
  run(python,['-m','pip','install','Pillow','numpy','huggingface_hub']);
}
const {db,uid,now,setSetting}=await import('../server/db.js');
const {hashPassword}=await import('../server/auth.js');
const email=process.env.VIV_PLAYER_EMAIL || 'player@vivarium.local';
let player=db.prepare('SELECT * FROM users WHERE email=?').get(email);
let password;
if(!player) {
  password=process.env.VIV_PLAYER_PASSWORD || randomBytes(12).toString('base64url');
  const id=uid('u_');
  db.prepare("INSERT INTO users(id,email,password_hash,display_name,role,status,email_verified_at,or_enabled,created_at) VALUES (?,?,?,'My Vivarium','player','active',?,1,?)")
    .run(id,email,hashPassword(password),now(),now());
  player=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  setSetting('local_owner_user_id',id);
}
console.log(`\nLocal player: ${email}`);
console.log(password?`Initial password: ${password}`:'Account already exists. Your current password and settings were preserved.');
console.log('Start: npm start\nOpen: http://localhost:'+ (process.env.PORT || 8890));
console.log('Settings → AI & models → enter ONE HyprLab or OpenRouter key → Save my settings.');
console.log('You can then create a scenario with the World Wizard. No admin login or Vivarium credits needed.');
db.close();
if(flags.has('--with-music')) {
  if(!fs.existsSync(python))throw new Error('The music downloader needs the Python environment. Run setup without --no-python.');
  run(python,[path.join(root,'scripts/setup-music.py')]);
}
