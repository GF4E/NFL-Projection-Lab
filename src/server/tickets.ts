import {validateTicket,type TicketInput,type Ticket} from '../domain/tickets';
import {readLockedBoard} from './locked-board';
type Env={DB:D1Database;NOTE_EDIT_KEY?:string;NOTE_SYNC_KEY?:string};
const json=(x:unknown,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
export const TICKET_TABLE='CREATE TABLE IF NOT EXISTS engine_tickets (id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,stake_cents INTEGER NOT NULL,cutoff_at INTEGER NOT NULL,contract_key TEXT NOT NULL UNIQUE)';
export const INSERT_TICKET=`INSERT INTO engine_tickets(id,payload,stake_cents,cutoff_at,contract_key) SELECT ?,?,?,?,? WHERE CAST(strftime('%s','now') AS INTEGER)*1000 < ? AND NOT EXISTS (SELECT 1 FROM json_each(?) incoming WHERE (SELECT COALESCE(SUM(t.stake_cents),0) FROM engine_tickets t WHERE EXISTS (SELECT 1 FROM json_each(t.payload,'$.legs') oldleg WHERE json_extract(oldleg.value,'$.game_id')=json_extract(incoming.value,'$.game_id'))) + ? > 10000)`;
export async function tickets(request:Request,env:Env){
 const url=new URL(request.url),sync=url.pathname.endsWith('/sync'),key=sync?env.NOTE_SYNC_KEY:env.NOTE_EDIT_KEY;
 if(!key||request.headers.get('authorization')!==`Bearer ${key}`)return json({error:'Enter the team code to view or lock picks.'},401);
 if(!['GET','POST'].includes(request.method)||sync&&request.method!=='GET')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Origin rejected'},403);
 try{
  await env.DB.exec(TICKET_TABLE);
  if(request.method==='GET'){
   const rows=await env.DB.prepare('SELECT payload FROM engine_tickets ORDER BY rowid DESC').all<{payload:string}>();
   let grades:unknown[]=[];
   if(!sync){try{const r=await fetch('https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/human-tickets-v1/grades.json',{signal:AbortSignal.timeout(5000)});if(r.ok)grades=(await r.json() as {grades:unknown[]}).grades;}catch{/* Pending daily grade. */}}
   return json({tickets:rows.results.map(r=>JSON.parse(r.payload)),grades});
  }
  const raw=await request.text();if(raw.length>25000)return json({error:'Ticket is too large'},413);
  const input=JSON.parse(raw) as TicketInput;
  const existing=typeof input.id==='string'?await env.DB.prepare('SELECT payload FROM engine_tickets WHERE id=?').bind(input.id).first<{payload:string}>():null;
  if(existing){const t=JSON.parse(existing.payload) as Ticket;if(JSON.stringify(input.legs)!==JSON.stringify(t.legs.map(({settlement_line,kickoff_at,home_abbr,away_abbr,week,season,...l})=>l))||input.stake_cents!==t.stake_cents||input.type!==t.type||input.book!==t.book||input.record_class!==t.record_class||(t.type!=='single'&&input.price!==t.price))throw Error('This ticket ID is already locked with different details.');return json({ticket:t,replayed:true});}
  const board=await readLockedBoard(env.DB,fetch,Date.now(),true);
  const ticket=validateTicket(input,board,Date.now());
  const contract=JSON.stringify([ticket.type,ticket.book,ticket.record_class,ticket.stake_cents,ticket.price,ticket.legs.map(l=>[l.game_id,l.market,l.side,l.settlement_line]).sort()]);
  const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(contract)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const r=await env.DB.prepare(INSERT_TICKET).bind(ticket.id,JSON.stringify(ticket),ticket.stake_cents,ticket.cutoff_at,key,ticket.cutoff_at,JSON.stringify(ticket.legs),ticket.stake_cents).run();
  if(!r.meta.changes)throw Error('Lock rejected: game started or total locked stake exceeds $100 for a game.');
  return json({ticket},201);
 }catch(e){const message=e instanceof Error?e.message:'Unable to lock ticket';return json({error:message.includes('UNIQUE constraint')?'This ticket is already locked.':message},409);}
}
