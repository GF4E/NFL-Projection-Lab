import type {ContextData} from '../domain/board-v9';
const canonical=(x:unknown):unknown=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)])):x;
export async function readScoreContext():Promise<ContextData|null>{try{
 const r=await fetch('https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/board-v7/context-v9.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)return null;
 const value=await r.json() as ContextData;if(value.schema!=='board-v9-context-v1'||!value.games||!/^[a-f0-9]{64}$/.test(value.content_sha256))return null;
 const {content_sha256,...body}=value;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(body))));
 if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==content_sha256)return null;
 return value;
}catch{return null;}}
