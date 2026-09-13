import {readProjection} from './projection-board';
type Env={DB:D1Database;NOTE_EDIT_KEY?:string;NOTE_SYNC_KEY?:string};
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
export const footballOnly=(v:string)=>!(/spread_line|total_line|consensus|market|odds|movement|price|book|cents|break-even|\bEV\b|cushion|reference|filter|stale|Jarrett|Gabe|\$/i.test(v));
export function validShared(v:unknown){const x=v as Record<string,unknown>;return !!x&&['away_points','home_points'].every(k=>typeof x[k]==='number'&&Number.isFinite(x[k])&&(x[k] as number)>=0&&(x[k] as number)<=100)&&Number.isInteger(x.confidence)&&(x.confidence as number)>=1&&(x.confidence as number)<=5&&Array.isArray(x.tags)&&x.tags.length<=10&&x.tags.every(t=>typeof t==='string'&&t.length<=80&&footballOnly(t));}
export async function projectionEntry(request:Request,env:Env){
 const url=new URL(request.url),token=request.headers.get('authorization')?.replace(/^Bearer /,''),sync=url.pathname.endsWith('/sync'),key=sync?env.NOTE_SYNC_KEY:env.NOTE_EDIT_KEY;
 if(!key||token!==key)return reply({error:'Team edit code required'},401);
 if(!['GET','POST'].includes(request.method)||sync&&request.method!=='GET')return reply({error:'Method not allowed'},405);
 if(sync){const rows=await env.DB.prepare('SELECT payload FROM engine_projection_entries').all<{payload:string}>();const history=await env.DB.prepare('SELECT payload FROM engine_projection_edit_history ORDER BY id').all<{payload:string}>();return reply({entries:rows.results.map(x=>JSON.parse(x.payload)),history:history.results.map(x=>JSON.parse(x.payload))});}
 const id=url.searchParams.get('gameId'),board=await readProjection(env.DB),g=board.games.find(x=>x.game_id===id);if(!g)return reply({error:'Unknown game'},404);
 if(request.method==='POST'){
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return reply({error:'Origin mismatch'},403);
  const body=await request.text();if(body.length>4096)return reply({error:'Entry too large'},413);
  let v;try{v=JSON.parse(body);}catch{return reply({error:'Invalid JSON'},400);}
  if(v.projection_version!==g.version||v.projection_issued_at!==g.issued_at)return reply({error:'Projection changed. Refresh the card before saving.'},409);
  if(!validShared(v))return reply({error:'Enter two team scores, confidence 1–5, and football-only reasons.'},400);
  const cutoff=Date.parse(g.cutoff_at??'')||Date.parse(g.kickoff_at)-75*60000;
  if(!Number.isFinite(cutoff))return reply({error:'Cutoff unavailable'},409);
  if(!g.projection)return reply({error:'Projection unavailable'},409);
  const entry={edit_id:crypto.randomUUID(),projection:g.projection,version:g.version,evidence:g.evidence,projection_issued_at:g.issued_at,cutoff_at:g.cutoff_at,game_id:id,source:'ours',away_points:v.away_points,home_points:v.home_points,confidence:v.confidence,tags:v.tags};
  // Database time classifies the write atomically, including a request straddling T75.
  await env.DB.prepare(`INSERT INTO engine_projection_entries(game_id,post_lock,payload)
   SELECT ?, CASE WHEN unixepoch('now')*1000>=? THEN 1 ELSE 0 END,
   json_set(?, '$.entered_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'), '$.post_lock', json(CASE WHEN unixepoch('now')*1000>=? THEN 'true' ELSE 'false' END))
   ON CONFLICT(game_id,post_lock) DO UPDATE SET payload=excluded.payload`).bind(id,cutoff,JSON.stringify(entry),cutoff).run();
 }
 const rows=await env.DB.prepare('SELECT payload FROM engine_projection_entries WHERE game_id=?').bind(id).all<{payload:string}>();
 return reply({entries:rows.results.map(x=>JSON.parse(x.payload)),message:'Our score is saved. The engine updates the card; POST_LOCK leaves the frozen projection unchanged.'});
}
