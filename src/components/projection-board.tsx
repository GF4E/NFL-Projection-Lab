"use client";
import {useEffect,useState} from 'react';
import type {ProjectionBoardData,ProjectionCardData} from '../domain/projection';
import {ProjectionCard,AccuracyRows} from './projection-card';
import '../styles/game-card-v3.css';
import '../styles/projection.css';
export function ProjectionRows({games}:{games:ProjectionCardData[]}){const [open,setOpen]=useState<string|null>(null);return <div className="b4-rows">{games.map(g=><ProjectionCard key={g.game_id} g={g} expanded={open===g.game_id} onToggle={()=>setOpen(open===g.game_id?null:g.game_id)}/>)}</div>;}
export function ProjectionBoard(){const [board,setBoard]=useState<ProjectionBoardData|null>(null),[week,setWeek]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(fresh=false){setBusy(true);try{const r=await fetch('/api/projection-board'+(fresh?'?refresh=1':''),{cache:'no-store'});if(!r.ok)throw Error('Projections are temporarily unavailable.');setBoard(await r.json());setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load projections');}finally{setBusy(false);}}
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[]);
 return <main className="gc-root b4-board"><header className="b4-header"><label>Week <select value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:18},(_,i)=><option value={i+1} key={i+1}>{i+1}</option>)}</select></label><button disabled={busy} onClick={()=>void load(true)}>{busy?'Updating…':'Refresh'}</button>{board&&<AccuracyRows rows={board.scorecards.filter(r=>r.week===week)}/>}</header>{error&&<p role="status">{error}</p>}{!board&&!error&&<p>Loading football projections…</p>}<ProjectionRows key={week} games={board?.games.filter(g=>g.week===week)??[]}/></main>;
}
