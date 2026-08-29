"use client";
import { Check } from "./icons";
import { Sparkline } from "./sparkline";

type Game = {
  readonly id: string; readonly away: string; readonly awayName: string; readonly home: string; readonly homeName: string;
  readonly kickoff: string; readonly countdown: string; readonly venue: string; readonly roof: string; readonly weather: string;
  readonly inactives: boolean; readonly model: string; readonly selection: string; readonly market: string; readonly edge: string;
  readonly interval: string; readonly units: string; readonly dollars: string; readonly status: string; readonly edgeDecay: string;
  readonly sparkline: readonly number[];
  readonly books: readonly { readonly name: string; readonly point: string; readonly price: string; readonly age: string; readonly fair: string; readonly shrunk: string; readonly ev: string; readonly canonical: string; readonly best: boolean }[];
};

export function GameCard({ game }: { game: Game }) {
  const approved = game.status.startsWith("Approved");
  const edgeGone = game.status === "Edge gone";
  return (
    <article className={edgeGone ? "game-card edge-gone" : "game-card"}>
      <div className="game-head">
        <div className="matchup">
          <div className="team-token"><strong>{game.away}</strong><span>{game.awayName}</span></div>
          <span className="at">@</span>
          <div className="team-token"><strong>{game.home}</strong><span>{game.homeName}</span></div>
        </div>
        <div className="kickoff"><span>{game.kickoff}</span><strong>{game.countdown}</strong><small>TO KICKOFF</small></div>
      </div>
      <div className="conditions">
        <span>{game.venue}</span><span>{game.roof}</span><span>{game.weather}</span>
        <span className={game.inactives ? "confirmed" : "pending"}>{game.inactives ? "Inactives confirmed" : "Inactives pending"}</span>
      </div>
      <div className="card-grid">
        <section className="projection-block">
          <span className="section-label">LIVE ADVISOR</span>
          <p className="model-score">{game.model}</p>
          <div className="selection-row"><div><small>{game.market}</small><strong>{game.selection}</strong></div><div><small>Shrunk edge · 46s</small><strong className={edgeGone ? "negative" : "positive"}>{game.edge}</strong></div></div>
          <div className="interval"><span>80% edge interval</span><b>{game.interval}</b></div>
          <div className="movement"><div><span>OPEN → NOW</span><b>{game.edgeDecay}</b></div><Sparkline values={game.sparkline} danger={edgeGone} /></div>
        </section>
        <section className="books-block">
          <span className="section-label">EXACT CONTRACTS · CANONICAL POINT</span>
          <div className="book-table-labels"><span>Book / quote</span><span>Fair</span><span>Shrunk</span><span>EV</span></div>
          {game.books.map((book) => (
            <div className={book.best ? "book-row best" : "book-row"} key={book.name}>
              <div><b>{book.name}</b><strong>{book.point} <em>{book.price}</em></strong><small>{book.age} old · equiv {book.canonical}</small></div>
              <span>{book.fair}<small>{book.age}</small></span><span>{book.shrunk}<small>{book.age}</small></span><span className="positive">{book.ev}<small>{book.age}</small></span>
              {book.best && <i>BETTER EV</i>}
            </div>
          ))}
          <div className="price-delta"><span>Translated price delta</span><strong>2.1¢</strong><small>Points normalized before comparison</small></div>
        </section>
        <section className="decision-block">
          <span className="section-label">TEAM DECISION</span>
          <div className={game.interval.startsWith("−") ? "unit-ticket uncertain" : "unit-ticket"}><small>SUGGESTED</small><strong>{game.units}</strong><span>{game.dollars}</span></div>
          <div className="approval-people"><span className="person approved"><b>G</b><em><Check /> Owner reviewed</em></span><span className="person"><b>2</b><em>Teammate seat not activated</em></span></div>
          {edgeGone ? <button className="decision-button disabled" disabled>Edge gone · refresh draft</button> : approved ? <button className="decision-button locked" disabled><Check /> Approval workflow preview</button> : <button className="decision-button disabled" disabled>Teammate access locked</button>}
          <p className="decision-note">Owner-only build. No second approver has been invited or granted access.</p>
        </section>
      </div>
    </article>
  );
}
