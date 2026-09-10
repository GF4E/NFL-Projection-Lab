"use client";

import { useEffect, useState } from "react";
import type { LockedBoard, LockedGame, Verdict } from "../domain/locked-board";

const names: Record<string, string> = { betmgm: "BetMGM", williamhill_us: "Caesars", fanduel: "FanDuel", draftkings: "DraftKings" };
const odds = (n?: number) => n === undefined ? "—" : n > 0 ? `+${n}` : `${n}`;
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" : "Awaiting lock";

export function VerdictView({ title, verdict: v, final }: { title: string; verdict: Verdict; final: boolean }) {
  if (final) return <section className="locked-verdict"><h3>{title}</h3><strong className="locked-state">{v.grade ?? (v.availability === "MISSED" ? "MISSED" : "PENDING GRADE")}</strong><p>{v.state ?? v.availability}{v.side ? ` · ${v.side}` : ""}</p><p>{v.grade ? "Locked model pick · final grade" : v.reason}</p></section>;
  if (!v.state) return <section className="locked-verdict"><h3>{title}</h3><strong className="locked-state">{v.availability === "WAITING_T75" ? "AWAITING T75" : v.availability}</strong><p>{v.reason}</p></section>;
  return <section className="locked-verdict"><h3>{title}</h3><strong className="locked-state">{v.state}</strong>
    {v.state === "PLAY" ? <><p className="locked-selection">{v.side} {odds(v.line)} · {names[v.book!] ?? v.book} {odds(v.price)}</p><p>Fair probability {((v.fair_probability ?? 0) * 100).toFixed(1)}% · EV {((v.EV ?? 0) * 100).toFixed(1)}%</p></> : v.state === "TEASE" ? <><p className="locked-selection">{v.leg} → {odds(v.teased_line)}</p><p>Crosses {v.key_numbers_crossed?.join(" / ")} · {names[v.best_book!] ?? v.best_book} {odds(v.teaser_price)}</p><p>NEEDS_PARTNER · leg only</p></> : <p>{v.reason}</p>}
    {v.edge_source && <small>Edge source: {v.edge_source}</small>}
  </section>;
}

export function GameDecision({ game: g }: { game: LockedGame }) {
  const final = g.status === "FINAL";
  return <div className="locked-decision">
    {final && <div className="locked-final"><strong>{g.away_abbr} {g.final_score!.away} — {g.home_abbr} {g.final_score!.home} FINAL</strong><span>Total {g.total} · Home margin {odds(g.margin)}</span></div>}
    <div className="locked-verdicts"><VerdictView title="Spread" verdict={g.verdicts.spreads} final={final} /><VerdictView title="Total" verdict={g.verdicts.totals} final={final} /></div>
    <footer>Freeze: {g.lock_status === "MISSED" ? "MISSED — no lock" : when(g.freeze_time)}<br/><span title={g.version}>Version: {g.version}</span></footer>
  </div>;
}

export function LockedModelBoard() {
  const [board, setBoard] = useState<LockedBoard | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/model-board", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Locked board is unavailable");
        const data = await response.json() as LockedBoard;
        setBoard(data); setError(null);
      } catch { if (!controller.signal.aborted) setError("STALE · Unable to verify the latest publication. Verdicts are hidden."); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const selected = week ?? board?.default_week ?? 1;
  const games = board?.games.filter(g => g.week === selected) ?? [];
  return <section className="locked-board" aria-label="Locked model board">
    <style>{`.locked-board{max-width:1400px;margin:auto;color:#e9efeb;padding:24px 12px}.locked-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.locked-heading h1{font-size:clamp(32px,5vw,62px);margin:0}.locked-heading select{padding:12px;background:#15221e;color:inherit;border:1px solid #43514b;border-radius:6px}.locked-note{color:#acbcb3;margin:16px 0 24px}.locked-game{border:1px solid #3d4f46;background:#101b16;margin:12px 0;border-radius:10px;overflow:hidden}.locked-game summary{display:flex;justify-content:space-between;gap:16px;cursor:pointer;padding:22px;font-size:20px;font-weight:700}.locked-game summary small{font-size:12px;color:#bbc9c1;display:block;margin-top:6px}.locked-game summary em{font-style:normal;color:#c9fc74;font-size:14px}.locked-decision{padding:0 22px 22px}.locked-verdicts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.locked-verdict{padding:20px;border:1px solid #43544a;border-radius:8px;min-width:0}.locked-verdict h3{margin:0 0 12px;color:#b0beb6;text-transform:uppercase;font-size:14px;letter-spacing:2px}.locked-state{font-size:28px}.locked-selection{font-size:20px}.locked-verdict p{line-height:1.5}.locked-verdict small{color:#b0beb6}.locked-decision footer{margin-top:18px;line-height:1.7;font-size:12px;color:#a9b9af;overflow-wrap:anywhere}.locked-final{display:flex;flex-direction:column;gap:8px;padding:12px 0 24px}.locked-final strong{font-size:30px}.locked-final span{color:#adbbb2}.locked-alert{padding:16px;border:1px solid #a48a41;color:#f1d17e}@media(max-width:640px){.locked-verdicts{grid-template-columns:1fr}.locked-game summary{font-size:17px;padding:16px}.locked-decision{padding:0 16px 16px}.locked-heading{align-items:flex-start}.locked-state{font-size:24px}}`}</style>
    <header className="locked-heading"><div><small>BETA · LOCKED MODEL PICKS</small><h1>WEEK {selected}</h1></div><label>Week <select value={selected} onChange={e => setWeek(Number(e.target.value))}>{Array.from({length:18},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></header>
    <p className="locked-note">Two locked decisions per game. Paper model picks. Final scores and grades come from the engine’s nflverse record.</p>
    {error && <p className="locked-alert" role="status">{error}</p>}
    {board?.publication_status === "STALE" && <p className="locked-alert">STALE publication · Final results remain available.</p>}
    {!board && !error && <p>Loading locked picks…</p>}
    {games.map(g => <details className="locked-game" key={g.game_id} open={g.status === "FINAL"}>
      <summary><span>{g.away_team} at {g.home_team}<small>{when(g.kickoff_at)}</small></span><em>{g.status === "FINAL" ? `${g.away_abbr} ${g.final_score!.away} — ${g.home_abbr} ${g.final_score!.home} FINAL` : error ? "STALE" : g.lock_status === "MISSED" ? "MISSED" : g.status}</em></summary>
      {error && g.status !== "FINAL" ? <p className="locked-alert">STALE · No verdict</p> : <GameDecision game={g} />}
    </details>)}
    {board && !games.length && <p>No published games for this week.</p>}
  </section>;
}
