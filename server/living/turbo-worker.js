// One simulation worker owns one world's writes. The HTTP thread remains free.
import {parentPort,workerData} from 'node:worker_threads';
import {db} from './schema.js';import {advanceTown} from './engine.js';import {closeOpenSims} from './open_sims.js';
const stop=new AbortController();parentPort.on('message',m=>{if(m==='cancel')stop.abort();});
try{
 const result=await advanceTown({id:workerData.userId},workerData.worldId,{minutes:workerData.minutes,story:false,turbo:true,signal:stop.signal,onProgress:p=>{if(p.phase==='advance')parentPort.postMessage({type:'progress',...p});}});
 parentPort.postMessage({type:'done',metrics:result.metrics,completedMinutes:result.completedMinutes});
}catch(error){parentPort.postMessage({type:stop.signal.aborted?'cancelled':'failed',message:error.message,completedMinutes:error.completedMinutes||0});}
finally{closeOpenSims();db.close();parentPort.close();}
