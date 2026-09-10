// @vitest-environment jsdom
// The September 10 locked-artifact reader replaces the interactive calculator.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekOneBoard } from '../src/components/week-one-board';
import type { LockedBoard, Verdict } from '../src/domain/locked-board';

const missed:Verdict={state:null,availability:'MISSED',reason:'LATE',edge_source:null,grade:null};
const payload:LockedBoard={schema:'locked-board-v1',version:'test-v1',published_at:'2026-09-10T00:00Z',content_sha256:'a'.repeat(64),default_week:1,games:[{
  game_id:'synthetic',season:2026,week:1,home_team:'Home team',away_team:'Away team',home_abbr:'H',away_abbr:'A',kickoff_at:'2026-09-10T00:20Z',expires_at:'2026-09-10T00:20Z',status:'FINAL',lock_status:'MISSED',version:'test-v1',freeze_time:'2026-09-09T23:05Z',final_score:{home:13,away:10},margin:3,total:23,verdicts:{spreads:missed,totals:missed}
}]};
const response=(data:unknown)=>({ok:true,json:async()=>data}) as Response;
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});

describe('published board interactions',()=>{
  it('only requests the read-only board and shows final scores plus MISSED',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>response(payload));vi.stubGlobal('fetch',fetcher);
    const {container}=render(<WeekOneBoard/>);
    await screen.findByText('Away team at Home team');
    expect(fetcher.mock.calls.every(([url])=>url==='/api/model-board')).toBe(true);
    expect(container.textContent).toContain('A 10 — H 13 FINAL');
    expect(screen.getAllByText('MISSED').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('PT');
    expect(container.querySelectorAll('.locked-verdict')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
  it('changes week without requesting quotes or computing forecasts',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>response(payload));vi.stubGlobal('fetch',fetcher);
    render(<WeekOneBoard/>);await screen.findByText('Away team at Home team');
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'2'}});
    expect(screen.getByText('No published games for this week.')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('polls and hides pending verdicts after a failed refresh',async()=>{
    const v:Verdict={state:'PLAY',availability:'LOCKED',side:'Home team',line:-3,price:-110,book:'betmgm',fair_probability:.65,EV:.1,grade:null,edge_source:'price'};
    const p={...payload,games:[{...payload.games[0],status:'LOCKED',lock_status:'LOCKED',verdicts:{spreads:v,totals:v}}]};
    const fetcher=vi.fn().mockResolvedValueOnce(response(p)).mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',fetcher);
    const {container}=render(<WeekOneBoard/>);await screen.findByText('Away team at Home team');
    expect(container.textContent).toContain('PLAY');
    vi.useFakeTimers();
    // Install a fresh polling interval under the controlled clock.
    cleanup();fetcher.mockResolvedValueOnce(response(p));render(<WeekOneBoard/>);
    await act(async()=>{});
    await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
    expect(screen.getByText('STALE · No verdict')).toBeTruthy();
    expect(screen.queryByText('PLAY')).toBeNull();
  });
  it('keeps final results visible if publication becomes unavailable',async()=>{
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async()=>response(payload)));
    render(<WeekOneBoard/>);await waitFor(()=>expect(screen.getAllByText(/FINAL/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Fair probability/)).toBeNull();
    expect(screen.queryByText(/Refresh lines/)).toBeNull();
  });
});
