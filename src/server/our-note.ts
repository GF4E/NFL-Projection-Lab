import type { LockedGame } from '../domain/locked-board';
import { readLockedBoard } from './locked-board';
type Env={DB:D1Database; NOTE_EDIT_KEY?:string; NOTE_SYNC_KEY?:string};
export type OurNote={game_id:string;author:'Gabe'|'Jarrett';text:string;market:'spreads'|'totals'|'';side:string;updated_at:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export function validateNote(value:unknown,game:LockedGame,now:number):OurNote {
  const n=value as OurNote;
  const cutoff=Date.parse(game.note_deadline ?? game.cutoff_at ?? '') || Date.parse(game.kickoff_at)-75*60_000;
  if(!Number.isFinite(cutoff)||now>=cutoff||game.lock_status==='LOCKED'||game.lock_status==='MISSED'||game.status==='FINAL')throw new Error('Notes close at T-75. This game is locked.');
  if(!n||!['Gabe','Jarrett'].includes(n.author)||typeof n.text!=='string'||n.text.length>2000||!['','spreads','totals'].includes(n.market))throw new Error('Enter an author, a note of up to 2,000 characters, and a valid market.');
  const sides=n.market==='totals'?['Over','Under']:n.market==='spreads'?[game.home_team,game.away_team]:[''];
  if(!sides.includes(n.side))throw new Error('Choose a side for the selected market.');
  return {game_id:game.game_id,author:n.author,text:n.text,market:n.market,side:n.side,updated_at:new Date(now).toISOString()};
}
function authorized(request:Request,key?:string){return !!key && request.headers.get('authorization')===`Bearer ${key}`;}
export async function ourNote(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);const sync=url.pathname.endsWith('/sync');
  if(!authorized(request,sync?env.NOTE_SYNC_KEY:env.NOTE_EDIT_KEY))return json({error:'Enter the team edit code.'},401);
  try{
    if(sync){
      if(request.method!=='GET')return json({error:'Method not allowed'},405);
      const rows=await env.DB.prepare('SELECT payload FROM engine_our_notes').all<{payload:string}>();
      return json({notes:rows.results.map(r=>JSON.parse(r.payload))});
    }
    const gameId=url.searchParams.get('game_id');
    if(!gameId)return json({error:'Game required'},400);
    if(request.method==='GET'){
      const row=await env.DB.prepare('SELECT payload FROM engine_our_notes WHERE game_id=?').bind(gameId).first<{payload:string}>();
      return json({note:row?JSON.parse(row.payload):null});
    }
    if(request.method!=='PUT')return json({error:'Method not allowed'},405);
    if(request.headers.get('origin') && request.headers.get('origin')!==url.origin)return json({error:'Origin rejected'},403);
    const text=await request.text();if(text.length>5000)return json({error:'Note too long'},413);
    const board=await readLockedBoard(env.DB,fetch,Date.now(),true);const game=board.games.find(g=>g.game_id===gameId);
    if(!game)return json({error:'Unknown game'},404);
    const note=validateNote(JSON.parse(text),game,Date.now());const cutoff=Date.parse(game.note_deadline ?? game.cutoff_at ?? '')||Date.parse(game.kickoff_at)-75*60_000;
    const result=await env.DB.prepare("INSERT INTO engine_our_notes (game_id,payload,cutoff_at) SELECT ?,?,? WHERE CAST(strftime('%s','now') AS INTEGER)*1000 < ? ON CONFLICT(game_id) DO UPDATE SET payload=excluded.payload WHERE CAST(strftime('%s','now') AS INTEGER)*1000 < engine_our_notes.cutoff_at").bind(gameId,JSON.stringify(note),cutoff,cutoff).run();
    if(!result.meta.changes)return json({error:'Notes close at T-75.'},409);
    return json({note});
  }catch(error){return json({error:error instanceof Error?error.message:'Notes unavailable; your draft has not been saved.'},409);}
}
