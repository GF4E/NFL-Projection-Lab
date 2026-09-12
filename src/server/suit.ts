import { type Board,type Entry,type Person,eligible,validateEntry,priceEntry } from "../domain/suit";
const URL = "https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/iron-man-v1/board.json";
type Env={DB:D1Database;GABE_EDIT_KEY?:string;JARRETT_EDIT_KEY?:string;NOTE_SYNC_KEY?:string};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{"cache-control":"no-store"}});
export async function readSuit(db:D1Database,now=Date.now(),fetcher:typeof fetch=fetch):Promise<Board> {
 const old=await db.prepare("SELECT payload,checked_at FROM engine_suit_publication WHERE id=1").first<{payload:string;checked_at:number}>();
 if(old&&now-old.checked_at<300000)return JSON.parse(old.payload);
 try {
 const r=await fetcher(URL+"?t="+now,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("source unavailable");
 const b=await r.json() as Board;if(b.schema!=="iron-man-suit-v1"||!b.games?.length||!b.distribution?.targets||!Number.isFinite(Date.parse(b.as_of)))throw Error("invalid sheet");
 if(old&&Date.parse(b.as_of)<Date.parse(JSON.parse(old.payload).as_of))throw Error("rollback");
 await db.prepare("INSERT INTO engine_suit_publication(id,payload,checked_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at WHERE excluded.checked_at>=engine_suit_publication.checked_at").bind(JSON.stringify(b),now).run();return b;
 } catch(e) {if(old)return {...JSON.parse(old.payload),status:"STALE"};throw e;}
}
export function visibleEntries(entries:Entry[],person:Person):Entry[] {return entries.length===2&&new Set(entries.map(e=>e.person)).size===2?entries:entries.filter(e=>e.person===person);}
export async function suit(request:Request,env:Env):Promise<Response> {
 try {
 const url=new globalThis.URL(request.url),token=request.headers.get("authorization")?.replace(/^Bearer /,"");
 if(url.pathname==="/api/suit-board")return request.method==="GET"?json(await readSuit(env.DB)):json({error:"Read only"},405);
 if(url.pathname.endsWith("/sync")){
 if(!env.NOTE_SYNC_KEY||token!==env.NOTE_SYNC_KEY)return json({error:"Unauthorized"},401);
 if(request.method!=="GET")return json({error:"Read only"},405);
 const rows=await env.DB.prepare("SELECT payload FROM engine_suit_entries").all<{payload:string}>();return json({entries:rows.results.map(r=>JSON.parse(r.payload))});
 }
 const person:Person|null=env.GABE_EDIT_KEY&&token===env.GABE_EDIT_KEY?"Gabe":env.JARRETT_EDIT_KEY&&token===env.JARRETT_EDIT_KEY?"Jarrett":null;
 if(!person)return json({error:"Enter your personal edit code"},401);
 if(!["GET","POST"].includes(request.method))return json({error:"Method not allowed"},405);
 const board=await readSuit(env.DB),id=url.searchParams.get("gameId"),g=board.games.find(g=>g.game.game_id===id);if(!g)return json({error:"Game not on current sheet"},404);
 if(request.method==="POST"){
 if(request.headers.get("origin")&&request.headers.get("origin")!==url.origin)return json({error:"Origin mismatch"},403);
 if(Number(request.headers.get("content-length"))>4096)return json({error:"Entry too large"},413);
 const body=await request.text();if(body.length>4096)return json({error:"Entry too large"},413);const v=JSON.parse(body);
 if(!validateEntry(v))return json({error:"Enter a home handicap, total, confidence 1–5 and at least one fixed tag"},400);
 if(board.status==="STALE")return json({error:"Sheet source unavailable; submission deferred"},503);
 const now=Date.now(),cutoff=Date.parse(g.game.cutoff_at);if(now>=cutoff)return json({error:"LOCKED: entries closed"},409);
 const provisional=board.confidence_config.people[person].provisional;let map:Record<string,number>=provisional,version=board.confidence_config.version;
 const weekly=board.confidence_maps?.calibration.filter(c=>c.person===person&&c.population==="REGULAR");
 if(eligible(board,person)&&weekly?.length===5){map=Object.fromEntries(weekly.map(c=>[c.level,c.posterior]));version=board.confidence_maps!.version;}
 const entry:Entry={game_id:id!,person,spread:v.spread,total:v.total,confidence:v.confidence,tags:v.tags,submitted_at:new Date(now).toISOString(),input_class:now<Date.parse(g.early_at)?"PRE_OPEN":"POST_OPEN",confidence_map:map,confidence_version:version};
 // First submission is final: the second person cannot reveal, edit, and resubmit.
 const inserted=await env.DB.prepare("INSERT INTO engine_suit_entries(game_id,person,payload,cutoff_at) SELECT ?,?,?,? WHERE CAST(strftime('%s','now') AS INTEGER)*1000 < ? ON CONFLICT(game_id,person) DO NOTHING").bind(id,person,JSON.stringify(entry),cutoff,cutoff).run();
 if(!inserted.meta.changes)return json({error:"Already submitted or locked; first independent entry is final"},409);
 }
 const rows=await env.DB.prepare("SELECT payload FROM engine_suit_entries WHERE game_id=?").bind(id).all<{payload:string}>();const all=rows.results.map(r=>JSON.parse(r.payload) as Entry),visible=visibleEntries(all,person);
 // Map and probabilities derived from it are never returned before 50 grades.
 return json({person,revealed:visible.length===2,entries:visible.map(e=>({person:e.person,spread:e.spread,total:e.total,confidence:e.confidence,tags:e.tags,submitted_at:e.submitted_at,input_class:e.input_class,pricing:priceEntry(e,g,board)})),locked:Date.now()>=Date.parse(g.game.cutoff_at)});
 } catch {return json({error:"Sheet or private entry service unavailable"},503);}
}
