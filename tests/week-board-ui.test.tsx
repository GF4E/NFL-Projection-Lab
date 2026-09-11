// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekOneBoard } from '../src/components/week-one-board';
import { GameRow } from '../src/components/locked-model-board';
import type { LockedBoard, Verdict } from '../src/domain/locked-board';

const missed:Verdict={state:null,availability:'MISSED',reason:'LATE',edge_source:null,grade:null};
const v:Verdict={state:'HARD PASS',availability:'LOCKED',reason:'Below filter',side:'San Francisco 49ers',line:3.5,book:'betmgm',price:-102,edge_source:'tiebreak',grade:'W',fair_probability:.499,EV:-.01};
const stats={wins:1,losses:1,pushes:0,mean_clv_cents:2,clv_n:2};
const payload:LockedBoard={schema:'locked-board-v1',version:'test-v1',published_at:'2026-09-11T08:00Z',content_sha256:'a'.repeat(64),default_week:1,week_records:{'1':{model:stats,price:stats,paper:stats,jaret:stats}},games:[{
 game_id:'2026_01_SF_LA',season:2026,week:1,home_team:'Los Angeles Rams',away_team:'San Francisco 49ers',home_abbr:'LA',away_abbr:'SF',kickoff_at:'2026-09-11T00:35Z',expires_at:'2026-09-11T00:35Z',status:'FINAL',lock_status:'LOCKED',version:'model-v1-'+ 'a'.repeat(64),freeze_time:'2026-09-10T23:19Z',final_score:{home:7,away:27},margin:-20,total:34,verdicts:{spreads:v,totals:{...v,side:'Over',line:47.5,price:-110,edge_source:'price',grade:'L'}},consensus:{spreads:{line:-4,coverage:3},totals:{line:48.5,coverage:3}},executed_picks:[{side:'Los Angeles Rams',line_at_approval:'-3',book_price:'-120',executed_book:'williamhill_us',outcome:'L'}]
}]};
const cached={season:2026,week:1,lines:[{id:'one',gameId:'sf-lar',book:'betmgm' as const,market:'spread' as const,side:'SF',point:3.5,americanPrice:-102,capturedAt:'2026-09-10T23:14Z',sourceEventId:'event',sourceHash:'hash',fairProbability:.49,marketVigPercent:2.3},{id:'two',gameId:'sf-lar',book:'betmgm' as const,market:'spread' as const,side:'LAR',point:-3.5,americanPrice:-118,capturedAt:'2026-09-10T23:14Z',sourceEventId:'event',sourceHash:'hash',fairProbability:.51,marketVigPercent:2.3}]};
const response=(data:unknown)=>({ok:true,json:async()=>data}) as Response;
const install=()=>{const fn=vi.fn<typeof fetch>(async url=>response(String(url).startsWith('/api/lines')?cached:payload));vi.stubGlobal('fetch',fn);return fn;};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});

describe('restored row board',()=>{
 it('shows all five columns, logos, paired saved prices and vig with unchanged verdict grades',async()=>{
  const fn=install();const {container}=render(<WeekOneBoard/>);
  await screen.findByText('SF +3.5 -102');await screen.findByText('VIG 2.3%');
  for(const column of ['MATCHUP','SPREAD','TOTAL','MONEY','VERDICT'])expect(screen.getByText(column)).toBeTruthy();
  expect(container.querySelectorAll('.grid-market-row')).toHaveLength(1);
  expect(container.querySelectorAll('.grid-price-cell')).toHaveLength(6);
  expect(container.querySelectorAll('img')).toHaveLength(2);
  expect(container.querySelectorAll('.week-records dt')).toHaveLength(4);
  expect(container.textContent).toContain('SF 27 — LA 7 FINAL');
  expect(container.textContent).not.toContain('Sep 10, 5:35');
  expect(container.textContent).toContain('SF +3.5 -102 · PASS · WIN');
  expect(container.textContent).toContain('Over 47.5 -110 · PASS · LOSS');
  expect(container.textContent).toContain('Jaret · LA -3 -120 · LOSS');
  expect(fn.mock.calls.every(([url])=>String(url).startsWith('/api/model-board')||String(url).startsWith('/api/lines?week='))).toBe(true);
 });
 it('keeps consensus, freeze, shortened version and analytics in the expanding window',async()=>{
  install();const {container}=render(<WeekOneBoard/>);await screen.findByText('SF +3.5 -102');
  expect(screen.queryByText(/T−75 consensus/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Analytics ↓'}));
  expect(screen.getByText(/T−75 consensus/)).toBeTruthy();
  expect(screen.getByText('Analytics')).toBeTruthy();
  expect(container.textContent).toContain('model-v1-aaaaaaaa');
  expect(container.textContent).not.toContain('a'.repeat(64));
  expect(container.textContent).toContain('Freeze:');
  fireEvent.click(screen.getByRole('button',{name:'Close analytics ↑'}));
  expect(screen.queryByText(/T−75 consensus/)).toBeNull();
 });
 it('shows a single grey no-lock badge, never inventing model selections',()=>{
  const {container}=render(<GameRow book="betmgm" game={{...payload.games[0],lock_status:'MISSED',verdicts:{spreads:missed,totals:missed},executed_picks:[]}}/>);
  expect(screen.getAllByText('no lock')).toHaveLength(1);
  expect(container.querySelectorAll('.grid-verdict-line')).toHaveLength(0);
  expect(container.textContent).not.toContain('STALE');
 });
 it('switches displayed prices without changing frozen picks',async()=>{
  install();const {container}=render(<WeekOneBoard/>);await screen.findByText('SF +3.5 -102');
  fireEvent.click(screen.getByRole('button',{name:'FanDuel'}));
  expect(container.querySelectorAll('.grid-price-cell strong')[0].textContent).toBe('—');
  expect(container.textContent).toContain('SF +3.5 -102 · PASS · WIN');
 });
 it('requests cached prices for the selected week without reusing a different week',async()=>{
  const fn=install();render(<WeekOneBoard/>);await screen.findByText('SF +3.5 -102');
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'2'}});
  expect(screen.getByText('No published games for this week.')).toBeTruthy();
  await waitFor(()=>expect(fn).toHaveBeenCalledWith('/api/lines?week=2',expect.anything()));
 });
 it('refreshes the published board and cached prices only',async()=>{
  const fn=install();render(<WeekOneBoard/>);await screen.findByText('SF +3.5 -102');
  fireEvent.click(screen.getByRole('button',{name:'Refresh board'}));
  await waitFor(()=>expect(fn).toHaveBeenCalledWith('/api/model-board?refresh=1',expect.anything()));
  expect(screen.getByText('SF +3.5 -102')).toBeTruthy();
 });
 it('retains locks and finals on publication failure',async()=>{
  const fn=install();render(<WeekOneBoard/>);await screen.findByText('SF +3.5 -102');
  fn.mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button',{name:'Refresh board'}));
  await screen.findByText('Update unavailable. Showing the last saved locks and grades.');
  expect(screen.getByText('SF +3.5 -102')).toBeTruthy();
  expect(screen.getByText('SF 27 — LA 7 FINAL')).toBeTruthy();
 });
});
