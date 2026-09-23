import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CloseoutView} from '../src/components/weekly-closeout';
import {SeasonView,emptySeasonEvidence} from '../src/components/season-v7';
import type {CloseoutMeta,CloseoutScorecard} from '../src/domain/closeout';
const meta:CloseoutMeta={key:'2026-w2',season:2026,week:2,published_at:'2026-09-22T13:04:14Z',receipt_sha256:'b'.repeat(64),receipt_source_commit:'a'.repeat(40),source_commit:'c'.repeat(40),artifacts:{}};
it('renders the frozen scorecard, its error convention, and only two diagnostic lines',()=>{
 const data:CloseoutScorecard={season:2026,week:2,schedule_games:1,as_issued_games:1,unqualified_games:[],
 scorecard:{team_points_mae:8.836376140888,total_bias:-5.987355464774765,margin_coverage_50:.5},
 games:[{game_id:'g',away:'DET',home:'BUF',projection:{away_points:25.4,home_points:28.6},final:{away_points:31,home_points:41}}],best_five:['g'],worst_five:['g']};
 const html=renderToStaticMarkup(<CloseoutView data={data} meta={meta}/>);
 expect(html).toContain('8.84');expect(html).toContain('-5.99');expect(html).toContain('actual minus projection');
 expect(html).toContain('25.40–28.60');expect(html).toContain('31–41');expect(html).toContain('1 of 5 games');
 expect(html.match(/DIAGNOSTIC ONLY/g)).toHaveLength(2);expect(html).toContain('OPEN totals: INSUFFICIENT');
 expect(html).toContain(meta.receipt_sha256);expect(html).toContain('/api/closeout/2026-w2/scorecard.json');
});
it('binds Season to the same receipt and completed week without exposing report diagnostics on it',()=>{
 const html=renderToStaticMarkup(<SeasonView data={emptySeasonEvidence()} closeout={meta}/>);
 expect(html).toContain(meta.receipt_sha256);expect(html).toContain('Through Week 2');expect(html).toContain('/closeout?week=2026-w2');
 expect(html).toContain('Needs at least 1 graded game');expect(html).not.toContain('DIAGNOSTIC ONLY');
});
