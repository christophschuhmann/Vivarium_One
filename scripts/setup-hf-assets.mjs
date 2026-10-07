// Repeatable optional public asset mirror. Credentials are not required.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname);process.chdir(root);if(fs.existsSync('.env'))process.loadEnvFile('.env');
const python=process.env.VIV_PYTHON_BIN||(fs.existsSync('.venv/bin/python')?path.join(root,'.venv/bin/python'):'python3');
for(const script of ['sync-hf-assets.py','index-hf-assets.py']){const r=spawnSync(python,[path.join(root,'scripts',script)],{cwd:root,env:process.env,stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);}
console.log('HF metadata is indexed. Previews and transparent sprites are cached on first use; restart Vivarium if you changed VIV_ASSET_LIBRARY.');
