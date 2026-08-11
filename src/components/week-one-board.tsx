"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { analyzeSlipValue, decimalToAmerican, type LineBookKey, type LineMarketKey, type LiveLine, type SlipLeg } from "@/domain/line-board";
import type { PickedBy, WeeklyPlay } from "@/domain/play-card";
import { pickReasons, weekOneKickoffs, weekOneMatchups } from "@/lib/week-one-data";

const days = ["Wednesday", "Thursday", "Sunday", "Monday"] as const;
const bookNames: Record<LineBookKey, string> = { betmgm: "BetMGM", caesars: "Caesars" };
const teamColors: Record<string, string> = {
  ARI: "#97233f", ATL: "#a71930", BAL: "#241773", BUF: "#00338d", CAR: "#0085ca", CHI: "#0b162a", CIN: "#fb4f14", CLE: "#311d00",
  DAL: "#003594", DEN: "#fb4f14", DET: "#0076b6", GB: "#203731", HOU: "#03202f", IND: "#002c5f", JAX: "#006778", KC: "#e31837",
  LV: "#a5acaf", LAC: "#0080c6", LAR: "#003594", MIA: "#008e97", MIN: "#4f2683", NE: "#c60c30", NO: "#d3bc8d", NYG: "#0b2265",
  NYJ: "#125740", PHI: "#004c54", PIT: "#ffb612", SF: "#aa0000", SEA: "#69be28", TB: "#d50a0a", TEN: "#0c2340", WAS: "#5a1414"
};

type TimeZoneChoice = "PT" | "ET";
type SlipMode = "straight" | "parlay";
type LinesResponse = { lines?: LiveLine[]; configured?: boolean; caesarsRequiresPaidPlan?: boolean; error?: string; cached?: boolean };

function formatOdds(value: number): string { return value > 0 ? `+${value}` : `${value}`; }
function formatPoint(value: number | null): string { return value === null ? "" : value > 0 ? `+${value}` : `${value}`; }
function marketTitle(market: LineMarketKey): string { return market === "moneyline" ? "Money" : market[0].toUpperCase() + market.slice(1); }

function formatKickoff(gameId: string, choice: TimeZoneChoice): string {
  const date = new Date(weekOneKickoffs[gameId]);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: choice === "PT" ? "America/Los_Angeles" : "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date).replace(",", " ·");
  return `${formatted} ${choice}`.toUpperCase();
}

function lineSelection(line: LiveLine): string {
  if (line.market === "spread") return `${line.side} ${formatPoint(line.point)}`;
  if (line.market === "total") return `${line.side} ${line.point}`;
  return `${line.side} ML`;
}

function bookmakerMarketVig(lines: readonly LiveLine[], gameId: string, book: LineBookKey, market: LineMarketKey): number | null {
  return lines.find((line) => line.gameId === gameId && line.book === book && line.market === market)?.marketVigPercent ?? null;
}

function combinedAmerican(legs: readonly SlipLeg[]): number {
  const decimal = legs.reduce((product, leg) => product * (leg.americanPrice > 0 ? 1 + leg.americanPrice / 100 : 1 + 100 / Math.abs(leg.americanPrice)), 1);
  return decimalToAmerican(decimal);
}

export function WeekOneBoard() {
  const [book, setBook] = useState<LineBookKey>("betmgm");
  const [timeZone, setTimeZone] = useState<TimeZoneChoice>("PT");
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [configured, setConfigured] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [picker, setPicker] = useState<PickedBy>("gabe");
  const [slipMode, setSlipMode] = useState<SlipMode>("parlay");
  const [reason, setReason] = useState("model-price");
  const [stake, setStake] = useState(25);
  const [plays, setPlays] = useState<WeeklyPlay[]>([]);
  const [message, setMessage] = useState("Select any price cell to add it to the slip.");
  const slipValue = useMemo(() => analyzeSlipValue(slip), [slip]);
  const latestCapture = useMemo(() => lines.reduce<string | null>((latest, line) => !latest || line.capturedAt > latest ? line.capturedAt : latest, null), [lines]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/lines").then((response) => response.json() as Promise<LinesResponse>),
      fetch("/api/plays?week=1").then((response) => response.json() as Promise<{ plays?: WeeklyPlay[] }>)
    ]).then(([lineData, playData]) => {
      if (!active) return;
      setLines(lineData.lines ?? []);
      setConfigured(Boolean(lineData.configured));
      setPlays(playData.plays ?? []);
      if (!lineData.configured) setMessage("Live prices need the Odds API key. The board will not invent them.");
    }).catch(() => active && setMessage("The last good board could not be loaded."));
    return () => { active = false; };
  }, []);

  async function refreshLines() {
    setRefreshing(true);
    setMessage("Refreshing BetMGM and Caesars…");
    try {
      const response = await fetch("/api/lines", { method: "POST" });
      const data = await response.json() as LinesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not refresh lines");
      setLines(data.lines ?? []);
      setConfigured(Boolean(data.configured));
      setMessage(data.cached ? "Current snapshot is already fresh." : "Live prices refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh lines");
    } finally {
      setRefreshing(false);
    }
  }

  function toggleLine(line: LiveLine, matchup: string) {
    const leg: SlipLeg = { ...line, matchup, selection: lineSelection(line) };
    setSlip((current) => {
      if (current.some((item) => item.id === line.id)) return current.filter((item) => item.id !== line.id);
      const sameContractRemoved = current.filter((item) => !(item.gameId === line.gameId && item.book === line.book && item.market === line.market));
      const sameBook = sameContractRemoved.filter((item) => item.book === line.book);
      if (sameBook.length !== sameContractRemoved.length) setMessage(`Slip switched to ${bookNames[line.book]}; contracts cannot cross books.`);
      return [...sameBook, leg];
    });
  }

  async function saveSlip() {
    if (!slip.length) return;
    if (slipMode === "parlay" && slip.length < 2) {
      setMessage("A parlay needs at least two legs. Switch to Straights or add another line.");
      return;
    }
    if (slipMode === "parlay" && !slipValue) {
      setMessage("Fair parlay value is withheld for same-game or incomplete-price legs.");
      return;
    }
    setMessage("Saving to the shared Week 1 card…");
    const selectedReason = pickReasons.find((item) => item.value === reason) ?? pickReasons[0];
    const entries = slipMode === "straight" ? slip.map((leg) => ({
      gameId: leg.gameId,
      playType: "single",
      market: leg.market,
      title: leg.selection,
      legs: leg.matchup,
      americanOdds: leg.americanPrice,
      book: bookNames[leg.book]
    })) : [{
      gameId: "multi-week-1",
      playType: "parlay",
      market: "parlay",
      title: `${slip.length}-leg ${bookNames[slip[0].book]} parlay`,
      legs: slip.map((leg) => `${leg.selection} (${leg.matchup})`).join(" · "),
      americanOdds: combinedAmerican(slip),
      book: bookNames[slip[0].book]
    }];
    try {
      const saved = await Promise.all(entries.map(async (entry) => {
        const response = await fetch("/api/plays", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...entry,
            primaryReason: reason,
            pickedBy: picker,
            stakeDollars: stake,
            modelEdgePp: 0,
            confidence: "play",
            statsCase: `${selectedReason.label}. Model line pending.`,
            footballCase: `${picker === "gabe" ? "Gabe" : "Jarrett"} selected this contract from the shared Week 1 board.`,
            status: "card"
          })
        });
        const data = await response.json() as { play?: WeeklyPlay; error?: string };
        if (!response.ok || !data.play) throw new Error(data.error ?? "Could not save the slip");
        return data.play;
      }));
      setPlays((current) => [...current, ...saved]);
      setSlip([]);
      setMessage(`${picker === "gabe" ? "Gabe" : "Jarrett"} added ${saved.length} ${saved.length === 1 ? "pick" : "picks"} to the shared card.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the slip");
    }
  }

  return <div className={`sportsbook-board book-${book}`}>
    <header className="sportsbook-topline">
      <div><span>2026 REGULAR SEASON</span><h1>Week 1</h1></div>
      <div className="board-controls">
        <div className="click-toggle" role="group" aria-label="Sportsbook">{(["betmgm", "caesars"] as const).map((value) => <button className={book === value ? "active" : ""} onClick={() => setBook(value)} key={value}>{bookNames[value]}</button>)}</div>
        <div className="click-toggle compact" role="group" aria-label="Time zone">{(["PT", "ET"] as const).map((value) => <button className={timeZone === value ? "active" : ""} onClick={() => setTimeZone(value)} key={value}>{value}</button>)}</div>
        <button className="refresh-lines" onClick={refreshLines} disabled={refreshing}>{refreshing ? "Loading…" : "Refresh lines"}</button>
      </div>
    </header>

    <div className="line-status" data-ready={lines.length > 0}>
      <span><i />{lines.length ? `${bookNames[book]} snapshot loaded` : configured ? "Feed connected · load the first snapshot" : "Live odds key needed"}</span>
      <small>{latestCapture ? `UPDATED ${new Date(latestCapture).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : book === "caesars" ? "CAESARS REQUIRES THE PAID FEED" : "BETMGM IS AVAILABLE ON THE FREE FEED"}{!configured && <> · <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">GET KEY ↗</a></>}</small>
    </div>

    <div className="sportsbook-layout">
      <section className="event-board" aria-label="Week 1 game lines">
        <div className="market-column-head"><span>Matchup</span><span>Spread</span><span>Total</span><span>Money</span></div>
        {days.map((day) => <div className="event-day" key={day}>
          <div className="event-day-label"><b>{day}</b><span>{weekOneMatchups.filter((game) => game.day === day).length} games</span></div>
          {weekOneMatchups.filter((game) => game.day === day).map((game) => {
            const bookLines = lines.filter((line) => line.gameId === game.id && line.book === book);
            const rowData = [{ team: game.away, totalSide: "Over" }, { team: game.home, totalSide: "Under" }] as const;
            const homeSpread = bookLines.find((line) => line.market === "spread" && line.side === game.home);
            const vig = (["spread", "total", "moneyline"] as const).map((market) => bookmakerMarketVig(lines, game.id, book, market));
            return <article className="event-market" key={game.id}>
              <div className="event-time"><b>{formatKickoff(game.id, timeZone)}</b><span>{game.network}</span></div>
              {rowData.map((row) => <div className="team-line" key={row.team}>
                <div className="team-code"><i style={{ background: teamColors[row.team] ?? "#53615b" }}>{row.team.slice(0, 1)}</i><b>{row.team}</b></div>
                {(["spread", "total", "moneyline"] as const).map((market) => {
                  const side = market === "total" ? row.totalSide : row.team;
                  const line = bookLines.find((candidate) => candidate.market === market && candidate.side.toLowerCase() === side.toLowerCase());
                  const active = Boolean(line && slip.some((leg) => leg.id === line.id));
                  return <button className={`price-cell ${active ? "active" : ""}`} disabled={!line} onClick={() => line && toggleLine(line, `${game.away} @ ${game.home}`)} key={market} aria-label={line ? `Select ${lineSelection(line)} at ${formatOdds(line.americanPrice)}` : `${marketTitle(market)} unavailable`}>
                    {line ? <><strong>{market === "moneyline" ? formatOdds(line.americanPrice) : market === "total" ? `${row.totalSide === "Over" ? "O" : "U"} ${line.point}` : formatPoint(line.point)}</strong>{market !== "moneyline" && <span>{formatOdds(line.americanPrice)}</span>}</> : <strong>—</strong>}
                  </button>;
                })}
              </div>)}
              <div className="model-ribbon">
                <span>MARKET <b>{homeSpread ? `${game.home} ${formatPoint(homeSpread.point)}` : "—"}</b></span>
                <span>MODEL <b>—</b></span>
                <span>VIG <b>{vig.map((value) => value === null ? "—" : value.toFixed(1)).join(" / ")}%</b></span>
                <Link href={`/model?game=${game.id}`}>Research →</Link>
              </div>
            </article>;
          })}
        </div>)}
      </section>

      <aside className="shared-slip">
        <div className="slip-head"><div><span>BET SLIP</span><h2>{slip.length} {slip.length === 1 ? "selection" : "selections"}</h2></div>{slip.length > 0 && <button onClick={() => setSlip([])}>Clear</button>}</div>
        <div className="picker-switch"><button className={picker === "gabe" ? "active gabe" : ""} onClick={() => setPicker("gabe")}>Gabe</button><button className={picker === "jarrett" ? "active jarrett" : ""} onClick={() => setPicker("jarrett")}>Jarrett</button></div>
        <div className="slip-mode"><button className={slipMode === "straight" ? "active" : ""} onClick={() => setSlipMode("straight")}>Straights</button><button className={slipMode === "parlay" ? "active" : ""} onClick={() => setSlipMode("parlay")}>Parlay</button></div>
        {slip.length === 0 ? <div className="empty-slip"><b>Click a line.</b><p>The contract lands here. No typing, no dropdowns.</p></div> : <div className="slip-legs">{slip.map((leg, index) => <article key={leg.id}><button onClick={() => setSlip((current) => current.filter((item) => item.id !== leg.id))}>×</button><div><small>{leg.matchup} · {marketTitle(leg.market)}</small><b>{leg.selection}</b><span>Fair {(100 * (leg.fairProbability ?? 0)).toFixed(1)}%</span></div><strong>{formatOdds(leg.americanPrice)}</strong><em>LEG {index + 1}</em></article>)}</div>}
        <div className="reason-clicks"><span>WHY</span>{pickReasons.slice(0, 8).map((item) => <button className={reason === item.value ? "active" : ""} onClick={() => setReason(item.value)} key={item.value}>{item.label.replace("Model disagrees with market price", "Model edge").replace("Opponent-adjusted efficiency matchup", "Efficiency").replace("Turnover or scoring regression", "Regression").replace("Personnel or injury advantage", "Personnel").replace("Coaching or scheme matchup", "Scheme").replace("Role clarity / team chemistry", "Chemistry").replace("Better number / key-number value", "Key number").replace("Pace / scoring environment", "Pace")}</button>)}</div>
        <div className="stake-clicks"><span>STAKE</span>{[12.5, 25, 50].map((value) => <button className={stake === value ? "active" : ""} onClick={() => setStake(value)} key={value}>{value / 25}u</button>)}</div>
        <div className="value-meter">
          <div><span>BOOK PRICE</span><b>{slip.length ? formatOdds(combinedAmerican(slip)) : "—"}</b></div>
          <div><span>NO-VIG FAIR</span><b>{slipValue ? formatOdds(slipValue.fairAmerican) : "—"}</b></div>
          <div className="vig-loss"><span>VALUE LOST</span><b>{slipValue ? `${slipValue.vigDragPercent.toFixed(1)}%` : "—"}</b><small>{slipValue ? `$${slipValue.lossPerUnitDollars.toFixed(2)} per 1u · latest leg +${slipValue.incrementalDragPercent.toFixed(1)}pp` : slip.length > 1 ? "Same-game or incomplete pair: withheld" : "Add a priced leg"}</small></div>
        </div>
        <button className="save-slip" disabled={!slip.length} onClick={saveSlip}>Save to shared card</button>
        <p className="slip-message" aria-live="polite">{message}</p>
        <p className="value-note">Vig drag uses power-method no-vig probabilities and assumes independent legs. It does not estimate correlation or place a wager.</p>
      </aside>
    </div>

    <section className="compact-shared-card">
      <div><span>SHARED CARD</span><h2>{plays.length ? `${plays.length} picks` : "Empty"}</h2></div>
      {plays.slice(-6).map((play) => <article key={play.id}><b>{play.title}</b><span className={play.pickedBy}>{play.pickedBy === "gabe" ? "Gabe" : "Jarrett"}</span><small>{play.book} {formatOdds(play.americanOdds)} · ${(play.stakeCents / 100).toFixed(0)}</small></article>)}
      <Link href="/records">Tracker →</Link>
    </section>
  </div>;
}
