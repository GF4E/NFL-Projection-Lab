"use client";

import { useCallback, useEffect, useState } from "react";
import type { LockedBoard, LockedGame, Verdict } from "../domain/locked-board";
const names: Record<string, string> = { betmgm: "BetMGM", williamhill_us: "Caesars", fanduel: "FanDuel", draftkings: "DraftKings" };
const odds = (n?: number) => n === undefined ? "—" : n > 0 ? `+${n}` : `${n}`;
const grade = (s?: string | null) => s === "W" ? "WIN" : s === "L" ? "LOSS" : s === "P" || s === "PUSH" ? "PUSH" : null;
const pct = (n?: number) => n === undefined ? "—" : `${(n*100).toFixed(1)}%`;
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" : "No lock";
const shortVersion = (s: string) => s.replace(/[a-f0-9]{64}/g, hash => hash.slice(0,8));
const team = (side: string | undefined, g: LockedGame) => side === g.home_team ? g.home_abbr : side === g.away_team ? g.away_abbr : side;

export function VerdictView({ title, verdict: v, game }: { title: string; verdict: Verdict; game: LockedGame }) {
  const label = v.state === "HARD PASS" ? "PASS" : v.state;
  const result = grade(v.grade);
  return <div className="pick-row"><span className="market-label">{title}</span><p>
    <b>{team(v.side,game)} {title === "Spread" ? odds(v.line) : v.line}</b>{" · "}{names[v.book!] ?? v.book} {odds(v.price)}{" · "}
    <span>{v.edge_source === "price" ? "price edge" : "coin flip"}</span>{" · "}<strong className={`verdict-${label?.toLowerCase()}`}>{label}</strong>
    {result && <> · <strong className={`grade-${result.toLowerCase()}`}>{result}</strong></>}
  </p></div>;
}

export function GameDecision({ game: g }: { game: LockedGame }) {
  const locked = g.lock_status === "LOCKED";
  const missed = g.lock_status === "MISSED";
  const spread = g.consensus?.spreads, total = g.consensus?.totals;
  return <div className="locked-decision">
    {missed ? <span className="no-lock">No lock: capture late</span> : locked ? <>
      <p className="consensus-line">T−75 consensus · {g.home_abbr} {odds(spread?.line)} · Total {total?.line ?? "—"}
        {(["spreads","totals"] as const).map(m => {const b=g.best_captured?.[m];return b && <span key={m}> · Best {team(b.side,g)} {m === "spreads" ? odds(b.line) : b.line}: {names[b.book] ?? b.book} {odds(b.price)}</span>;})}
      </p>
      <VerdictView title="Spread" verdict={g.verdicts.spreads} game={g}/>
      <VerdictView title="Total" verdict={g.verdicts.totals} game={g}/>
      <details className="pick-analytics"><summary>Analytics</summary><div className="analytics-scroll"><table><thead><tr><th>Target</th><th>Fair chance</th><th>Push</th><th>EV / unit</th><th>Price edge</th></tr></thead><tbody>{(["spreads","totals"] as const).map(m=>{const v=g.verdicts[m];return <tr key={m}><th>{m === "spreads" ? "Spread" : "Total"}</th><td>{pct(v.fair_probability)}</td><td>{pct(v.analytics?.push)}</td><td>{pct(v.EV)}</td><td>{v.analytics?.price_edge_cents?.toFixed(1) ?? "—"}¢</td></tr>;})}</tbody></table></div><p>Frozen model selections. PASS means the pick did not qualify for a wager. Fair chance excludes pushes; EV includes them.</p>{g.verdicts.spreads.state === "TEASE" && <p>{names[g.verdicts.spreads.best_book!] ?? g.verdicts.spreads.best_book} · Teased line {odds(g.verdicts.spreads.teased_line)} · Crosses {g.verdicts.spreads.key_numbers_crossed?.join(" / ")} · NEEDS_PARTNER</p>}</details>
    </> : <p className="awaiting-capture">{g.status === "UPCOMING" || g.status === "STALE" ? <span>STALE · </span> : null}Awaiting scheduled capture</p>}
    {!!g.executed_picks?.length && <div className="executed-bets">{g.executed_picks.map((p,i)=><p key={i}>Jaret · {team(p.side,g)} {odds(Number(p.line_at_approval))} · {names[p.executed_book] ?? p.executed_book} {odds(Number(p.book_price))} · <b className={`grade-${grade(p.outcome)?.toLowerCase()}`}>{grade(p.outcome)}</b></p>)}</div>}
    <footer><span title={g.version}>{shortVersion(g.version)}</span><span>Freeze: {missed ? "No lock" : when(g.freeze_time)}</span></footer>
  </div>;
}

export function LockedModelBoard() {
  const [board,setBoard]=useState<LockedBoard|null>(null);
  const [week,setWeek]=useState<number|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [refreshing,setRefreshing]=useState(true);
  const refresh=useCallback(async (signal?: AbortSignal, fresh=false)=>{
    try {
      const response=await fetch(fresh ? "/api/model-board?refresh=1" : "/api/model-board",{cache:"no-store",signal});
      if(!response.ok) throw new Error("Unavailable");
      setBoard(await response.json() as LockedBoard);setError(null);
    } catch {if(!signal?.aborted)setError("Update unavailable. Showing the last saved locks and grades.");}
    finally {if(!signal?.aborted)setRefreshing(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();const first=setTimeout(()=>void refresh(controller.signal),0);const timer=setInterval(()=>void refresh(controller.signal),30_000);return()=>{controller.abort();clearTimeout(first);clearInterval(timer);};},[refresh]);
  const selected=week ?? board?.default_week ?? 1;
  const games=board?.games.filter(g=>g.week===selected) ?? [];
  const records=board?.week_records?.[String(selected)];
  return <section className="locked-board" aria-label="Locked model board">
    <style>{`.locked-board{max-width:1700px;margin:auto;color:#e9efeb;padding:16px 20px;font-size:14px;font-variant-numeric:tabular-nums}.locked-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px}.locked-heading h1{font-size:30px;line-height:1.15;margin:3px 0;font-weight:800;letter-spacing:-.6px}.locked-heading small{font-size:10px;letter-spacing:1.3px;color:#b6c5bb}.board-controls{display:flex;gap:10px;align-items:center}.board-controls select,.board-controls button{background:#17271f;color:#eef4ee;border:1px solid #476051;border-radius:5px;padding:8px 10px;font:inherit;cursor:pointer}.board-controls button:disabled{opacity:.6;cursor:wait}.week-records{display:grid;grid-template-columns:max-content max-content auto;gap:4px 18px;margin:0 0 16px;padding:10px 14px;background:#101d17;border-left:2px solid #b6e877;font-size:12px;max-width:550px}.week-records dt,.week-records dd{margin:0}.week-records dt{color:#b8c8be}.week-records dd{font-weight:600}.week-records small{color:#91a59a}.game-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:12px}.locked-game{border:1px solid #354b3e;background:#101b16;border-radius:7px;overflow:hidden;padding:14px;min-width:0}.game-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.game-heading h2{font-size:16px;line-height:1.3;margin:0;font-weight:700;letter-spacing:0}.game-heading time{font-size:11px;color:#a7baad;display:block;margin-top:4px}.game-status{border:1px solid #43594b;border-radius:4px;padding:4px 6px;white-space:nowrap;font-size:10px;font-weight:700;letter-spacing:.25px}.status-final{color:#c5f183;border-color:#536e39}.consensus-line{font-size:10px;color:#a2b6a9;line-height:1.6;margin:0 0 7px;padding-bottom:8px;border-bottom:1px solid #2d4134}.pick-row{display:grid;grid-template-columns:45px 1fr;gap:7px;padding:8px 0;border-bottom:1px solid #243b2c;align-items:baseline}.market-label{font-size:10px;text-transform:uppercase;color:#a1b7a8;font-weight:700}.pick-row p{margin:0;font-size:12px;line-height:1.6}.pick-row strong,.pick-row b{font-weight:700}.verdict-pass{color:#b1bbb3}.verdict-play,.grade-win{color:#c4ef81}.verdict-tease{color:#e7c178}.grade-loss{color:#ff9c96}.grade-push{color:#c8d4e0}.no-lock{display:inline-block;font-size:11px;border:1px solid #675b3f;color:#d8c59b;border-radius:4px;padding:4px 7px;margin:2px 0 6px}.awaiting-capture{font-size:12px;color:#8fa698;margin:14px 0}.awaiting-capture span{font-size:10px;color:#c1ab7f}.locked-decision footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:9px;color:#92a79a;padding-top:10px;line-height:1.5}.pick-analytics{margin-top:9px;font-size:11px}.pick-analytics summary{cursor:pointer;color:#bbdba7;font-weight:600;padding:3px 0}.pick-analytics p{color:#a3b3a8;font-size:10px;line-height:1.5;margin:8px 0 0}.analytics-scroll{overflow-x:auto}.pick-analytics table{width:100%;border-collapse:collapse;font-size:10px;margin-top:8px}.pick-analytics th,.pick-analytics td{text-align:right;padding:6px 4px;border-bottom:1px solid #314737}.pick-analytics th:first-child{text-align:left}.executed-bets{font-size:11px;color:#c5d4c9;margin-top:8px;padding:6px 8px;border-radius:3px;background:#1a2b21}.executed-bets p{margin:0;line-height:1.6}.locked-alert{padding:8px 12px;border:1px solid #7b6841;color:#e6ca87;font-size:12px}.record-note{font-size:10px;color:#93a799;margin:0 0 12px}.board-empty{font-size:13px;padding:20px 0}@media(min-width:1900px){.game-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1000px){.game-grid{grid-template-columns:1fr}}@media(max-width:550px){.locked-board{padding:12px 8px}.locked-heading{align-items:flex-start;gap:8px}.locked-heading h1{font-size:26px}.board-controls{gap:5px;flex-wrap:wrap;justify-content:flex-end;font-size:11px}.game-heading h2{font-size:14px}.locked-game{padding:11px}.pick-row p{font-size:11px}.game-status{white-space:normal;max-width:115px;text-align:right}.week-records{gap:4px 10px}.locked-decision footer{font-size:8px}}`}</style>
    <header className="locked-heading"><div><small>NFL PROJECTION LAB · BETA</small><h1>Week {selected}</h1></div><div className="board-controls"><label>Week <select aria-label="Week" value={selected} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:18},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><button disabled={refreshing} onClick={()=>{setRefreshing(true);void refresh(undefined,true);}}>{refreshing ? "Refreshing…" : "Refresh board"}</button></div></header>
    <dl className="week-records">{([['model','Model picks'],['price','Price picks'],['paper','Paper rules'],['jaret','Jaret']] as const).map(([key,label])=>{const r=records?.[key];return <div key={key} style={{display:'contents'}}><dt>{label}</dt><dd>{r ? `${r.wins}-${r.losses}-${r.pushes}` : '—'}</dd><small>{r?.mean_clv_cents != null ? `Mean CLV ${r.mean_clv_cents>0?'+':''}${r.mean_clv_cents.toFixed(1)}¢ · n=${r.clv_n}` : 'CLV pending'}</small></div>;})}</dl>
    <p className="record-note">W-L-P · Model and paper picks are separate from Jaret’s wagers. CLV uses the nflverse closing reference.</p>
    {error && <p className="locked-alert" role="status">{error}</p>}
    {board?.publication_status === "STALE" && <p className="locked-alert">Publication update delayed. Saved locks and grades remain visible.</p>}
    {!board && !error && <p className="board-empty">Loading picks…</p>}
    <div className="game-grid">{games.map(g=><article className="locked-game" key={g.game_id} aria-label={`${g.away_abbr} at ${g.home_abbr}`}><header className="game-heading"><div><h2>{g.away_team} at {g.home_team}</h2><time dateTime={g.kickoff_at}>{when(g.kickoff_at)}</time></div><span className={`game-status ${g.status==='FINAL'?'status-final':''}`}>{g.status==='FINAL'?`${g.away_abbr} ${g.final_score!.away} — ${g.home_abbr} ${g.final_score!.home} FINAL`:g.lock_status==='LOCKED'?'LOCKED':'UPCOMING'}</span></header><GameDecision game={g}/></article>)}</div>
    {board && !games.length && <p className="board-empty">No published games for this week.</p>}
  </section>;
}
