"use client";

import { useEffect, useMemo, useState } from "react";
import { isTeamApproved, stakeToUnits, trackerSummary, type PlayResult, type WeeklyPlay } from "@/domain/play-card";

type Filter = "all" | "open" | "settled";

function dollars(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}$${Math.abs(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

function odds(value: number): string { return value > 0 ? `+${value}` : `${value}`; }

export function PlayTracker() {
  const [plays, setPlays] = useState<WeeklyPlay[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("Only jointly approved picks enter the 2026 ledger.");
  const official = useMemo(() => plays.filter((play) => isTeamApproved(play.approvals)), [plays]);
  const summary = useMemo(() => trackerSummary(official), [official]);
  const rows = official.filter((play) => {
    if (filter === "open") return play.status !== "settled" && play.status !== "passed";
    if (filter === "settled") return play.status === "settled";
    return play.status !== "passed";
  });

  useEffect(() => {
    let active = true;
    fetch("/api/plays")
      .then(async (response) => {
        const data = await response.json() as { plays?: WeeklyPlay[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load tracked plays");
        if (active) setPlays(data.plays ?? []);
      })
      .catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : "Unable to load tracked plays"));
    return () => { active = false; };
  }, []);

  async function update(play: WeeklyPlay, status: "placed" | "settled", result: PlayResult) {
    setMessage(`Updating ${play.title}…`);
    try {
      const response = await fetch(`/api/plays/${play.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, result, closingClvCents: null })
      });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "Update failed");
      setPlays((current) => current.map((row) => row.id === play.id ? data.play! : row));
      setMessage(`${play.title} is recorded as ${result === "pending" ? "placed" : result}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  }

  return <>
    <section className="tracker-kpis">
      <article><span>Settled</span><strong>{summary.winCount}–{summary.lossCount}–{summary.pushCount}</strong><small>{summary.settledCount} graded plays</small></article>
      <article><span>Profit</span><strong className={summary.profitCents >= 0 ? "positive" : "negative"}>{dollars(summary.profitCents)}</strong><small>{(summary.profitCents / 2500).toFixed(1)} units</small></article>
      <article><span>ROI</span><strong>{summary.roiPercent.toFixed(1)}%</strong><small>On {dollars(summary.stakedCents).replace("+", "")} settled risk</small></article>
      <article><span>Average CLV</span><strong>{summary.clvCount ? `${summary.averageClvCents >= 0 ? "+" : ""}${summary.averageClvCents.toFixed(1)}¢` : "—"}</strong><small>{summary.clvCount ? `${summary.clvCount} verified closes` : "No verified closes yet"}</small></article>
    </section>
    <section className="tracker-panel panel-lite">
      <div className="tracker-toolbar"><div><span className="kicker">2026 LEDGER</span><h2>Every week, one running record</h2></div><div className="filter-tabs" role="group" aria-label="Filter tracked plays">{(["all", "open", "settled"] as const).map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></div>
      <p className="tracker-message" aria-live="polite">{message}</p>
      <div className="tracker-table">
        <div className="tracker-head"><span>Play</span><span>Type</span><span>Price</span><span>Stake</span><span>Edge</span><span>State / result</span></div>
        {rows.map((play) => <div className="tracker-row" key={play.id}>
          <div><strong>{play.title}</strong><small>{play.pickedBy === "gabe" ? "Gabe" : "Jarrett"} · {play.book} · Week {play.week}</small></div>
          <span className={`type-tag ${play.playType}`}>{play.playType}</span>
          <span>{odds(play.americanOdds)}</span>
          <span><b>${(play.stakeCents / 100).toFixed(0)}</b><small>{stakeToUnits(play.stakeCents)}u</small></span>
          <span className={play.modelEdgePp > 0 ? "positive" : ""}>{play.modelEdgePp ? `${play.modelEdgePp > 0 ? "+" : ""}${play.modelEdgePp.toFixed(1)} pp` : "—"}</span>
          <div className="result-cell">{play.status === "settled" ? <><b className={play.result === "win" ? "positive" : play.result === "loss" ? "negative" : ""}>{play.result}</b><small>{dollars(play.profitCents)} · {play.closingClvCents === null ? "CLV pending" : `${play.closingClvCents.toFixed(1)}¢ CLV`}</small></> : play.status === "placed" ? <div className="grade-buttons"><button onClick={() => update(play, "settled", "win")}>W</button><button onClick={() => update(play, "settled", "loss")}>L</button><button onClick={() => update(play, "settled", "push")}>P</button></div> : <button className="track-action" onClick={() => update(play, "placed", "pending")}>Mark placed</button>}</div>
        </div>)}
      </div>
    </section>
  </>;
}
