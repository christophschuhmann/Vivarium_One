import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
let child,serial=0,catalogPromise;
const pending=new Map();
function start() {
  child=spawn(process.env.VIV_PYTHON_BIN || 'python3',[fileURLToPath(new URL('./open_sims_worker.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  let errors='';child.stderr.on('data',data=>errors=(errors+data).slice(-2000));
  createInterface({input:child.stdout}).on('line',line=>{const response=JSON.parse(line),request=pending.get(response.id);if(!request)return;clearTimeout(request.timer);pending.delete(response.id);response.error?request.reject(new Error(response.error)):request.resolve(response.result);});
  const fail=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Open Sims adapter stopped. '+errors));}pending.clear();child=null;catalogPromise=null;};
  child.once('exit',fail);child.once('error',fail);child.stdin.on('error',()=>{});
}
export function openSims(op,payload={}) {
  if(!child)start();const id=++serial;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Open Sims adapter timeout'));},30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,op,...payload})+'\n');});
}
export const openSimsCatalog=()=>catalogPromise ||= openSims('catalog');
export function closeOpenSims(){child?.kill();child=null;catalogPromise=null;}
process.once('exit',()=>child?.kill());
