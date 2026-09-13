import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {ProjectionCard} from '../src/components/projection-card';
import {validShared} from '../src/server/projection-entry';
import {assertProjectionProgress} from '../src/server/projection-board';
import type {ProjectionCardData,ProjectionBoardData} from '../src/domain/projection';
const p={home_points:24,away_points:21,margin:3,total:45,home_win_probability:.6,away_win_probability:.4,tie_probability:.02,intervals:{margin:{'50':[-3,10],'80':[-12,20]},total:{'50':[38,53],'80':[29,63]}}};
const c={game_id:'fixture',season:2026,week:2,home:'IND',away:'BAL',kickoff_at:'2026-09-20T17:00:00Z',cutoff_at:'2026-09-20T15:45:00Z',version:'projection-v1-fixture-fit',issued_at:'2026-09-13T09:00:00Z',freeze_time:null,status:'UPCOMING',evidence:'AS_ISSUED',projection:p,ours:null,display:p,source:'PROJECTION',winner:'IND',winner_probability:.6,coin_flip:false,why:{lines:['IND passing efficiency adds 2.0 points.','BAL run defense subtracts 1.0 point.','IND pace adds 0.5 points.'],against:'Against: BAL defense subtracts 1.0 point.'},team_colors:{BAL:'#241773',IND:'#002C5F'},contributions:{home:[],away:[]},grades:null} as unknown as ProjectionCardData;
const g={actual:{away_points:20,home_points:27,margin:7,total:47},errors:{away_points:-1,home_points:3,margin:4,total:2},interval_hits:{margin:{'50':true,'80':true},total:{'50':true,'80':true}}};
describe('Projection card',()=>{
 for(const [state,patch] of Object.entries({projection:{},ours:{source:'OURS',ours:{...p,home_points:27,total:48,margin:6},display:{...p,home_points:27,total:48,margin:6}},final:{status:'FINAL',evidence:'RETROSPECTIVE',final:g.actual,grades:{PROJECTION:g}}})){it(state+' snapshot',()=>{const html=renderToStaticMarkup(<ProjectionCard g={{...c,...patch} as ProjectionCardData}/>);expect(html).toMatchSnapshot();expect(html).not.toMatch(/BetMGM|Caesars|FanDuel|DraftKings|break-even|\bEV\b|consensus|market-based/);expect(html).toContain('Projected:');expect(html).toContain('Against:');});}
 it('validates shared team score edits',()=>{expect(validShared({away_points:24,home_points:20,confidence:3,tags:['run game']})).toBe(true);for(const value of [NaN,Infinity,-1,101])expect(validShared({away_points:value,home_points:20,confidence:3,tags:[]})).toBe(false);});
 it('rejects mutation of a frozen projection',()=>{const a={published_at:c.issued_at,games:[{...c,status:'LOCKED'}]} as ProjectionBoardData;expect(()=>assertProjectionProgress(a,{...a,games:[{...a.games[0],projection:{...p,total:100}}]} as ProjectionBoardData)).toThrow();});
 it('active projection components read no financial fields',()=>{for(const name of ['projection-card','projection-board']){const text=readFileSync(new URL('../src/components/'+name+'.tsx',import.meta.url),'utf8');expect(text).not.toMatch(/\b(spread_line|total_line|consensus|market|odds|price)\b/);expect(text).not.toMatch(/locked-board|game-card-v3['"]|ticket-slip/);}});
});

it('preserves the version and explanation of a frozen card during v2 migration',()=>{const a={published_at:c.issued_at,games:[{...c,status:'LOCKED'}]} as ProjectionBoardData;expect(()=>assertProjectionProgress(a,{...a,games:[{...a.games[0],version:'projection-v2-new-fit'}]} as ProjectionBoardData)).toThrow();expect(()=>assertProjectionProgress(a,{...a,games:[{...a.games[0],why:{lines:['new reason'],against:'Against: new'}}]} as ProjectionBoardData)).toThrow();});
it('permits v2 on an unfrozen future card while retaining the original final',()=>{const final={...c,game_id:'finished',status:'FINAL',grades:{PROJECTION:g}};const a={published_at:c.issued_at,games:[final,c]} as ProjectionBoardData;expect(()=>assertProjectionProgress(a,{...a,games:[final,{...c,version:'projection-v2-new-fit'}]} as ProjectionBoardData)).not.toThrow();});
it('shows measured support without inventing three reasons',()=>{const html=renderToStaticMarkup(<ProjectionCard g={{...c,version:'projection-v2-qualified-fit',why:{lines:['BAL adjusted scoring efficiency supports the projection by 2.1 points.'],against:'Against: IND home field reduces the margin by 0.8 points.'}}}/>);expect(html).toContain('supports the projection');expect(html).toContain('Against: IND home field');});

it('shows engine-issued score and probability disagreement without changing either',()=>{const html=renderToStaticMarkup(<ProjectionCard g={{...c,score_probability_note:'Projected scores favor BAL; the historical residual distribution favors IND. The score and winner directions disagree.'}}/>);expect(html).toContain('directions disagree');expect(html).toContain('Ties split evenly');expect(html).toContain('Projected: BAL');});

it('renders a pending lock with absent color metadata without crashing',()=>{expect(()=>renderToStaticMarkup(<ProjectionCard g={{...c,team_colors:undefined} as unknown as ProjectionCardData}/>)).not.toThrow();});
