'use client';
import {useEffect,useState} from 'react';
import type {CloseoutMeta,CloseoutScorecard} from '../domain/closeout';
import '../styles/board-v7.css';

const number=(v:number|null|undefined)=>v==null||!Number.isFinite(v)?'Not recorded':v.toFixed(2);
const percent=(v:number|null|undefined)=>v==null?'Not recorded':`${(100*v).toFixed(1)}%`;
function diagnostic(data:CloseoutScorecard,reference:'CLOSE'|'OPEN'){
 const week=`${data.season}-w${data.week}`;
 const lines=Object.entries(data.reference_lines?.series??{}).filter(([name])=>name.startsWith('AS_ISSUED')).flatMap(([name,value])=>{
  const targets=reference==='OPEN'?['spread']:['spread','total'];
  return targets.flatMap(target=>{const x=value.audit.references[reference]?.[target]?.weeks?.[week];
   return x?[`${name.replace('AS_ISSUED / ','')} ${target}: ${x.correct}/${x.games}, ${percent(x.rate)}, 95% interval ${x.interval95?x.interval95.map(percent).join('–'):'not recorded'}, coverage ${percent(x.coverage)}`]:[];});
 });
 return `${reference} · ${lines.join('; ')||'No matched reference observations for this completed week.'}${reference==='OPEN'?' · OPEN totals: INSUFFICIENT (34.3% qualified historical coverage).':''}`;
}
export function CloseoutView({data,meta}:{data:CloseoutScorecard;meta:CloseoutMeta}){
 const m=data.scorecard;
 const ranked=(ids:string[])=>ids.map(id=>data.games.find(g=>g.game_id===id)).filter(g=>!!g);
 return <main className="v7 v7-season" data-closeout-receipt={meta.receipt_sha256}><header><h1>Week {data.week} scorecard</h1><p>{data.season} · {data.schedule_games} completed games · {data.as_issued_games} with qualified as-issued projections.</p><p><a href="/season">Season trends</a> · <a href="/sunday">Current week board</a></p></header>
 <section><h2>How close were the scores?</h2><p>Errors are measured in points. Lower mean absolute error is better. This frozen report defines signed bias as actual minus projection; a negative value means the model predicted too much scoring.</p>
 <table><thead><tr><th>Measure</th><th>Points</th></tr></thead><tbody>{[['Team mean absolute error','team_points_mae'],['Margin mean absolute error','margin_mae'],['Total mean absolute error','total_mae'],['Signed total bias','total_bias'],['Projected team-score standard deviation','projected_team_points_sd'],['Actual team-score standard deviation','actual_team_points_sd']].map(([label,key])=><tr key={key}><td>{label}</td><td>{number(m[key])}</td></tr>)}</tbody></table></section>
 <section><h2>Did the intervals contain the result?</h2><table><thead><tr><th>Target</th><th>Nominal</th><th>Observed</th><th>Graded games</th></tr></thead><tbody>{(['margin','total'] as const).flatMap(t=>[50,80].map(n=><tr key={t+n}><td>{t}</td><td>{n}%</td><td>{percent(m[`${t}_coverage_${n}`])}</td><td>{data.as_issued_games}</td></tr>))}</tbody></table><p>Each game keeps the intervals issued by its original model version.</p></section>
 <section><h2>Predicted and actual scores</h2><table><thead><tr><th>Game</th><th>Projection</th><th>Final</th></tr></thead><tbody>{data.games.map(g=><tr key={g.game_id}><td>{g.away} at {g.home}</td><td>{g.projection?`${number(g.projection.away_points)}–${number(g.projection.home_points)}`:'No qualified forecast'}</td><td>{g.final?`${g.final.away_points}–${g.final.home_points}`:'Final not recorded'}</td></tr>)}</tbody></table>{data.unqualified_games.length>0&&<p>{data.unqualified_games.length} games excluded from forecast metrics: {data.unqualified_games.join(', ')}.</p>}</section>
 <section><h2>Best and worst five games</h2><p>Ranked by average absolute error across the two teams.</p>{[['Best',data.best_five],['Worst',data.worst_five]].map(([label,ids])=><div key={label as string}><h3>{label as string}</h3><p>{(ids as string[]).length} of 5 games.</p><ul>{ranked(ids as string[]).map(g=><li key={g.game_id}>{g.away} at {g.home}</li>)}</ul></div>)}</section>
 <p className="v7-muted">DIAGNOSTIC ONLY · {diagnostic(data,'CLOSE')}</p><p className="v7-muted">DIAGNOSTIC ONLY · {diagnostic(data,'OPEN')}</p>
 <footer><p>Published {new Date(meta.published_at).toISOString().replace('T',' ').slice(0,16)} UTC. <a href={`/api/closeout/${meta.key}/scorecard.json`}>Exact scorecard</a> · <a href={`/api/closeout/${meta.key}/trend.json`}>Error trend and diagnostics</a></p><p>Confidence: near-total in reproduction of this published snapshot—arithmetic on verified rows. An independent mismatch would lower it to high. This does not establish future predictive skill.</p></footer></main>;
}
export function WeeklyCloseout(){
 const [data,setData]=useState<CloseoutScorecard|null>(null),[meta,setMeta]=useState<CloseoutMeta|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;const requested=new URLSearchParams(window.location.search).get('week')??'latest';
  async function load(){try{
   if(!/^(latest|20\d{2}-w(?:[1-9]|1\d|2[0-2]))$/.test(requested))throw Error('Choose a published season and week.');
   const response=await fetch(`/api/closeout/${requested}/metadata.json`,{cache:'no-store'});if(!response.ok)throw Error('Needs a verified completed-week receipt; no scorecard loaded.');
   const info=await response.json() as CloseoutMeta;
   const scores=await fetch(`/api/closeout/${info.key}/scorecard.json`,{cache:'no-store'});if(!scores.ok||scores.headers.get('x-closeout-receipt-sha256')!==info.receipt_sha256)throw Error('Scorecard identity changed; reload after publication finishes.');
   const value=await scores.json() as CloseoutScorecard;
   if(active){setMeta(info);setData(value);}
  }catch(e){if(active)setError(e instanceof Error?e.message:'Closeout verification failed.');}}
  void load();return()=>{active=false;};},[]);
 return data&&meta?<CloseoutView data={data} meta={meta}/>:<main className="v7"><h1>Weekly scorecard</h1><p role="status">{error||'Loading the verified completed-week scorecard…'}</p><a href="/season">Season</a></main>;
}
