"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Week1PredictionRow } from "./week1-prediction-row";
import { OurNote } from "./our-note";
import type { LiveLine } from "../domain/line-board";
import type { LockedBoard, LockedGame, Verdict } from "../domain/locked-board";
const names: Record<string, string> = { betmgm: "BetMGM", williamhill_us: "Caesars", fanduel: "FanDuel", draftkings: "DraftKings" };
const odds = (n?: number) => n === undefined ? "—" : n > 0 ? `+${n}` : `${n}`;
const grade = (s?: string | null) => s === "W" ? "WIN" : s === "L" ? "LOSS" : s === "P" || s === "PUSH" ? "PUSH" : null;
const pct = (n?: number) => n === undefined ? "—" : `${(n*100).toFixed(1)}%`;
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" : "No lock";
const team = (side: string | undefined, g: LockedGame) => side === g.home_team ? g.home_abbr : side === g.away_team ? g.away_abbr : side;

type CachedLines = {lines?: LiveLine[]; season?: number; week?: number; staleGameIds?: string[]};
const abbr = (s: string) => s === "LA" ? "LAR" : s;
const logo = (s: string) => `/team-logos/${s === "WAS" ? "wsh" : abbr(s).toLowerCase()}.png`;
const lineGameId = (g: LockedGame) => `${abbr(g.away_abbr).toLowerCase()}-${abbr(g.home_abbr).toLowerCase()}`;

export function VerdictView({ title, verdict: v, game }: { title: string; verdict: Verdict; game: LockedGame }) {
  const result=grade(v.grade);
  return <p className="grid-verdict-line" title={`${title} · ${names[v.book!] ?? v.book} · ${v.edge_source === "price" ? "price edge" : "coin flip"}`}>
    <span className="grid-target">{title === "Spread" ? "S" : "T"}</span>
    <b>{team(v.side,game)} {title === "Spread" ? odds(v.line) : v.line} {odds(v.price)}</b> · <span style={v.teaser_notice ? {whiteSpace:"normal"} : undefined}>{v.teaser_notice ?? (v.state === "HARD PASS" ? "PASS" : v.state)}</span>
    {result && <> · <strong className={`grade-${result.toLowerCase()}`}>{result}</strong></>}
  </p>;
}

export function GameDecision({ game:g }: {game:LockedGame}) {
  return <div className="grid-decision-window" id={`decision-${g.game_id}`}>
    <header><b>DECISION WINDOW · {g.away_abbr} @ {g.home_abbr}</b></header>
    {(g.lock_status === "LOCKED" || g.lock_status === "LIVE") ? <>
      <p className="consensus-line">{g.lock_status === "LIVE" ? "Live consensus" : "T−75 consensus"} · {g.home_abbr} {odds(g.consensus?.spreads?.line)} · Total {g.consensus?.totals?.line ?? "—"}
        {(["spreads","totals"] as const).map(m=>{const b=g.best_captured?.[m];return b && <span key={m}> · Best {team(b.side,g)} {m==="spreads"?odds(b.line):b.line}: {names[b.book] ?? b.book} {odds(b.price)}</span>;})}</p>
      <section className="measured-analysis"><h3>ANALYSIS</h3>{g.prediction?.explanation.map((text,i)=><p key={`projection-${i}`}>{text}</p>)}{g.prediction && <p>Projection generated: {when(g.prediction.projection.generated_at ?? null)}. Quote timestamp: {when(g.prediction.quote_at ?? null)}. {g.prediction.stale ? "STALE — saved estimate only; no actionable PLAY." : "Within the recorded quote freshness horizon."}</p>}{g.analysis?.sentences.map((sentence,i)=><p key={i}>{sentence}</p>) ?? <p>No measured analysis saved for this capture.</p>}</section>
      <div className="grid-analytics"><h3>Analytics</h3><table><thead><tr><th>Target / book</th><th>Fair chance</th><th>Push</th><th>EV / unit</th><th>Price edge</th><th>Source</th></tr></thead><tbody>{(["spreads","totals"] as const).map(m=>{const v=g.verdicts[m];return <tr key={m}><th>{m === "spreads"?"Spread":"Total"} · {names[v.book!] ?? v.book}</th><td>{pct(v.fair_probability)}</td><td>{pct(v.analytics?.push)}</td><td>{pct(v.EV)}</td><td>{v.analytics?.price_edge_cents?.toFixed(1) ?? "—"}¢</td><td>{v.edge_source === "price"?"price edge":"coin flip"}</td></tr>;})}</tbody></table></div>
      <p className="grid-detail-note">{g.lock_status === "LIVE" ? "Live selections, recomputed at each capture. They enter the record only at T-75." : "Locked model selections."} PASS means the pick did not qualify for a wager. Fair chance excludes pushes; EV includes them.</p>
      {(["spreads","totals"] as const).map(m=>{const v=g.verdicts[m];return (v.state === "TEASE" || (v.teaser_notice && v.leg)) && <p className="grid-detail-note" key={m}>Teaser candidate: {v.leg} {v.original_line} → {v.teased_line} · {names[v.best_book!] ?? v.best_book} {odds(v.teaser_price)} for two legs · Crosses {v.key_numbers_crossed?.join(" / ")}{v.state === "TEASE" && " · NEEDS_PARTNER"}{v.teaser_pricing && <> · <a href={v.teaser_pricing.source_page} target="_blank" rel="noreferrer">Posted reference · {v.teaser_pricing.as_of}</a> · {v.teaser_pricing.scope}</>} · Grades above are for the straight model pick.</p>;})}
    </> : <p className="grid-detail-note">{g.lock_status === "MISSED" ? "No lock: capture late" : "Awaiting scheduled capture"}</p>}
    <OurNote game={g}/>
    <footer><span title={g.version}>Version: {g.version.replace(/[a-f0-9]{64}/g,h=>h.slice(0,8))}</span><span>Capture: {when(g.captured_at ?? null)}</span><span>Freeze: {when(g.freeze_time)}</span></footer>
  </div>;
}

function PricePair({game:g,lines,market,stale}: {game:LockedGame;lines:(Omit<Pick<LiveLine,"market"|"side"|"point"|"americanPrice"|"book"|"capturedAt"|"marketVigPercent">,"book"> & {book:string})[];market:LiveLine["market"];stale:boolean}) {
  const sides=market === "total" ? ["Over","Under"] : [abbr(g.away_abbr),abbr(g.home_abbr)];
  const pair=sides.map(side=>lines.find(l=>l.market===market && l.side.toLowerCase()===side.toLowerCase()));
  const vig=pair[0]?.marketVigPercent;
  return <div className={`grid-price-pair ${stale ? "cached-stale" : ""}`}>
    {pair.map((line,i)=><div className="grid-price-cell" key={sides[i]} title={line ? `${sides[i]} · ${names[line.book]} · Saved ${when(line.capturedAt)}` : `${sides[i]} ${market} unavailable`}>
      <strong>{line ? market==="moneyline" ? odds(line.americanPrice) : market==="total" ? `${i===0?'O':'U'} ${line.point}` : odds(line.point ?? undefined) : "—"}</strong>
      {line && market!=="moneyline" && <span>{odds(line.americanPrice)}</span>}
    </div>)}
    <small>VIG {typeof vig==='number' ? `${vig.toFixed(1)}%` : '—'}</small>
  </div>;
}

export function GameRow({game:g,quotes,book}: {game:LockedGame;quotes?:CachedLines|null;book:string}) {
  const [open,setOpen]=useState(false);
  const id=lineGameId(g);
  const lines=quotes?.season===g.season && quotes.week===g.week ? quotes.lines?.filter(l=>l.gameId===id && l.book===book) ?? [] : [];
  const stale=g.status!=='FINAL' && g.lock_status!=='LOCKED' && g.lock_status!=='LIVE' && (!lines.length || !!quotes?.staleGameIds?.includes(id));
  return <div className="grid-event" aria-label={`${g.away_abbr} at ${g.home_abbr}`}>
    <div className="grid-market-row">
      <div className="grid-matchup">
        <div className={`grid-game-time ${g.status==='FINAL'?'grade-win':''}`}>{g.status==='FINAL' ? `${g.away_abbr} ${g.final_score!.away} — ${g.home_abbr} ${g.final_score!.home} FINAL` : when(g.kickoff_at)}</div>
        {[['away',g.away_abbr,g.away_team],['home',g.home_abbr,g.home_team]].map(([side,code,name])=><div className="grid-team" key={side} title={name}><Image src={logo(code)} alt="" width={27} height={27} unoptimized /><b>{abbr(code)}</b><span>{name.split(' ').slice(-1)}</span></div>)}
      </div>
      {(['spread','total','moneyline'] as const).map(m=><PricePair key={m} game={g} lines={m!=="moneyline" && g.quote_pairs?.length ? g.quote_pairs.filter(q=>q.book===book) : lines} market={m} stale={stale}/>)}
      <div className="grid-verdict">
        {g.lock_status==='MISSED' ? <span className="grid-no-lock">no lock</span> : (g.lock_status==='LOCKED'||g.lock_status==='LIVE') ? <><small>{g.lock_status}</small><VerdictView title="Spread" verdict={g.verdicts.spreads} game={g}/><VerdictView title="Total" verdict={g.verdicts.totals} game={g}/></> : <span className="grid-waiting">UPCOMING · STALE</span>}
        <button className="grid-expand" aria-expanded={open} aria-controls={`decision-${g.game_id}`} onClick={()=>setOpen(!open)}>{open?'Close analytics ↑':'Analytics ↓'}</button>
        {g.executed_picks?.map((p,i)=><p className="grid-jarrett" key={i} title={names[p.executed_book] ?? p.executed_book}>Jarrett · {team(p.side,g)} {odds(Number(p.line_at_approval))} {odds(Number(p.book_price))} · <b className={`grade-${grade(p.outcome)?.toLowerCase()}`}>{grade(p.outcome)}</b></p>)}
      </div>
    </div>
    {open && <GameDecision game={g}/>}
  </div>;
}

export function LockedModelBoard() {
  const [book,setBook]=useState("betmgm");
  const [quotes,setQuotes]=useState<CachedLines|null>(null);
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
  useEffect(()=>{
    if(refreshing)return;
    const controller=new AbortController();
    void fetch(`/api/lines?week=${selected}`,{cache:"no-store",signal:controller.signal}).then(async r=>{
      if(!r.ok)throw new Error("Cached prices unavailable");
      const data=await r.json() as CachedLines;
      if(!controller.signal.aborted)setQuotes(data);
    }).catch(()=>{if(!controller.signal.aborted)setQuotes(null);});
    return()=>controller.abort();
  },[selected,board?.published_at,refreshing]);
  return <section className="locked-board" aria-label="Locked model board">
    <style>{`.locked-board{max-width:1700px;margin:auto;color:#e9efeb;padding:14px 18px;font-size:13px;font-variant-numeric:tabular-nums}.locked-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}.locked-heading h1{font-size:30px;line-height:1.15;margin:3px 0;font-weight:800;letter-spacing:-.6px}.locked-heading small{font-size:10px;letter-spacing:1.2px;color:#b6c5bb}.board-controls{display:flex;gap:10px;align-items:center}.board-controls select,.board-controls button,.grid-price-toolbar button{background:#17271f;color:#eef4ee;border:1px solid #476051;border-radius:4px;padding:7px 10px;font:inherit;cursor:pointer}.board-controls button:disabled{opacity:.6;cursor:wait}.week-records{display:grid;grid-template-columns:max-content max-content auto;gap:3px 15px;margin:0 0 10px;padding:7px 12px;background:#101d17;border-left:2px solid #b6e877;font-size:11px;max-width:490px}.week-records dt,.week-records dd{margin:0}.week-records dt{color:#b8c8be}.week-records dd{font-weight:600}.week-records small{color:#91a59a}.record-note{font-size:9px;color:#93a799;margin:0 0 10px}.grid-price-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.grid-price-toolbar>div{display:flex;gap:4px}.grid-price-toolbar button{font-size:10px;padding:5px 10px}.grid-price-toolbar button[aria-pressed=true]{color:#121e18;background:#c5ed8b;border-color:#c5ed8b}.grid-price-toolbar small{font-size:9px;color:#90a69a}.grid-table-scroll{overflow-x:auto;border:1px solid #34453b}.grid-column-head,.grid-market-row{display:grid;grid-template-columns:minmax(170px,1.25fr) repeat(3,minmax(85px,.65fr)) minmax(230px,1.65fr);gap:8px;min-width:720px;align-items:stretch}.grid-column-head{padding:9px 10px;background:#18251e;color:#9cb0a2;font-size:9px;font-weight:800;letter-spacing:1px}.grid-column-head>span:not(:first-child){text-align:center}.grid-event{min-width:720px;border-top:1px solid #33463a;background:#0f1b15}.grid-market-row{padding:8px 10px;min-height:103px}.grid-matchup{min-width:0}.grid-game-time{font-size:9px;color:#a4b9aa;margin-bottom:4px;font-weight:600;white-space:nowrap}.grid-team{display:flex;align-items:center;gap:7px;min-height:30px}.grid-team img{object-fit:contain;width:27px;height:27px;flex:0 0 27px}.grid-team>b{font-size:15px;width:34px}.grid-team>span{font-size:10px;color:#8fa497;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.grid-price-pair{display:grid;grid-template-rows:1fr 1fr 12px;gap:3px;padding-top:14px}.grid-price-cell{display:flex;align-items:center;justify-content:center;gap:7px;min-height:27px;border:1px solid #354c3c;background:#17251c;border-radius:3px}.grid-price-cell strong{font-size:13px;line-height:1.1}.grid-price-cell span{font-size:10px;color:#c4d2c7}.grid-price-pair>small{font-size:8px;color:#96a99a;text-align:center}.grid-price-pair.cached-stale .grid-price-cell{background:#131e17;color:#afbbb2}.grid-verdict{display:flex;flex-direction:column;justify-content:center;gap:5px;padding:3px 0 0 6px;border-left:1px solid #304235;min-width:0}.grid-verdict-line,.grid-jarrett{margin:0;font-size:10px;white-space:nowrap;line-height:1.4}.grid-verdict-line>b{font-weight:700}.grid-target{display:inline-block;width:12px;color:#859d8b;font-size:8px}.grade-win{color:#bdec87!important}.grade-loss{color:#ff918b!important}.grade-push{color:#c3d6e4!important}.grid-no-lock{font-size:9px;color:#acb5ae;border:1px solid #566058;border-radius:3px;padding:3px 6px;align-self:flex-start;background:#202a23}.grid-waiting{font-size:9px;color:#91a296}.grid-expand{cursor:pointer;font-family:inherit;font-size:9px;font-weight:600;background:transparent;border:0;color:#b2d19d;text-align:left;padding:0;align-self:flex-start}.grid-jarrett{color:#acbfb0;font-size:9px}.grid-decision-window{border-top:1px solid #40543e;background:#17251c;padding:12px 16px}.grid-decision-window header{font-size:10px;letter-spacing:1px;color:#c4e0b1;margin-bottom:8px}.consensus-line{font-size:10px;color:#b5c5b7;line-height:1.6;margin:5px 0 9px}.grid-analytics{overflow-x:auto}.grid-analytics h3{font-size:11px;margin:0 0 4px}.grid-analytics table{width:100%;border-collapse:collapse;font-size:10px}.grid-analytics th,.grid-analytics td{padding:6px 8px;border-bottom:1px solid #354936;text-align:right}.grid-analytics th:first-child{text-align:left}.grid-detail-note{font-size:9px;color:#9aaf9d;margin:8px 0;line-height:1.5}.grid-decision-window footer{display:flex;justify-content:space-between;font-size:9px;gap:10px;color:#94a997;margin-top:10px}.measured-analysis p{font-size:11px;line-height:1.55;margin:5px 0}.measured-analysis h3,.our-note h3{font-size:11px;letter-spacing:.7px}.our-note{border-top:1px solid #40543e;margin-top:12px;padding-top:8px;font-size:11px}.note-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0}.our-note input,.our-note select,.our-note textarea,.our-note button{background:#102018;color:#ecf1ed;border:1px solid #48614f;border-radius:3px;padding:6px;font:inherit}.note-text-label{display:block}.our-note textarea{display:block;width:100%;margin-top:5px}.our-note small{color:#a4b8a9}.our-note button{cursor:pointer}.our-note button:disabled{opacity:.5}.locked-alert{padding:8px 12px;border:1px solid #7b6841;color:#e6ca87;font-size:12px}.board-empty{font-size:13px;padding:20px 0}@media(max-width:550px){.locked-board{padding:12px 6px}.locked-heading{align-items:flex-start;gap:8px}.locked-heading h1{font-size:26px}.board-controls{gap:4px;flex-wrap:wrap;justify-content:flex-end;font-size:10px}.grid-price-toolbar small{max-width:160px;text-align:right}.week-records{gap:3px 8px}}`}</style>
    <header className="locked-heading"><div><small>NFL PROJECTION LAB · BETA</small><h1>Week {selected}</h1></div><div className="board-controls"><label>Week <select aria-label="Week" value={selected} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:18},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><button disabled={refreshing} onClick={()=>{setRefreshing(true);void refresh(undefined,true);}}>{refreshing ? "Refreshing…" : "Refresh board"}</button></div></header>
    <dl className="week-records">{([['model','Model picks'],['price','Price picks'],['paper','Paper rules'],['jarrett','Jarrett'],['human_lean','Human leans']] as const).map(([key,label])=>{const r=records?.[key];return <div key={key} style={{display:'contents'}}><dt>{label}</dt><dd>{r ? `${r.wins}-${r.losses}-${r.pushes}` : '—'}</dd><small>{r?.mean_clv_cents != null ? `Mean CLV ${r.mean_clv_cents>0?'+':''}${r.mean_clv_cents.toFixed(1)}¢ · n=${r.clv_n}` : 'CLV pending'}</small></div>;})}</dl>
    <p className="record-note">W-L-P · Model and paper picks are separate from Jarrett’s wagers. CLV uses the nflverse closing reference.</p>
    {error && <p className="locked-alert" role="status">{error}</p>}
    {board?.publication_status === "STALE" && <p className="locked-alert">Publication update delayed. Saved locks and grades remain visible.</p>}
    {!board && !error && <p className="board-empty">Loading picks…</p>}
    {selected!==1 && <div className="grid-price-toolbar"><div role="group" aria-label="Displayed sportsbook">{['betmgm','williamhill_us','fanduel','draftkings'].map(b=><button key={b} aria-pressed={book===b} onClick={()=>setBook(b)}>{names[b]}</button>)}</div><small>Saved prices · {names[book]} · Verdict books follow each pick</small></div>}
    <div className="grid-table-scroll">{selected===1 ? <><div className="week1-column-head"><span>MATCHUP</span><span>PROJECTED WINNER</span><span>PROJECTED SCORE</span><span>SPREAD PICK</span><span>TOTAL PICK</span><span>BETTING STATUS</span></div>{games.map(g=><Week1PredictionRow key={g.game_id} game={g} analytics={<GameDecision game={g}/>}/>)}</> : <><div className="grid-column-head"><span>MATCHUP</span><span>SPREAD</span><span>TOTAL</span><span>MONEY</span><span>VERDICT</span></div>{games.map(g=><GameRow key={g.game_id} game={g} quotes={quotes} book={book}/>)}</>}</div>
    {board && !games.length && <p className="board-empty">No published games for this week.</p>}
  </section>;
}
