"use client";
import {useState, type ReactNode} from 'react';
import Image from 'next/image';
import type {LockedGame, Week1Prediction} from '../domain/locked-board';
const names:Record<string,string>={betmgm:'BetMGM',williamhill_us:'Caesars',fanduel:'FanDuel',draftkings:'DraftKings'};
const odds=(n?:number)=>n===undefined?'—':`${n>0?'+':''}${n}`;
const pct=(n?:number)=>n===undefined?'—':`${(100*n).toFixed(1)}%`;
const result=(s?:string|null)=>s==='W'?'WIN':s==='L'?'LOSS':s==='P'?'PUSH':s;
const time=(s?:string|null)=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT':'not recorded';
const team=(s:string|undefined,g:LockedGame)=>s===g.home_team?g.home_abbr:s===g.away_team?g.away_abbr:s;
function Grade({value}:{value?:string|null}){const v=result(value);return v?<strong className={`grade-${v.toLowerCase()}`}>{v}</strong>:null;}

function Pick({pick,game,market}:{pick?:Week1Prediction['selections']['spreads'];game:LockedGame;market:'spreads'|'totals'}){
  if(!pick || pick.status!=='AVAILABLE')return <div className="prediction-cell muted">UNAVAILABLE<small>{pick?.reason??'No recorded selection'}</small></div>;
  return <div className="prediction-cell"><b>{team(pick.side,game)} {market==='spreads'?odds(pick.line):pick.line}</b><span>{names[pick.book!]??pick.book} {odds(pick.price)}</span><small>{market==='spreads'?'Cover':'Win'} {pct(pick.win)} · Push {pct(pick.push)}</small><small>Fair, excluding push {pct(pick.fair_probability)}</small>{game.status==='FINAL'&&<Grade value={pick.grade}/>}</div>;
}

export function Week1PredictionRow({game:g,analytics}:{game:LockedGame;analytics:ReactNode}){
  const [open,setOpen]=useState(false);const d=g.prediction,p=d?.projection;const final=g.status==='FINAL';
  return <div className="prediction-event">
    <style>{`.week1-column-head,.prediction-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(85px,.8fr) minmax(100px,.9fr) repeat(2,minmax(120px,1.1fr)) minmax(135px,1.1fr);gap:8px;min-width:740px;padding:10px}.week1-column-head{background:#18251e;color:#adc4b2;font-size:9px;letter-spacing:.65px;font-weight:700}.prediction-event{min-width:740px;border-top:1px solid #34483a}.prediction-row{background:#0f1b15;align-items:start;font-size:11px}.prediction-cell{display:flex;flex-direction:column;gap:5px;min-width:0}.prediction-cell>b{font-size:14px}.prediction-cell>small{font-size:9px;line-height:1.4;color:#9cb0a2}.prediction-cell.muted{color:#9cb0a2;font-size:10px}.prediction-team{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700}.prediction-team img{width:25px;height:25px;object-fit:contain}.prediction-badge{font-size:9px;color:#b8d894}.prediction-stale{color:#e5bd72!important}.prediction-ev-negative{color:#ffaaa0!important}.prediction-event footer{display:flex;justify-content:space-between;gap:10px;padding:4px 12px 8px;font-size:8px;color:#849e8b}.prediction-status{font-size:10px;line-height:1.45}.prediction-score-label{max-width:140px}.prediction-event .grid-decision-window{white-space:normal}.prediction-cell .grid-expand{margin-top:5px}`}</style>
    <div className="prediction-row">
      <div className="prediction-cell"><span className="prediction-badge">{final?`${g.away_abbr} ${g.final_score?.away} — ${g.home_abbr} ${g.final_score?.home} FINAL`:g.lock_status==='LOCKED'?'LOCKED':'UPCOMING'}{!final&&d?.stale&&<b className="prediction-stale"> · STALE</b>}</span>{[g.away_abbr,g.home_abbr].map(t=><div className="prediction-team" key={t}><Image src={`/team-logos/${t==='WAS'?'wsh':t==='LA'?'lar':t.toLowerCase()}.png`} alt="" width={25} height={25}/>{t}</div>)}{!final&&<small>{time(g.kickoff_at)}</small>}<button className="grid-expand" aria-expanded={open} aria-controls={`decision-${g.game_id}`} onClick={()=>setOpen(!open)}>{open?'Close analytics ↑':'Analytics ↓'}</button></div>
      <div className="prediction-cell">{p?.status==='AVAILABLE'?<><b>{team(p.winner,g)}</b><span>Win {pct(p.win_probability)}</span><small>Tie {pct(p.tie_probability)}{p.coin_flip?' · coin flip':''}</small>{final&&<Grade value={d?.winner_grade}/>}</>:<><span className="muted">{final?'not recorded':'UNAVAILABLE'}</span><small>{p?.reason??'No pre-lock winner projection'}</small></>}</div>
      <div className="prediction-cell">{p?.status==='AVAILABLE'?<><b>{g.away_abbr} {p.away_score?.toFixed(1)}</b><b>{g.home_abbr} {p.home_score?.toFixed(1)}</b><small className="prediction-score-label">{p.score_label}</small></>:<span className="muted">{final?'not recorded':'UNAVAILABLE'}</span>}</div>
      <Pick pick={d?.selections.spreads} game={g} market="spreads"/><Pick pick={d?.selections.totals} game={g} market="totals"/>
      <div className="prediction-cell">{g.lock_status==='MISSED'?<span className="grid-no-lock">No lock: capture late</span>:(['spreads','totals'] as const).map(m=>{const s=d?.selections[m];return <div className="prediction-status" key={m}><b>{m==='spreads'?'Spread':'Total'}: </b>{final?<Grade value={s?.grade}/>:s?.betting_status??'UNAVAILABLE'}{typeof s?.EV==='number'&&<small className={s.negative_EV?'prediction-ev-negative':''} style={{display:'block'}}>Estimated EV {s.EV>0?'+':''}{pct(s.EV)}{s.negative_EV?' · negative':''}</small>}</div>;})}{g.executed_picks?.map((x,i)=><small key={i}>Jarrett · {team(x.side,g)} {x.line_at_approval} {x.book_price} · <Grade value={x.outcome}/></small>)}</div>
    </div>
    <footer><span>Quote: {time(d?.quote_at??g.captured_at)} · Freeze: {time(g.freeze_time)}</span><span title={g.version}>{g.version.replace(/[a-f0-9]{64}/g,h=>h.slice(0,8))}{p&&` · ${p.version}`}</span></footer>
    {open&&analytics}
  </div>;
}
