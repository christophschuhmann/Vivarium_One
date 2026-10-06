import {createHash} from 'node:crypto';
export function rng(key){let n=createHash('sha256').update(String(key)).digest().readUInt32LE();return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
