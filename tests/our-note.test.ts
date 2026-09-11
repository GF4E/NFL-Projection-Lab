import {describe,it,expect} from 'vitest';
import {validateNote,ourNote} from '../src/server/our-note';
import {displayBoard} from '../src/server/locked-board';
import type {LockedGame,LockedBoard} from '../src/domain/locked-board';
const game={game_id:'GAME',home_team:'Home',away_team:'Away',kickoff_at:'2026-09-13T17:00:00Z',cutoff_at:'2026-09-13T15:45:00Z',lock_status:'LIVE',status:'UPCOMING'} as LockedGame;
const note={author:'Jarrett',text:'Our view',market:'spreads',side:'Home'};
describe('shared notes',()=>{
 it('accepts a qualified note and stamps server time',()=>{const n=validateNote(note,game,Date.parse('2026-09-13T15:44:59Z'));expect(n.author).toBe('Jarrett');expect(n.updated_at).toBe('2026-09-13T15:44:59.000Z');});
 it('rejects edits at and after T75, including a stale LIVE board',()=>{for(const time of ['2026-09-13T15:45:00Z','2026-09-13T15:46:00Z'])expect(()=>validateNote(note,game,Date.parse(time))).toThrow('locked');});
 it('rejects edits to a locked record even before a manipulated deadline',()=>{expect(()=>validateNote(note,{...game,lock_status:'LOCKED'},0)).toThrow();});
 it('rejects a side from another game or an invalid author',()=>{expect(()=>validateNote({...note,side:'Other'},game,0)).toThrow();expect(()=>validateNote({...note,author:'Visitor'},game,0)).toThrow();});
 it('requires the team credential',async()=>{const r=await ourNote(new Request('https://example.com/api/our-note?game_id=GAME',{method:'PUT'}),{DB:{} as D1Database,NOTE_EDIT_KEY:'secret'});expect(r.status).toBe(401);});
 it('keeps current live picks visible and expires stale publications',()=>{const b={games:[game]} as LockedBoard;expect(displayBoard(b,100,100).games[0].lock_status).toBe('LIVE');expect(displayBoard(b,100,1_000_000).games[0].verdicts.spreads.availability).toBe('STALE');});
});
