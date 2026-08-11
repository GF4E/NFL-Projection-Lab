import { PageHeader } from "@/components/page-header";
import { PlayBuilder } from "@/components/play-builder";

export default function SundayPage() {
  return <div className="page card-page">
    <PageHeader eyebrow="WEEK 01 · PLAY SHEET" title="Build the card. Keep the edge.">
      Start simple: what is the bet, why is the price wrong, what does the football say, and how much belongs on it? The detail stays one click deeper.
    </PageHeader>
    <PlayBuilder />
    <p className="education-note">Private research and record-keeping workspace. It never places a wager or treats a model output as certainty.</p>
  </div>;
}
