import { PageHeader } from "@/components/page-header";
import { PlayTracker } from "@/components/play-tracker";

export default function RecordsPage() {
  return <div className="page tracker-page">
    <PageHeader eyebrow="SEASON RECORD" title="2026 running total">
      Every week rolls into one ledger. Profit, units, ROI and verified closing-line value stay together.
    </PageHeader>
    <PlayTracker />
  </div>;
}
