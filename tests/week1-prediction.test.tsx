import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Week1PredictionRow} from '../src/components/week1-prediction-row';
import {displayBoard,validateBoard} from '../src/server/locked-board';
import type {LockedBoard,LockedGame,Week1Prediction,Verdict} from '../src/domain/locked-board';
const v:Verdict={state:'HARD PASS',availability:'LIVE',reason:'Filter not met',grade:null,edge_source:'tiebreak'};
const pick={status:'AVAILABLE',side:'Away',line:3.5,book:'betmgm',price:-102,win:.499,push:0,fair_probability:.499,EV:-.012,betting_status:'LEAN ONLY — filter not met',negative_EV:true,grade:null};
const prediction:Week1Prediction={projection:{status:'AVAILABLE',version:'test',winner:'Home',win_probability:.58,tie_probability:.01,home_score:24.25,away_score:20.25,score_label:'market-based score estimate'},selections:{spreads:pick,totals:{...pick,side:'Over',line:47.5}},stale:false,frozen:false,explanation:[]};
const g:LockedGame={game_id:'demo',season:2026,week:1,home_team:'Home',away_team:'Away',home_abbr:'SEA',away_abbr:'NE',kickoff_at:'2026-09-13T17:00Z',expires_at:'2026-09-13T17:00Z',version:'v1',status:'UPCOMING',lock_status:'LIVE',freeze_time:null,verdicts:{spreads:v,totals:v},prediction};
const board:LockedBoard={schema:'locked-board-v1',version:'v1',published_at:'2026-09-13T15:40Z',content_sha256:'a'.repeat(64),default_week:1,games:[g]};
it('renders supplied winner and scores independently from ATS, with negative EV',()=>{
 const html=renderToStaticMarkup(<Week1PredictionRow game={g} analytics={null}/>);
 expect(html).toContain('24.3');expect(html).toContain('20.3');expect(html).toContain('58.0%');expect(html).toContain('1.0%');expect(html).toContain('market-based score estimate');expect(html).toContain('LEAN ONLY');expect(html).toContain('negative');expect(html).toContain('3.5');expect(html).not.toContain('>PLAY<');
});
it('keeps estimates but suppresses actionable PLAY on delayed publication',()=>{
 const b={...board,games:[{...g,prediction:{...prediction,selections:{...prediction.selections,spreads:{...pick,betting_status:'PLAY'}}}}]};
 const r=displayBoard(b,0,1000000).games[0];expect(r.prediction?.projection).toEqual(prediction.projection);expect(r.prediction?.selections.spreads.betting_status).toContain('STALE');
});
it('shows final score with separate winner and ATS grades',()=>{
 const game={...g,status:'FINAL',lock_status:'LOCKED',final_score:{home:24,away:21},prediction:{...prediction,winner_grade:'WIN',selections:{spreads:{...pick,grade:'W'},totals:{...pick,grade:'L'}}}};
 const html=renderToStaticMarkup(<Week1PredictionRow game={game} analytics={null}/>);expect(html).toContain('FINAL');expect(html).toContain('WIN');expect(html).toContain('LOSS');
});
it('does not invent historical winner projections and shows missed badge',()=>{
 const html=renderToStaticMarkup(<Week1PredictionRow game={{...g,status:'FINAL',lock_status:'MISSED',final_score:{home:13,away:10},prediction:undefined}} analytics={null}/>);
 expect(html).toContain('not recorded');expect(html).toContain('No lock: capture late');expect(html).not.toContain('58.0%');
});
it('rejects malformed projected scores',()=>{expect(()=>validateBoard({...board,games:[{...g,prediction:{...prediction,projection:{...prediction.projection,home_score:NaN}}}]})).toThrow('Invalid projection');});
