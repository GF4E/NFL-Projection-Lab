// @vitest-environment jsdom
import React from 'react';import {afterEach,describe,it,expect} from 'vitest';import {render,screen,fireEvent,cleanup} from '@testing-library/react';import {BoardView,PointsAxis,ErrorAxis} from '../src/components/board-v7';import {currentBoardWeek,position,sortGames,type BoardEvidence,type GameEvidence} from '../src/domain/board-v7';import type {ProjectionCardData,ProjectionBoardData} from '../src/domain/projection';
Object.defineProperty(window,'matchMedia',{value:()=>({matches:true})});
afterEach(cleanup);
const p={away_points:20.25,home_points:30,margin:9.75,total:50.25,home_win_probability:.7,away_win_probability:.3,intervals:{margin:{'50':[0,15],'80':[-5,25]},total:{'50':[40,60],'80':[30,70]}}};
const game={game_id:'final',away:'BAL',home:'IND',week:1,season:2026,kickoff_at:'2026-09-10T20:00:00Z',cutoff_at:'2026-09-10T18:45:00Z',issued_at:'2026-09-09T20:00:00Z',freeze_time:'2026-09-10T18:45:00Z',status:'FINAL',evidence:'AS_ISSUED',projection:p,final:{away_points:25,home_points:50},team_colors:{BAL:'#241773',IND:'#002C5F'},contributions:{away:[],home:[]},version:'v7',why:{lines:[],against:'Against:'}} as unknown as ProjectionCardData;
const e:GameEvidence={qualified_lock:true,teams:{away:{expected:20.25,actual:25,error:4.75,intervals:{'50':[15,25],'80':[10,30]},hits:{'50':true,'80':true},pit:.7},home:{expected:30,actual:50,error:20,intervals:{'50':[25,35],'80':[20,40]},hits:{'50':false,'80':false},pit:1}}};
const upcoming={...game,game_id:'upcoming',status:'UPCOMING',final:undefined,freeze_time:null} as ProjectionCardData;const missed={...upcoming,game_id:'missed',status:'MISSED',projection:null} as ProjectionCardData;
const board={default_week:1,games:[game,upcoming,missed]} as ProjectionBoardData;const ev={games:{final:e},trust:{inside80:1,eligible80:2}} as unknown as BoardEvidence;
describe('BOARD v7 contract',()=>{
 it('maps exact unrounded values and clips at axes',()=>{expect(position(20.25,'POINTS')).toBe(45);expect(position(-10,'ERROR')).toBeCloseTo(100/3);expect(position(50,'POINTS')).toBe(100)});
 it('renders original positions and separates observed ring',()=>{const {container}=render(<PointsAxis g={game} e={e}/>);expect((container.querySelector('[data-value="20.25"]') as HTMLElement).style.left).toBe('45%');expect(container.querySelectorAll('.v7-ring')).toHaveLength(2);expect(container.querySelectorAll('.outside')).toHaveLength(1)});
 it('keeps outside error beyond its outer band',()=>{const {container}=render(<ErrorAxis g={game} e={e}/>);const lane=container.querySelectorAll('.v7-error-lane')[1];const dot=lane.querySelector('.v7-dot') as HTMLElement;const band=lane.querySelector('[data-band="80"]') as HTMLElement;expect(parseFloat(dot.style.left)).toBeGreaterThan(parseFloat(band.style.left)+parseFloat(band.style.width))});
 it('does not change lens on rerender and preserves identities and colors',()=>{const r=render(<BoardView board={board} evidence={ev}/>);expect(r.container.querySelectorAll('.v7-detail')).toHaveLength(0);expect(screen.queryByText('Football WHY')).toBeNull();const rows=[...r.container.querySelectorAll('article')];fireEvent.click(screen.getByRole('button',{name:'ERROR'}));r.rerender(<BoardView board={{...board}} evidence={ev}/>);expect(screen.getByRole('button',{name:'ERROR'}).getAttribute('aria-pressed')).toBe('true');expect([...r.container.querySelectorAll('article')]).toEqual(rows);expect(screen.getByText('not played')).toBeTruthy();expect(screen.getAllByText('no lock').length).toBeGreaterThan(0);expect(screen.getByText('1 of 2 inside 80%')).toBeTruthy();fireEvent.click(r.container.querySelectorAll('.v7-row')[0]);expect(r.container.querySelector('.v7-detail [data-axis="POINTS"]')).toBeTruthy();fireEvent.click(r.container.querySelectorAll('.v7-row')[1]);expect(r.container.querySelectorAll('.v7-detail')).toHaveLength(1)});
 it('sorts both unknowns last in both directions',()=>{for(const order of ['ascending','descending'])expect(sortGames([missed,upcoming,game],{final:e},order).map(g=>g.game_id)).toEqual(['final','missed','upcoming'])});
 it('disables sorting without a final',()=>{render(<BoardView board={{...board,games:[upcoming]}} evidence={ev}/>);expect(screen.getByLabelText('Sort games').hasAttribute('disabled')).toBe(true)});
 it('contains no forbidden or decimal text',()=>{const {container}=render(<BoardView board={board} evidence={ev}/>);for(const lens of ['POINTS','ERROR']){fireEvent.click(screen.getByRole('button',{name:lens}));expect(container.textContent).not.toMatch(/\d+\.\d+|coin flip|\b(?:odds|EV|PLAY|PASS|TEASE|Gabe|Jarrett|FanDuel|BetMGM|Caesars|DraftKings)\b/i)}});
});
it('enforces integer display in expanded view',()=>{const {container}=render(<BoardView board={board} evidence={ev}/>);fireEvent.click(container.querySelector('.v7-row')!);expect(container.textContent).not.toMatch(/\d+\.\d+/);expect(screen.getByText('Football WHY')).toBeTruthy()});
it('uses the binding confidence edit label',()=>{const {container}=render(<BoardView board={board} evidence={ev}/>);fireEvent.click(container.querySelector('.v7-row')!);expect(screen.getByLabelText('confidence')).toBeTruthy();expect(screen.queryByText('Conviction')).toBeNull()});
it('never renders injected PFF column values or removed controls in either lens or expanded state',()=>{const sentinel='PFF_PRIVATE_COLUMN_CANARY_726184';const g={...game,sheet:{'4':{name:'Efficiency',data_window:'prior games',teams:{BAL:{pff_grade:sentinel,grades_offense:sentinel}}}},contributions:{...game.contributions,away:[{input:'pff_grade',label:sentinel,points:726184,status:'ACTIVE',value:726184,weight:1,source_hashes:[]}]}};const {container}=render(<BoardView board={{...board,games:[g]}} evidence={ev}/>);for(const lens of ['POINTS','ERROR']){fireEvent.click(screen.getByRole('button',{name:lens}));for(let i=0;i<2;i++){fireEvent.click(container.querySelector('.v7-row')!);expect(container.innerHTML).not.toContain(sentinel);expect(container.innerHTML).not.toContain('726184');expect(container.querySelector('[class*="slip"],[class*="winner-bar"],[class*="verdict"],[class*="wager"],[class*="book-selector"]')).toBeNull();expect(container.textContent).not.toMatch(/\b(?:PLAY|PASS|TEASE|odds|EV|Gabe|Jarrett|FanDuel|BetMGM|Caesars|DraftKings)\b|coin flip|break-even|consensus|market line/i)}}});
import {SeasonView} from '../src/components/season-v7';
it('keeps PFF column values out of the Season output',()=>{const empty={teams:0,mae:null,inside80:0,eligible80:0,coverage:{margin:{'50':{hit:0,n:0,rate:null},'80':{hit:0,n:0,rate:null}},total:{'50':{hit:0,n:0,rate:null},'80':{hit:0,n:0,rate:null}}},pit:Array(10).fill(0)};const row={game_id:'final',team:'BAL',expected:20,actual:21,error:1,contributions:[{input:'pff_grade',label:'PFF_PRIVATE_COLUMN_CANARY_726184',points:726184,status:'ACTIVE',value:726184,weight:1,source_hashes:[]}]};const data={...ev,weeks:[],trust:empty,closest:[row],furthest:[row],prior_seasons:[],reference:{oof_mae:8,climatology_mae:9,floor:null,floor_status:'uncomputed'},edits:{engine:empty,ours:empty,best_tags:[],worst_tags:[]}} as BoardEvidence;const {container}=render(<SeasonView data={data}/>);expect(container.innerHTML).not.toContain('PFF_PRIVATE_COLUMN_CANARY_726184');expect(container.textContent).not.toContain('726184');expect(container.textContent).not.toMatch(/\b(?:PLAY|PASS|TEASE|odds|EV|Gabe|Jarrett)\b|coin flip|break-even|consensus/i)});

it('opens the current slate despite a stale default and retains history selection',()=>{
 const games=[game,{...upcoming,game_id:'week2',week:2,kickoff_at:'2026-09-18T00:15:00Z'}];
 const data={...board,games};
 expect(currentBoardWeek(data,Date.parse('2026-09-16T12:00:00Z'))).toBe(2);
 expect(currentBoardWeek(data,Date.parse('2026-09-10T21:00:00Z'))).toBe(1);
 expect(currentBoardWeek(data,Date.parse('2026-10-01T00:00:00Z'))).toBe(2);
 expect(currentBoardWeek({...board,games:[]})).toBe(1);
});

import {emptySeasonEvidence,SeasonV7} from '../src/components/season-v7';
it('renders every Season block with a named shortfall when nothing is loaded',()=>{
 const {container}=render(<SeasonV7/>);
 for(const name of ['Convergence','Calibration','What we got right and what we got wrong','Early-season effect','Our numbers'])expect(screen.getByRole('heading',{name})).toBeTruthy();
 expect(container.textContent).not.toMatch(/unavailable|unavailability/i);
 expect(container.textContent).toContain('0 games loaded');
 expect(container.textContent).toContain('Needs at least 1 graded game');
 expect(container.textContent).toContain('Needs weekly out-of-fold results');
 expect(container.querySelectorAll('[data-reference]')).toHaveLength(3);
});
it('shows a single graded week, counts, rankings, and all five historical curves',()=>{
 const d=emptySeasonEvidence();d.trust={...d.trust,teams:2,mae:4};d.weeks=[{week:1,scope:'week',engine:d.trust,ours:d.edits.ours}];d.prior_seasons=[2021,2022,2023,2024,2025].flatMap(season=>Array.from({length:18},(_,i)=>({season,week:i+1,mae:8})));d.reference={oof_mae:8,climatology_mae:9,floor:null,floor_status:'uncomputed'};
 const {container}=render(<SeasonView data={d}/>);
 expect(container.textContent).not.toMatch(/unavailable|unavailability/i);
 expect(container.textContent).toContain('1 graded games');expect(container.textContent).toContain('One point');
 expect(container.textContent).toContain('All five historical seasons shown');
 expect(container.querySelectorAll('[data-reference]')).toHaveLength(3);
 expect(container.querySelectorAll('circle').length).toBe(92);
 expect(screen.getByRole('heading',{name:'Week 1 · This week'})).toBeTruthy();
});
