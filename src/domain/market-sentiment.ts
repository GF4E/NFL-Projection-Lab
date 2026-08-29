import sentimentConfigJson from "../../config/sentiment.config.json";

export type MarketSentimentMarket = "spread" | "total" | "moneyline";

export interface MarketSentimentSnapshot {
  gameId: string;
  providerGameId: string;
  market: MarketSentimentMarket;
  side: string;
  ticketsPercent: number;
  moneyPercent: number | null;
  sampleBets: number;
  capturedAt: string;
  sourceUrl: string;
  sourceHash: string;
}

export interface MarketSentimentConfig {
  version: string;
  provider: "action_network_public_page";
  sourceUrl: string;
  refreshMinutes: number;
  maximumAgeHours: number;
  minimumSampleBets: number;
  publicLeanPercent: number;
  materialGapPercentagePoints: number;
  sharpPressureGapPercentagePoints: number;
  advisoryOnly: true;
}

export interface MarketSentimentInterpretation {
  adequateSample: boolean;
  material: boolean;
  moneyTicketGap: number | null;
  classification: "possible_sharp_pressure" | "public_lean" | "balanced" | "insufficient_sample";
}

export const marketSentimentConfig = sentimentConfigJson as MarketSentimentConfig;

export function interpretMarketSentiment(
  snapshot: MarketSentimentSnapshot,
  config: MarketSentimentConfig = marketSentimentConfig
): MarketSentimentInterpretation {
  const adequateSample = snapshot.sampleBets >= config.minimumSampleBets;
  const moneyTicketGap = snapshot.moneyPercent === null
    ? null
    : snapshot.moneyPercent - snapshot.ticketsPercent;
  if (!adequateSample) {
    return { adequateSample, material: false, moneyTicketGap, classification: "insufficient_sample" };
  }
  const possibleSharpPressure = moneyTicketGap !== null &&
    moneyTicketGap >= config.sharpPressureGapPercentagePoints;
  const publicLean = snapshot.ticketsPercent >= config.publicLeanPercent;
  return {
    adequateSample,
    material: possibleSharpPressure || publicLean ||
      (moneyTicketGap !== null && Math.abs(moneyTicketGap) >= config.materialGapPercentagePoints),
    moneyTicketGap,
    classification: possibleSharpPressure
      ? "possible_sharp_pressure"
      : publicLean ? "public_lean" : "balanced"
  };
}

/**
 * Keeps at most one concise, decision-relevant row per market. Positive money-minus-ticket
 * divergence wins; otherwise the public side is shown. The signal remains descriptive only.
 */
export function selectMaterialMarketSentiment(
  snapshots: readonly MarketSentimentSnapshot[],
  config: MarketSentimentConfig = marketSentimentConfig
): MarketSentimentSnapshot[] {
  return (["spread", "total", "moneyline"] as const).flatMap((market) => {
    const rows = snapshots.filter((snapshot) => snapshot.market === market)
      .filter((snapshot) => interpretMarketSentiment(snapshot, config).material)
      .sort((left, right) => {
        const leftGap = interpretMarketSentiment(left, config).moneyTicketGap ?? Number.NEGATIVE_INFINITY;
        const rightGap = interpretMarketSentiment(right, config).moneyTicketGap ?? Number.NEGATIVE_INFINITY;
        return rightGap - leftGap || right.ticketsPercent - left.ticketsPercent;
      });
    return rows.slice(0, 1);
  });
}
