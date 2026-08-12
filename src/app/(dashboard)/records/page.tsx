import { PageHeader } from "@/components/page-header";
import { PlayTracker } from "@/components/play-tracker";

export default function RecordsPage() {
  return <div className="page tracker-page">
    <PageHeader eyebrow="SEASON RECORD" title="2026 running total">
      One full record for every approved pick, plus a separate cash-placed record. The two never merge.
    </PageHeader>
    <PlayTracker />
  </div>;
}
