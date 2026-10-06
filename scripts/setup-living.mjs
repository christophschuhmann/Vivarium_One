// Prepare shared illustration assets and the pinned, separately versioned Open Sims source.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);if(fs.existsSync('.env'))process.loadEnvFile('.env');
const args=process.argv.slice(2),at=args.indexOf('--library');if(at>=0)process.env.VIV_LIVING_LIBRARY=path.resolve(args[at+1]);
const run=(command,parameters)=>{const r=spawnSync(command,parameters,{cwd:root,env:process.env,stdio:'inherit'});if(r.error||r.status)throw new Error(`${command} failed; see output above.`);};
if(!fs.existsSync('vendor/open-sims/living_world/rules.py'))run('git',['submodule','update','--init','--depth','1','vendor/open-sims']);
const python=process.env.VIV_PYTHON_BIN || (fs.existsSync('.venv/bin/python')?path.join(root,'.venv/bin/python'):'python3');
const library=process.env.VIV_LIVING_LIBRARY || path.join(root,'assets/living-world-library');
if(!fs.existsSync(path.join(library,'manifest.json'))){
 if(!args.includes('--download')){if(at>=0)throw new Error('The supplied library path has no manifest.json.');console.log('Using the bundled Vivarium demo backgrounds and adult cutouts. Children and seniors get name/colour placeholders until an age-matching library is installed. Full library: npm run living:setup -- --download with HF_TOKEN, or --library /path/to/library.');process.exit(0);}
 process.env.VIV_LIVING_LIBRARY=library;run(python,[path.join(root,'scripts/download-living-library.py')]);
}
run(python,[path.join(root,'scripts/prepare-living-sprites.py'),'--library',library]);
console.log('Living World ready: npm start → sign in → Living World → New town.');
