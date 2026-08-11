"use client";

import Link from "next/link";
import { useState } from "react";
import { pickReasons, weekOneMatchups } from "@/lib/week-one-data";

export function ResearchExplorer({ initialGameId }: { initialGameId?: string }) {
  const [gameId, setGameId] = useState(weekOneMatchups.some((game) => game.id === initialGameId) ? initialGameId! : "ne-sea");
  const game = weekOneMatchups.find((item) => item.id === gameId) ?? weekOneMatchups[0];
  return <section className="research-explorer panel-lite">
    <div className="research-explorer-head"><div><span className="kicker">MATCHUP RESEARCH</span><h2>{game.away} at {game.home}</h2></div><select aria-label="Select Week 1 matchup" value={gameId} onChange={(event) => setGameId(event.target.value)}>{weekOneMatchups.map((item) => <option value={item.id} key={item.id}>{item.away} at {item.home} · {item.day}</option>)}</select></div>
    <div className="research-bridge">
      <article><span>CONTEXT</span><p>{game.researchFocus}</p></article>
      <article className="gabe-lane"><b>G</b><div><span>GABE · MODEL / MARKET</span><p>{game.quantQuestion}</p></div></article>
      <article className="jarrett-lane"><b>J</b><div><span>JARRETT · PLAYERS / CHEMISTRY</span><p>{game.footballQuestion}</p></div></article>
    </div>
    <div className="reason-library"><div><span className="kicker">STANDARD PICK REASONS</span><p>Use one primary reason on the card. The longer analysis can combine several, but this keeps the decision legible later.</p></div><div className="reason-chips">{pickReasons.filter((reason) => reason.value !== "other").map((reason) => <span data-lane={reason.lane} key={reason.value}>{reason.label}</span>)}</div></div>
    <Link className="research-return" href={`/sunday?game=${game.id}`}>Return to Week 1 and build the pick →</Link>
  </section>;
}
