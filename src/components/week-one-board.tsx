"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WeeklyPlay } from "@/domain/play-card";
import { officialScheduleSource, pickReasons, weekOneMatchups } from "@/lib/week-one-data";

const days = ["Wednesday", "Thursday", "Sunday", "Monday"] as const;
const markets = [
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "total", label: "Total" },
  { value: "teaser", label: "Teaser" },
  { value: "parlay", label: "Parlay" }
] as const;

function odds(value: number) { return value > 0 ? `+${value}` : `${value}`; }

export function WeekOneBoard({ initialGameId }: { initialGameId?: string }) {
  const firstId = weekOneMatchups.some((game) => game.id === initialGameId) ? initialGameId! : "ne-sea";
  const [selectedId, setSelectedId] = useState(firstId);
  const [market, setMarket] = useState("spread");
  const [selection, setSelection] = useState("");
  const [reason, setReason] = useState("model-price");
  const [plays, setPlays] = useState<WeeklyPlay[]>([]);
  const [message, setMessage] = useState("Choose a matchup, then add the exact contract when the market is available.");
  const [saving, setSaving] = useState(false);
  const selected = weekOneMatchups.find((game) => game.id === selectedId) ?? weekOneMatchups[0];
  const selectedReason = pickReasons.find((item) => item.value === reason) ?? pickReasons[0];

  useEffect(() => {
    let active = true;
    fetch("/api/plays?week=1")
      .then(async (response) => {
        const data = await response.json() as { plays?: WeeklyPlay[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load the card");
        if (active) setPlays(data.plays ?? []);
      })
      .catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : "Could not load the card"));
    return () => { active = false; };
  }, []);

  const playsByGame = useMemo(() => new Map(weekOneMatchups.map((game) => [game.id, plays.filter((play) => play.gameId === game.id).length])), [plays]);

  async function addPick(formData: FormData) {
    const trimmedSelection = selection.trim();
    if (!trimmedSelection) {
      setMessage("Enter the exact side, total, teaser or parlay selection first.");
      return;
    }
    setSaving(true);
    setMessage("Adding this contract to the Week 1 card…");
    const playType = market === "teaser" ? "teaser" : market === "parlay" ? "parlay" : "single";
    const footballNote = String(formData.get("footballNote") ?? "").trim();
    const payload = {
      gameId: selected.id,
      playType,
      market,
      primaryReason: reason,
      title: trimmedSelection,
      legs: `${selected.away} at ${selected.home}`,
      book: formData.get("book"),
      americanOdds: Number(formData.get("americanOdds")),
      stakeDollars: Number(formData.get("stakeDollars")),
      modelEdgePp: Number(formData.get("modelEdgePp")),
      confidence: formData.get("confidence"),
      statsCase: `${selectedReason.label}. ${selected.quantQuestion}`,
      footballCase: footballNote || selected.footballQuestion,
      status: "card"
    };
    try {
      const response = await fetch("/api/plays", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "Could not add the pick");
      setPlays((current) => [...current, data.play!]);
      setSelection("");
      setMessage(`${data.play.title} is on the Week 1 card.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the pick");
    } finally {
      setSaving(false);
    }
  }

  return <div className="week-one-board">
    <header className="week-label">
      <div><span>2026 REGULAR SEASON</span><h1>Week 1</h1></div>
      <a href={officialScheduleSource} target="_blank" rel="noreferrer">16 matchups · official NFL schedule ↗</a>
    </header>

    <div className="matchup-workspace">
      <section className="matchup-picker" aria-label="Week 1 matchups">
        {days.map((day) => <div className="day-group" key={day}>
          <div className="day-heading"><b>{day}</b><span>{weekOneMatchups.filter((game) => game.day === day).length} game{weekOneMatchups.filter((game) => game.day === day).length === 1 ? "" : "s"}</span></div>
          {weekOneMatchups.filter((game) => game.day === day).map((game) => <button className={selected.id === game.id ? "matchup-row active" : "matchup-row"} onClick={() => { setSelectedId(game.id); setSelection(""); }} key={game.id}>
            <span className="matchup-time">{game.date}<small>{game.timePt} PT</small></span>
            <span className="matchup-teams"><b>{game.away}</b><i>@</i><b>{game.home}</b><small>{game.awayName.replace(/^[A-Za-z .'-]+ /, "")} at {game.homeName.replace(/^[A-Za-z .'-]+ /, "")}</small></span>
            <span className="matchup-state">{playsByGame.get(game.id) ? `${playsByGame.get(game.id)} on card` : "review"}</span>
          </button>)}
        </div>)}
      </section>

      <section className="matchup-detail">
        <div className="selected-game-head">
          <div><span>{selected.day} · {selected.date} · {selected.timePt} PT</span><h2>{selected.away} <i>@</i> {selected.home}</h2><p>{selected.venue} · {selected.network}</p></div>
          <span className="line-pending">LINES NOT LOADED</span>
        </div>
        <div className="research-handoff">
          <div className="research-summary"><span>RESEARCH STARTER</span><p>{selected.researchFocus}</p></div>
          <article className="quant-question"><b className="role-token gabe">G</b><div><span>GABE · QUANT QUESTION</span><p>{selected.quantQuestion}</p></div></article>
          <article className="field-question"><b className="role-token jarrett">J</b><div><span>JARRETT · FOOTBALL QUESTION</span><p>{selected.footballQuestion}</p></div></article>
          <Link className="research-link" href={`/model?game=${selected.id}`}>Open full research for this matchup <span>→</span></Link>
        </div>

        <form className="pick-form" action={addPick}>
          <div className="pick-form-title"><div><span>ADD A PICK</span><h3>{selected.away} at {selected.home}</h3></div><small>Exact contract only</small></div>
          <div className="market-fields">
            <label>Market<select value={market} onChange={(event) => setMarket(event.target.value)}>{markets.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="selection-field">Selection<input value={selection} onChange={(event) => setSelection(event.target.value)} placeholder={market === "total" ? "Under 45.5" : market === "moneyline" ? `${selected.home} moneyline` : `${selected.away} +3`} /></label>
          </div>
          <label>Primary reason<select value={reason} onChange={(event) => setReason(event.target.value)}>{pickReasons.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><small>{selectedReason.lane} · {selectedReason.description}</small></label>
          <div className="contract-fields">
            <label>Book<select name="book" defaultValue="BetMGM"><option>BetMGM</option><option>FanDuel</option></select></label>
            <label>Odds<input name="americanOdds" type="number" defaultValue={-110} /></label>
            <label>Model edge<input name="modelEdgePp" type="number" min="-10" max="20" step="0.1" defaultValue={0} /><small>pp</small></label>
            <label>Stake<input name="stakeDollars" type="number" min="12.5" max="200" step="12.5" defaultValue={25} /><small>$</small></label>
            <label>Confidence<select name="confidence" defaultValue="lean"><option value="watch">Watch</option><option value="lean">Lean</option><option value="play">Play</option><option value="best">Best</option></select></label>
          </div>
          <label>Optional football note<input name="footballNote" placeholder="What does the model miss about players, roles or chemistry?" /></label>
          <button className="add-pick-button" disabled={saving}>{saving ? "Adding…" : "Add to Week 1 card"}</button>
          <p className="pick-message" aria-live="polite">{message}</p>
        </form>
      </section>
    </div>

    <section className="week-card-strip">
      <div className="card-strip-title"><div><span>BETTING CARD</span><h2>{plays.length ? `${plays.length} pick${plays.length === 1 ? "" : "s"}` : "No picks yet"}</h2></div><Link href="/records">Open tracker →</Link></div>
      {plays.length === 0 ? <div className="empty-card"><b>Start with a matchup.</b><span>Research the game, choose the exact contract, record the primary reason, then add it here.</span></div> : <div className="card-picks">{plays.map((play, index) => <article key={play.id}><span className="card-pick-number">{String(index + 1).padStart(2, "0")}</span><div><small>{weekOneMatchups.find((game) => game.id === play.gameId)?.away} @ {weekOneMatchups.find((game) => game.id === play.gameId)?.home} · {play.market}</small><b>{play.title}</b><span>{pickReasons.find((item) => item.value === play.primaryReason)?.label ?? play.primaryReason}</span></div><div><b>{play.book} {odds(play.americanOdds)}</b><span>${(play.stakeCents / 100).toFixed(0)} · {play.confidence}</span></div></article>)}</div>}
    </section>
  </div>;
}
