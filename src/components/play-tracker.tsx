"use client";

import { useEffect, useMemo, useState } from "react";
import { isTeamApproved, stakeToUnits, trackerRecordSummaries, trackerSummary, type WeeklyPlay } from "@/domain/play-card";

type Filter = "all" | "open" | "settled";

function dollars(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}$${Math.abs(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

function odds(value: number): string { return value > 0 ? `+${value}` : `${value}`; }

type TrackerSummary = ReturnType<typeof trackerSummary>;

function RecordLane({ label, note, summary }: { label: string; note: string; summary: TrackerSummary }) {
  return <article className="record-lane">
    <header><div><span>{label}</span><h2>{summary.winCount}–{summary.lossCount}–{summary.pushCount}</h2></div><small>{note}</small></header>
    <div className="record-lane-stats">
      <div><span>Profit</span><strong className={summary.profitCents >= 0 ? "positive" : "negative"}>{dollars(summary.profitCents)}</strong><small>{(summary.profitCents / 2500).toFixed(1)}u</small></div>
      <div><span>ROI</span><strong>{summary.roiPercent.toFixed(1)}%</strong><small>{summary.settledCount} graded</small></div>
      <div><span>CLV</span><strong>{summary.clvCount ? `${summary.averageClvCents >= 0 ? "+" : ""}${summary.averageClvCents.toFixed(1)}¢` : "—"}</strong><small>{summary.percentBeatingClose === null ? "No closes" : `${summary.percentBeatingClose.toFixed(0)}% beat close${summary.averageClvPoints ? ` · ${summary.averageClvPoints > 0 ? "+" : ""}${summary.averageClvPoints.toFixed(1)} pt` : ""}`}</small></div>
      <div><span>Drawdown</span><strong>{dollars(-summary.maximumDrawdownCents)}</strong><small>{(summary.maximumDrawdownCents / 2500).toFixed(1)}u max</small></div>
    </div>
  </article>;
}

export function PlayTracker() {
  const [plays, setPlays] = useState<WeeklyPlay[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("Paper or cash is bound to the jointly approved revision. The application never places anything automatically.");
  const official = useMemo(() => plays.filter((play) => isTeamApproved(play.approvals)), [plays]);
  const records = useMemo(() => trackerRecordSummaries(official), [official]);
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

  async function markPlaced(play: WeeklyPlay) {
    setMessage(`Updating ${play.title}…`);
    try {
      const response = await fetch(`/api/plays/${play.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "placed", result: "pending" })
      });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "Update failed");
      setPlays((current) => current.map((row) => row.id === play.id ? data.play! : row));
      setMessage(`${play.title} is recorded as cash placed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
  }

  return <>
    <section className="record-lanes" aria-label="Full and cash-executed records">
      <RecordLane label="Full record" note="All approved picks" summary={records.full} />
      <RecordLane label="Executed only" note="Confirmed cash placed" summary={records.executedOnly} />
    </section>
    <section className="tracker-panel panel-lite">
      <div className="tracker-toolbar"><div><span className="kicker">2026 LEDGER</span><h2>Every week, one running record</h2></div><div className="filter-tabs" role="group" aria-label="Filter tracked plays">{(["all", "open", "settled"] as const).map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></div>
      <p className="tracker-message" aria-live="polite">{message}</p>
      <div className="tracker-table">
        <div className="tracker-head"><span>Play</span><span>Type</span><span>Price</span><span>Stake</span><span>Edge</span><span>State / result</span></div>
        {rows.map((play) => <div className="tracker-row" key={play.id}>
          <div><strong>{play.title}</strong><small>{play.executionStatus === "executed" && play.cashPlacementConfirmed ? "EXECUTED" : "PAPER"} · {play.pickedBy === "gabe" ? "Gabe" : "Jarrett"} · {play.book} · Week {play.week}</small></div>
          <span className={`type-tag ${play.playType}`}>{play.playType}</span>
          <span>{odds(play.americanOdds)}</span>
          <span><b>${(play.stakeCents / 100).toFixed(0)}</b><small>{stakeToUnits(play.stakeCents)}u</small></span>
          <span className={play.modelEdgePp > 0 ? "positive" : ""}>{play.modelEdgePp ? `${play.modelEdgePp > 0 ? "+" : ""}${play.modelEdgePp.toFixed(1)} pp` : "—"}</span>
          <div className="result-cell">{play.status === "settled" ? <><b className={play.result === "win" ? "positive" : play.result === "loss" ? "negative" : ""}>{play.result}</b><small>{dollars(play.profitCents)} · {play.closingClvCents === null ? "CLV pending" : `${play.closingClvCents.toFixed(1)}¢ CLV${play.closingClvPoints === null ? "" : ` · ${play.closingClvPoints > 0 ? "+" : ""}${play.closingClvPoints.toFixed(1)} pt`}`}</small></> : play.status === "placed" ? <><b>placed</b><small>Awaiting nflverse final</small></> : play.executionStatus === "executed" ? <button className="track-action" onClick={() => markPlaced(play)}>Confirm cash placed</button> : <><b>paper</b><small>Tracked in full record only</small></>}</div>
        </div>)}
      </div>
    </section>
  </>;
}
