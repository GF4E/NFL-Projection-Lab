import { WeekOneBoard } from "@/components/week-one-board";

export default async function SundayPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const query = await searchParams;
  return <div className="page week-one-page"><WeekOneBoard initialGameId={query.game} /></div>;
}
