import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameDecision, GameRow } from '../src/components/locked-model-board';
import { assertPublicationProgress, displayBoard, refreshLockedBoard, validateBoard } from '../src/server/locked-board';
import type { LockedBoard, LockedGame, Verdict } from '../src/domain/locked-board';

const verdict: Verdict = { state: 'PLAY', availability: 'LOCKED', side: 'Home', line: -3, price: -110, book: 'betmgm', fair_probability: .65, EV: .1, grade: null, edge_source: 'price' };
const game: LockedGame = { game_id: 'synthetic', season: 2026, week: 1, home_team: 'Home', away_team: 'Away', home_abbr: 'H', away_abbr: 'A', status: 'LOCKED', lock_status: 'LOCKED', version: 'test-v1', freeze_time: '2026-09-10T23:05Z', expires_at: '2026-09-11T00:20Z', kickoff_at: '2026-09-11T00:20Z', verdicts: { spreads: verdict, totals: {...verdict, side: 'Under', line: 44.5} } };
const board: LockedBoard = {schema:'locked-board-v1',version:'test-v1',published_at:'2026-09-10T23:05Z',content_sha256:'a'.repeat(64),default_week:1,games:[game]};

describe('read-only locked board', () => {
  it('shows two published verdicts and freeze/version', () => {
    const html=renderToStaticMarkup(<GameDecision game={game}/>);
    expect(html).toContain('T−75 consensus');expect(html).toContain('test-v1');expect(html).toContain('Freeze:');
  });
  it('shows a MISSED game without inventing a pick', () => {
    const missed:Verdict={state:null,availability:'MISSED',reason:'LATE',edge_source:null,grade:null};
    const html=renderToStaticMarkup(<GameRow book="betmgm" game={{...game,lock_status:'MISSED',verdicts:{spreads:missed,totals:missed}}}/>);
    expect(html.match(/>no lock</g)?.length).toBe(1);expect(html).not.toContain('>PLAY<');
  });
  for (const grade of ['W','L','PUSH'] as const) it(`shows FINAL and ${grade} without open lines`, () => {
    const g={...game,status:'FINAL',final_score:{home:13,away:10},margin:3,total:23,verdicts:{spreads:{...verdict,grade},totals:{...verdict,grade}}};
    const html=renderToStaticMarkup(<GameRow game={g} book="betmgm"/>);
    expect(html).toContain(`>${grade === 'W' ? 'WIN' : grade === 'L' ? 'LOSS' : 'PUSH'}<`);expect(html).toContain('-110');
  });
  it('retains immutable locks after kickoff and publication delay', () => {
    const now=Date.parse('2026-09-10T23:06Z');
    expect(displayBoard(board,now,now).games[0].verdicts.spreads.state).toBe('PLAY');
    expect(displayBoard(board,now-900001,now).games[0].verdicts.spreads.state).toBe('PLAY');
    expect(displayBoard(board,now,Date.parse(game.expires_at)).games[0].status).toBe('LOCKED');
    const final={...game,status:'FINAL',final_score:{home:13,away:10}};
    expect(displayBoard({...board,games:[final]},0,now).games[0]).toEqual(final);
  });
  it('rejects incomplete publications and keeps last-good on fetch failure', async () => {
    expect(()=>validateBoard({...board,games:[{...game,verdicts:{spreads:{...verdict,price:undefined},totals:verdict}}]})).toThrow();
    let writes=0;
    const db={exec:async()=>{writes++;},prepare:()=>{writes++;}} as unknown as D1Database;
    await expect(refreshLockedBoard(db,async()=>new Response('error',{status:503}))).rejects.toThrow();
    expect(writes).toBe(0);
  });
  it('rejects publication rollback and protects first grades and finals', () => {
    const previous={...board,games:[{...game,status:'FINAL',final_score:{home:13,away:10},verdicts:{...game.verdicts,spreads:{...verdict,grade:'W' as const}}}]};
    expect(()=>assertPublicationProgress(previous,{...previous,published_at:'2026-09-09T00:00Z'})).toThrow();
    expect(()=>assertPublicationProgress(previous,board)).toThrow();
    expect(()=>assertPublicationProgress(previous,{...previous,games:[{...previous.games[0],verdicts:{...previous.games[0].verdicts,spreads:{...verdict,grade:'L'}}}]})).toThrow();
    expect(()=>assertPublicationProgress(previous,previous)).not.toThrow();
  });
  it('displays TEASE as a leg needing a partner', () => {
    const v:Verdict={...verdict,state:'TEASE',leg:'Home',teased_line:-2,key_numbers_crossed:[3,7],best_book:'fanduel',teaser_price:-110,partner_status:'NEEDS_PARTNER'};
    const html=renderToStaticMarkup(<GameDecision game={{...game,verdicts:{spreads:v,totals:verdict}}}/>);
    expect(html).toContain('NEEDS_PARTNER');expect(html).toContain('FanDuel');
  });
});


it('shows a teaser price near miss without claiming a TEASE ticket', () => {
  const v:Verdict={...verdict,state:'HARD PASS',teaser_notice:'TEASE candidate, best teaser price -120 at DraftKings',leg:'Home',original_line:-8,teased_line:-2,best_book:'draftkings',teaser_price:-120,key_numbers_crossed:[3,7],teaser_pricing:{as_of:'2026-09-11',source_page:'https://example.com/teasers',scope:'Posted reference'}};
  const g={...game,verdicts:{spreads:v,totals:verdict}};
  expect(renderToStaticMarkup(<GameRow game={g} book="betmgm"/>)).toContain('TEASE candidate, best teaser price -120 at DraftKings');
  const details=renderToStaticMarkup(<GameDecision game={g}/>);
  expect(details).toContain('Posted reference');expect(details).toContain('2026-09-11');expect(details).not.toContain('NEEDS_PARTNER');
});
