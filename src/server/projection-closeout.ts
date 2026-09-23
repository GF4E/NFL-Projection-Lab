import {z} from 'zod';
import type {CloseoutMeta} from '../domain/closeout';

const ROOT='https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/';
export const INDEX_URL=ROOT+'engine-v2/outputs/cadence-v2/publication-index.json';
const sha=z.string().regex(/^[0-9a-f]{64}$/), commit=z.string().regex(/^[0-9a-f]{40}$/);
const stamp=z.string().refine(s=>Number.isFinite(Date.parse(s))&&/(Z|[+-]\d\d:\d\d)$/.test(s));
const entry=z.object({season:z.number().int().min(2000).max(2099),week:z.number().int().min(1).max(22),
  published_at:stamp,receipt_path:z.string().regex(/^outputs\/cadence-v2\/closeouts\/\d{4}-\d{2}-\d{2}\.json$/),
  receipt_sha256:sha,receipt_source_commit:commit}).strict();
const indexSchema=z.object({schema:z.literal('closeout-index-v1'),latest:z.string(),releases:z.record(z.string(),entry)}).strict();
const receiptSchema=z.object({schema:z.literal('closeout-publication-v2'),state:z.literal('PUBLISHED'),
  all_games_graded:z.literal(true),season:z.number().int(),week:z.number().int(),published_at:stamp,
  source_commit:commit,artifacts:z.record(z.string(),sha),publication_surface:z.literal('source_repository')}).strict();
export const ARTIFACTS=['scorecard','trend','season'] as const;
export type Artifact=typeof ARTIFACTS[number];

export async function sha256(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function raw(url:string,signal:AbortSignal,limit:number,allowMissing=false):Promise<Uint8Array|null>{
  const response=await fetch(url,{signal,cache:'no-store',redirect:'manual'});
  if(allowMissing&&response.status===404)return null;
  if(!response.ok||!response.body)throw Error('Closeout source request failed');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Closeout source exceeds limit');chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
const parse=(bytes:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));

export async function readCloseout(name:Artifact|'metadata',key?:string){
  if(key&&!/^20\d{2}-w(?:[1-9]|1\d|2[0-2])$/.test(key))throw Error('Invalid closeout key');
  const signal=AbortSignal.timeout(10000);
  const bytes=await raw(INDEX_URL+'?t='+Date.now(),signal,256*1024,true);
  if(!bytes)return null;
  const index=indexSchema.parse(parse(bytes));
  const entries=Object.entries(index.releases);
  if(!entries.length||entries.some(([k,r])=>k!==`${r.season}-w${r.week}`))throw Error('Closeout index identity differs');
  const latest=entries.sort((a,b)=>b[1].season-a[1].season||b[1].week-a[1].week)[0][0];
  if(index.latest!==latest)throw Error('Closeout latest pointer differs');
  const selected=key??index.latest;const ref=index.releases[selected];
  if(!ref)throw Error('Requested closeout is not published');
  const receiptBytes=(await raw(ROOT+ref.receipt_source_commit+'/'+ref.receipt_path,signal,16*1024))!;
  if(await sha256(receiptBytes)!==ref.receipt_sha256)throw Error('Closeout receipt hash differs');
  const receipt=receiptSchema.parse(parse(receiptBytes));
  if(receipt.season!==ref.season||receipt.week!==ref.week||receipt.published_at!==ref.published_at||Date.parse(receipt.published_at)>Date.now())throw Error('Closeout receipt identity differs');
  const folder=`outputs/cadence-v2/weeks/${selected}/`;
  if(Object.keys(receipt.artifacts).sort().join('|')!==ARTIFACTS.map(n=>folder+n+'.json').sort().join('|'))throw Error('Closeout artifact paths differ');
  const meta:CloseoutMeta={key:selected,season:ref.season,week:ref.week,published_at:ref.published_at,
    receipt_sha256:ref.receipt_sha256,receipt_source_commit:ref.receipt_source_commit,source_commit:receipt.source_commit,artifacts:receipt.artifacts};
  if(name==='metadata')return {meta,bytes:null,data:null};
  const path=folder+name+'.json';const artifact=(await raw(ROOT+receipt.source_commit+'/'+path,signal,8*1024*1024))!;
  if(await sha256(artifact)!==receipt.artifacts[path])throw Error('Closeout artifact hash differs');
  const data=parse(artifact);
  if(name==='season'&&data.schema!=='board-v7-evidence'||name==='trend'&&data.schema!=='projection-trend-v1'||name==='scorecard'&&(data.season!==ref.season||data.week!==ref.week))throw Error('Closeout artifact schema differs');
  return {meta,bytes:artifact,data};
}

export async function closeoutResponse(request:Request):Promise<Response>{
  if(request.method!=='GET')return Response.json({error:'Read only'},{status:405,headers:{allow:'GET'}});
  const match=new URL(request.url).pathname.match(/^\/api\/closeout\/(latest|20\d{2}-w(?:[1-9]|1\d|2[0-2]))\/(metadata|scorecard|trend|season)\.json$/);
  if(!match)return Response.json({error:'Unknown closeout resource'},{status:404});
  try{
    const result=await readCloseout(match[2] as Artifact|'metadata',match[1]==='latest'?undefined:match[1]);
    if(!result)return Response.json({error:'No verified weekly closeout has been indexed'},{status:404});
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-closeout-receipt-sha256':result.meta.receipt_sha256};
    return result.bytes?new Response(new Uint8Array(result.bytes),{headers}):Response.json(result.meta,{headers});
  }catch{return Response.json({error:'Closeout source identity could not be verified; publication is not ready'},{status:503,headers:{'cache-control':'no-store'}});}
}
