import { GameCard } from "@/components/game-card";
import { PageHeader } from "@/components/page-header";
import { sundayGames } from "@/lib/demo-data";

export default function SundayPage() {
  return <div className="page sunday-page">
    <PageHeader eyebrow="SUNDAY MODE · SEP 13" title="The live board">
      Today only. Every number carries its age; approved cards never move on their own.
    </PageHeader>
    <div className="slate-strip">
      <div><span>Today&apos;s queue</span><strong>3 games</strong></div>
      <div><span>Suggested exposure</span><strong>1.5u <small>/ 10u</small></strong></div>
      <div><span>Joint approvals</span><strong>1 <small>/ 2 eligible</small></strong></div>
      <div><span>System state</span><strong className="positive">Current</strong></div>
    </div>
    <div className="game-list">{sundayGames.map((game) => <GameCard game={game} key={game.id} />)}</div>
  </div>;
}
