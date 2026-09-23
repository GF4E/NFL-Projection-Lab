import type {ProjectionBoardData} from '../domain/projection';
type DB=Pick<D1Database,'prepare'>;
export const PROJECTION_URL='https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/projection-v3/board.json';
export function validateProjection(b:unknown):ProjectionBoardData{
 const x=b as ProjectionBoardData;
 if(!x||x.schema!=='projection-board-v1'||!Number.isFinite(Date.parse(x.published_at))||!Array.isArray(x.games)||!x.games.length||new Set(x.games.map(g=>g.game_id)).size!==x.games.length)throw Error('Invalid projection artifact');
 for(const g of x.games){if(!g.projection){if(g.status!=='MISSED')throw Error('Missing projection');continue;}if(!g.display||![g.projection,g.display].every(p=>[p.home_points,p.away_points,p.margin,p.total,p.home_win_probability].every(Number.isFinite))||!['AS_ISSUED','RETROSPECTIVE'].includes(g.evidence)||!g.why.against.startsWith('Against:'))throw Error('Incomplete projection');}
 return x;
}
export function assertProjectionProgress(a:ProjectionBoardData,b:ProjectionBoardData){
 if(Date.parse(b.published_at)<Date.parse(a.published_at))throw Error('Older publication');
 for(const g of a.games.filter(g=>['LOCKED','FINAL'].includes(g.status)||g.evidence==='RETROSPECTIVE')){const next=b.games.find(n=>n.game_id===g.game_id);if(!next||g.version!==next.version||g.freeze_time!==next.freeze_time||JSON.stringify(g.why)!==JSON.stringify(next.why)||JSON.stringify(g.projection)!==JSON.stringify(next.projection)||JSON.stringify(g.ours)!==JSON.stringify(next.ours)||g.evidence!==next.evidence||g.grades&&JSON.stringify(g.grades)!==JSON.stringify(next.grades))throw Error('Frozen projection changed');}
}
// Row 1 is the legacy parsed/stringified cache. Row 2 retains original JSON text.
const RAW_CACHE_ID=2;
type Cached={payload:string;checked_at:number};
const MAX_BYTES=8*1024*1024, CACHE_LIMIT=1_900_000, PREFIX='gzip-json-v1:';
async function bytes(stream:ReadableStream<Uint8Array>|null){
 if(!stream)throw Error('Missing projection body');
 const reader=stream.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES)throw Error('Oversized projection');parts.push(value);}}
 finally{await reader.cancel();}
 const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
}
async function sha(raw:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');}
async function pack(raw:string){
 const original=new TextEncoder().encode(raw);if(original.length>MAX_BYTES)throw Error('Oversized projection');
 const compressed=await bytes(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')));
 let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
 const encoded=PREFIX+JSON.stringify({sha256:await sha(original),bytes:original.length,data:btoa(binary)});
 if(encoded.length>CACHE_LIMIT)throw Error('Projection cache exceeds row budget');return encoded;
}
async function unpack(payload:string){
 if(!payload.startsWith(PREFIX))return payload;
 const item=JSON.parse(payload.slice(PREFIX.length));
 if(!Number.isInteger(item.bytes)||item.bytes<0||item.bytes>MAX_BYTES||payload.length>CACHE_LIMIT)throw Error('Invalid cache bounds');
 const compressed=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
 const raw=await bytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')));
 if(raw.length!==item.bytes||await sha(raw)!==item.sha256)throw Error('Corrupt projection cache');
 return new TextDecoder('utf-8',{fatal:true}).decode(raw);
}

async function cached(db:DB,id:number):Promise<Cached|null>{
 try{const value=await db.prepare('SELECT payload,checked_at FROM engine_projection_publication WHERE id=?').bind(id).first<Cached>();return value?{...value,payload:id===RAW_CACHE_ID?await unpack(value.payload):value.payload}:null;}catch{return null;}
}
async function downloadRaw(){
 const r=await fetch(PROJECTION_URL+'?publication='+Date.now(),{signal:AbortSignal.timeout(10000),redirect:'manual'});
 if(r.status!==200)throw Error('Projection source unavailable');
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(await bytes(r.body));validateProjection(JSON.parse(raw));return raw;
}
async function retain(db:DB,payload:string,checkedAt:number){
 await db.prepare('INSERT INTO engine_projection_publication(id,payload,checked_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at WHERE excluded.checked_at>=engine_projection_publication.checked_at').bind(RAW_CACHE_ID,await pack(payload),checkedAt).run();
}
export async function readProjectionRaw(db:DB,fresh=false):Promise<string>{
 const checkedAt=Date.now();const prior=await cached(db,RAW_CACHE_ID);
 if(prior&&!fresh&&Date.now()-prior.checked_at<30_000){validateProjection(JSON.parse(prior.payload));return prior.payload;}
 try{
  const raw=await downloadRaw();const before=prior??await cached(db,1);
  if(before)assertProjectionProgress(validateProjection(JSON.parse(before.payload)),validateProjection(JSON.parse(raw)));
  try{await retain(db,raw,checkedAt);}catch{/* A cache-write failure must not hide validated fresh scores. */}
  return raw;
 }catch(e){
  console.error('Projection refresh failed; retaining last good board',e instanceof Error?e.message:'Unknown error');
  if(prior){validateProjection(JSON.parse(prior.payload));return prior.payload;}
  throw e;
 }
}
export async function readProjection(db:DB,fresh=false):Promise<ProjectionBoardData>{
 try{return validateProjection(JSON.parse(await readProjectionRaw(db,fresh)));}
 catch(e){const legacy=await cached(db,1);if(legacy)return validateProjection(JSON.parse(legacy.payload));throw e;}
}
export async function refreshProjection(db:DB){
 const checkedAt=Date.now();const raw=await downloadRaw();const prior=await cached(db,RAW_CACHE_ID)??await cached(db,1);
 if(prior)assertProjectionProgress(validateProjection(JSON.parse(prior.payload)),validateProjection(JSON.parse(raw)));
 await retain(db,raw,checkedAt);
}
export async function projectionResponse(db:DB,fresh=false):Promise<Response>{
 try{return new Response(await readProjectionRaw(db,fresh),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Projection unavailable'},{status:503});}
}
