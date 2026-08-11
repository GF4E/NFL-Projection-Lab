"use client";

import { useMemo, useState } from "react";
import { rehearsalPlays } from "@/lib/play-data";
import { stakeToUnits, weeklyAllocation, type WeeklyPlay } from "@/domain/play-card";

function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function odds(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function PlayBuilder() {
  const [plays, setPlays] = useState<WeeklyPlay[]>(rehearsalPlays);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("The rehearsal card is loaded. New plays save to the shared ledger.");
  const allocation = useMemo(() => weeklyAllocation(plays), [plays]);

  async function submitPlay(formData: FormData) {
    setSaving(true);
    setMessage("Saving the play and calculating its price-based EV…");
    const payload = {
      playType: formData.get("playType"),
      title: formData.get("title"),
      legs: formData.get("legs"),
      book: formData.get("book"),
      americanOdds: Number(formData.get("americanOdds")),
      stakeDollars: Number(formData.get("stakeDollars")),
      modelEdgePp: Number(formData.get("modelEdgePp")),
      confidence: formData.get("confidence"),
      statsCase: formData.get("statsCase"),
      footballCase: formData.get("footballCase"),
      status: formData.get("status")
    };
    try {
      const response = await fetch("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "The play could not be saved");
      setPlays((current) => [...current, data.play!]);
      setMessage(`${data.play.title} is now on the shared weekly card.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The play could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function moveToTracker(play: WeeklyPlay) {
    setMessage(`Moving ${play.title} to the bet tracker…`);
    try {
      const response = await fetch(`/api/plays/${play.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "placed", result: "pending", closingClvCents: null })
      });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "The play could not be moved");
      setPlays((current) => current.map((row) => row.id === play.id ? data.play! : row));
      setMessage(`${play.title} is now marked placed and appears in tracking.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The play could not be moved");
    }
  }

  const cardPlays = plays.filter((play) => ["card", "placed", "settled"].includes(play.status));

  return <div className="card-lab">
    <section className="allocation-board" aria-label="Weekly allocation">
      <div className="allocation-copy">
        <span className="kicker">WEEK 01 · TARGET RANGE</span>
        <strong>{dollars(allocation.stakedCents)}</strong>
        <p>{allocation.units} units across {allocation.count} plays</p>
      </div>
      <div className="range-visual">
        <div className="range-labels"><span>$0</span><b>$400 target</b><b>$600 ceiling</b></div>
        <div className="range-line"><i style={{ width: `${Math.min(100, allocation.stakedCents / 600)}%` }} /><em style={{ left: "66.666%" }} /><em style={{ left: "100%" }} /></div>
        <p className={allocation.inTargetBand ? "range-ok" : "range-open"}>
          {allocation.inTargetBand ? "Card is inside the weekly range" : `${dollars(allocation.remainingToMinimumCents)} still to allocate`}
        </p>
      </div>
      <div className="mix-counts">
        {(["single", "parlay", "teaser"] as const).map((type) => <div key={type}><b>{cardPlays.filter((play) => play.playType === type).length}</b><span>{type}s</span></div>)}
      </div>
    </section>

    <div className="role-pair" aria-label="Team roles">
      <article><span className="role-mark data">G</span><div><b>Market &amp; model read</b><p>Price translation, uncertainty, trends and where the market looks inefficient.</p></div><small>Gabe&apos;s lane</small></article>
      <article><span className="role-mark field">J</span><div><b>Football &amp; chemistry read</b><p>Personnel form, locker-room context, role changes and whether the matchup story is real.</p></div><small>Jarrett&apos;s lane</small></article>
    </div>

    <div className="builder-layout">
      <section className="quick-card panel-lite">
        <div className="section-heading"><div><span className="kicker">SIMPLE INTAKE</span><h2>Add one play</h2></div><span className="step-chip">01 → CARD</span></div>
        <form action={submitPlay}>
          <div className="form-pair">
            <label>Type<select name="playType" defaultValue="single"><option value="single">Single</option><option value="parlay">Parlay</option><option value="teaser">Teaser</option></select></label>
            <label>Confidence<select name="confidence" defaultValue="play"><option value="watch">Watch</option><option value="lean">Lean</option><option value="play">Play</option><option value="best">Best</option></select></label>
          </div>
          <label>Bet selection<input name="title" required defaultValue="Green Bay +2.5" aria-label="Bet selection" /></label>
          <label>Game or legs<input name="legs" required defaultValue="Packers at Vikings" aria-label="Game or parlay legs" /></label>
          <div className="form-triple">
            <label>Book<select name="book" defaultValue="BetMGM"><option>BetMGM</option><option>FanDuel</option></select></label>
            <label>Odds<input name="americanOdds" type="number" defaultValue={-110} required /></label>
            <label>Stake $<input name="stakeDollars" type="number" min="12.5" max="200" step="12.5" defaultValue={50} required /></label>
          </div>
          <label>Model edge, percentage points<input name="modelEdgePp" type="number" min="-10" max="20" step="0.1" defaultValue={2.5} required /></label>
          <label>Statistical case<textarea name="statsCase" required defaultValue="Opponent-adjusted early-down EPA and the translated price both point the same way." /></label>
          <label>Football / chemistry check<textarea name="footballCase" required defaultValue="Confirm the offensive-line rotation and skill-position usage before the final decision." /></label>
          <div className="form-pair">
            <label>Add as<select name="status" defaultValue="card"><option value="card">Weekly card</option><option value="research">Research lean</option></select></label>
            <button className="primary-action" disabled={saving} type="submit">{saving ? "Saving…" : "Add to card"}</button>
          </div>
        </form>
        <p className="form-message" aria-live="polite">{message}</p>
      </section>

      <section className="weekly-card panel-lite">
        <div className="section-heading"><div><span className="kicker">THE WORKING CARD</span><h2>Eight plays, one view</h2></div><span className="step-chip">02 → TRACK</span></div>
        <div className="card-column-head"><span>Play</span><span>Edge / EV</span><span>Stake</span><span>Status</span></div>
        <div className="compact-plays">
          {cardPlays.map((play, index) => <article className="compact-play" key={play.id}>
            <div className="play-order">{String(index + 1).padStart(2, "0")}</div>
            <div className="play-main"><div className="play-tags"><span className={`type-tag ${play.playType}`}>{play.playType}</span><span>{play.book} · {odds(play.americanOdds)}</span><span className={`confidence ${play.confidence}`}>{play.confidence}</span></div><h3>{play.title}</h3><p>{play.legs}</p><details><summary>Why it made the card</summary><div className="case-grid"><p><b>STATS</b>{play.statsCase}</p><p><b>FOOTBALL</b>{play.footballCase}</p></div></details></div>
            <div className="edge-stack"><strong>+{play.modelEdgePp.toFixed(1)}<small> pp</small></strong><span>{play.estimatedEvPercent >= 0 ? "+" : ""}{play.estimatedEvPercent.toFixed(1)}% EV</span></div>
            <div className="stake-stack"><strong>{dollars(play.stakeCents)}</strong><span>{stakeToUnits(play.stakeCents)}u</span></div>
            <div className="play-status"><span>{play.status}</span>{play.status === "card" ? <button onClick={() => moveToTracker(play)}>Mark placed</button> : <small>{play.result}</small>}</div>
          </article>)}
        </div>
      </section>
    </div>
  </div>;
}
