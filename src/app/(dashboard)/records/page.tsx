import { PageHeader } from "@/components/page-header";
import { PlayTracker } from "@/components/play-tracker";

export default function RecordsPage() {
  return <div className="page tracker-page">
    <PageHeader eyebrow="BET TRACKER" title="The record gets its own room.">
      Research creates possibilities. Only plays that reach the card enter this ledger, with stake, result, profit and closing-line value kept together.
    </PageHeader>
    <PlayTracker />
  </div>;
}
