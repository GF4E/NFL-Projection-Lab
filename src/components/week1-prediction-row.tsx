"use client";
import {useState,type ReactNode} from 'react';
import type {LockedGame} from '../domain/locked-board';
const fmt=(n:number|undefined)=>n===undefined?'N/R':`${n>0?'+':''}${n}`;
export function Week1PredictionRow({game:g,analytics}:{game:LockedGame;analytics:ReactNode}){
 const [open,setOpen]=useState(false);const p=g.prediction;
 const code=(s:string|undefined)=>s===g.home_team?g.home_abbr:s===g.away_team?g.away_abbr:s;
 return <article className="week1-event"><header><b>{g.away_abbr} at {g.home_abbr}</b> · {g.status==='FINAL'&&g.final_score?`${g.away_abbr} ${g.final_score.away} — ${g.home_abbr} ${g.final_score.home} FINAL`:g.status}</header><div className="week1-market-row"><section><small>WINNER</small><p>{p?.projection.status==='AVAILABLE'?code(p.projection.winner):'not recorded'}</p></section>{(['spreads','totals'] as const).map(m=>{const t=p?.selections[m];return <section key={m}><small>{m==='spreads'?'SPREAD':'TOTAL'}</small><p>{t?.status==='AVAILABLE'?`${code(t.side)} ${m==='spreads'?fmt(t.line):t.line}`:'not recorded'}</p>{t?.grade&&<b>{t.grade==='W'?'WIN':t.grade==='L'?'LOSS':'PUSH'}</b>}</section>;})}</div><p>Line: {g.home_abbr} {fmt(g.consensus?.spreads?.line)} · Total {g.consensus?.totals?.line??'N/R'}</p>{g.executed_picks?.map((w,i)=><p key={i}>Our wager · {code(w.side)} {w.line_at_approval} · {w.outcome==='W'?'WIN':w.outcome==='L'?'LOSS':'PUSH'}</p>)}<button onClick={()=>setOpen(!open)}>{open?'Close':'Analytics'}</button>{open&&analytics}</article>;
}
