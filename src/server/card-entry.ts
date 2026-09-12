import {readLockedBoard} from './locked-board';
type Env={DB:D1Database;NOTE_EDIT_KEY?:string;NOTE_SYNC_KEY?:string};
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
export const footballOnly=(v:string)=>!(/price|book|cents|break-even|\bEV\b|cushion|reference|filter|stale|Jarrett|Gabe|\$/i.test(v));
export function validShared(v:unknown){const x=v as Record<string,unknown>;return !!x&&Number.isFinite(x.spread)&&Math.abs(x.spread as number)<=60&&Number.isFinite(x.total)&&(x.total as number)>=0&&(x.total as number)<=150&&Number.isInteger(x.confidence)&&(x.confidence as number)>=1&&(x.confidence as number)<=5&&Array.isArray(x.tags)&&x.tags.length>0&&x.tags.length<=10&&x.tags.every(t=>typeof t==='string'&&t.length<=80&&footballOnly(t))&&typeof x.text==='string'&&x.text.length<=95&&footballOnly(x.text);}
export async function cardEntry(request:Request,env:Env){
 const url=new URL(request.url),token=request.headers.get('authorization')?.replace(/^Bearer /,''),sync=url.pathname.endsWith('/sync'),key=sync?env.NOTE_SYNC_KEY:env.NOTE_EDIT_KEY;
 if(!key||token!==key)return reply({error:'Team edit code required'},401);
 if(!['GET','POST'].includes(request.method)||sync&&request.method!=='GET')return reply({error:'Method not allowed'},405);
 await env.DB.exec('CREATE TABLE IF NOT EXISTS engine_shared_entries (game_id TEXT NOT NULL, post_lock INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(game_id,post_lock))');
 if(sync){const rows=await env.DB.prepare('SELECT payload FROM engine_shared_entries').all<{payload:string}>();return reply({entries:rows.results.map(x=>JSON.parse(x.payload))});}
 const id=url.searchParams.get('gameId'),board=await readLockedBoard(env.DB),g=board.games.find(x=>x.game_id===id);if(!g)return reply({error:'Unknown game'},404);
 if(request.method==='POST'){
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return reply({error:'Origin mismatch'},403);
  const body=await request.text();if(body.length>4096)return reply({error:'Entry too large'},413);
  let v;try{v=JSON.parse(body);}catch{return reply({error:'Invalid JSON'},400);}
  if(!validShared(v))return reply({error:'Enter a spread, total, confidence 1–5, and football-only tags and text.'},400);
  const cutoff=Date.parse(g.cutoff_at??g.note_deadline??'')||Date.parse(g.kickoff_at)-75*60000;
  if(!Number.isFinite(cutoff))return reply({error:'Cutoff unavailable'},409);
  const entry={game_id:id,source:'ours',spread:v.spread,total:v.total,confidence:v.confidence,tags:v.tags,text:v.text};
  // Database time classifies the write atomically, including a request straddling T75.
  await env.DB.prepare(`INSERT INTO engine_shared_entries(game_id,post_lock,payload)
   SELECT ?, CASE WHEN unixepoch('now')*1000>=? THEN 1 ELSE 0 END,
   json_set(?, '$.entered_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'), '$.post_lock', json(CASE WHEN unixepoch('now')*1000>=? THEN 'true' ELSE 'false' END))
   ON CONFLICT(game_id,post_lock) DO UPDATE SET payload=excluded.payload`).bind(id,cutoff,JSON.stringify(entry),cutoff).run();
 }
 const rows=await env.DB.prepare('SELECT payload FROM engine_shared_entries WHERE game_id=?').bind(id).all<{payload:string}>();
 return reply({entries:rows.results.map(x=>JSON.parse(x.payload)),message:'Our number is saved. The engine updates the card; POST_LOCK leaves the frozen pick unchanged.'});
}
