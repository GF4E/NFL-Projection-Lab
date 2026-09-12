"use client";
import {useEffect,useState} from 'react';
import {GameCard} from './game-card-v3';
import {TicketProvider} from './ticket-slip';
import type {LockedBoard} from '../domain/locked-board';
import '../styles/game-card-v3.css';
export function GameCardBoard(){
 const [board,setBoard]=useState<LockedBoard|null>(null),[week,setWeek]=useState<number|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();async function load(){try{const r=await fetch('/api/model-board',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();setBoard(await r.json());setError('');}catch{if(!controller.signal.aborted)setError('Publication delayed; saved cards remain visible.');}}void load();const timer=setInterval(()=>void load(),30000);return()=>{controller.abort();clearInterval(timer);};},[]);
 const selected=week??board?.default_week??1;
 return <div className="gc-root"><><section className="gc-board" aria-label="Game guide"><header className="gc-week"><label>Week <select aria-label="Week" value={selected} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:18},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label><div className="gc-records">{board?.card_records?.[String(selected)]?.map(row=><p key={row.label}><b>{row.label}</b><span>{row.text}</span></p>)}</div><a href="/suit#scorecard">Scorecard ↗</a></header>{error&&<p role="status" className="gc-muted">{error}</p>}{!board&&<p className="gc-muted">Loading cards…</p>}<div className="gc-grid">{board?.games.filter(g=>g.week===selected).map(g=>g.card_v3?<GameCard key={g.game_id} card={g.card_v3} game={g}/>:<p key={g.game_id} className="gc-muted">{g.away_abbr} at {g.home_abbr} · Card not recorded</p>)}</div></section></></div>;
}
