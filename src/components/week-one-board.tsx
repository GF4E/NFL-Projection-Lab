"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { priceTwoTeamTeaserDecision, rankBestExecutionProps } from "@/domain/decision-board";
import type {
  DecisionBoardPayload,
  MatchupSignal,
  PlayerPropBoard,
  PropCandidate,
  TeaserCandidate,
  TeaserPairCandidate
} from "@/domain/decision-board";
import { analyzeSlipValue, bestCoveredExecutionBook, decimalToAmerican, isPricedSlipApprovable, updateSlipSelections, type LineBookKey, type LineMarketKey, type LiveLine, type ValueLeg } from "@/domain/line-board";
import { priceIndependentParlayDecision } from "@/domain/forecast-value";
import { alignMatchupEvidence, compactEvidenceLabel, evidenceDetail, materialEvidenceSignals } from "@/domain/evidence-alignment";
import { americanToDecimal, expectedValueWithPush, quoteCostCents } from "@/domain/odds";
import { rankBestBookMainlineRecommendations, rankMainlineRecommendations, rankWeeklyMainlineRecommendations, type MainlineRecommendation } from "@/domain/mainline-recommendations";
import { structuralConfig } from "@/domain/config";
import { playerPropBoardIsActionable } from "@/domain/player-prop-status";
import { PREFERRED_TEAM_CODES } from "@/domain/team-preferences";
import { exactContractApprovalRequest, isTeamApproved, summarizeTeamCardPortfolio, teamCardPortfolioBatchConflicts, type PickedBy, type TeamCardPortfolioPosition, type WeeklyPlay } from "@/domain/play-card";
import { sizeKelly, type SizingResult } from "@/domain/sizing";
import { isPacificSunday, kickoffCountdown, todayOnly } from "@/domain/sunday-mode";
import type { WeeklyMatchup, WeeklySlate } from "@/domain/weekly-slate";
import { pickReasons } from "@/lib/week-one-data";
import {
  interpretMarketSentiment,
  marketSentimentConfig,
  selectMaterialMarketSentiment
} from "@/domain/market-sentiment";

const bookNames: Record<LineBookKey, string> = { betmgm: "BetMGM", fanduel: "FanDuel" };
const preferredTeams = new Set<string>(PREFERRED_TEAM_CODES);

type SlipMode = "straight" | "parlay" | "teaser";
type LinesResponse = { lines?: LiveLine[]; configured?: boolean; season?: number; week?: number; comparisonBooks?: LineBookKey[]; error?: string; cached?: boolean; stale?: boolean };
type DecisionResponse = DecisionBoardPayload & { error?: string };
type SelectedLeg = ValueLeg & {
  id: string;
  sourceQuoteId: string;
  thesisKey: string;
  kind: "mainline" | "prop" | "teaser";
  book: LineBookKey;
  market: LineMarketKey | "prop" | "teaser";
  side: string;
  point: number | null;
  matchup: string;
  selection: string;
  detail: string;
  edge: number | null;
  pushProbability?: number;
  probabilityInterval?: [number, number];
  probabilityMembers?: number[];
  pushProbabilityMembers?: number[];
};

function formatOdds(value: number): string { return value > 0 ? `+${value}` : `${value}`; }
function formatPoint(value: number | null): string { return value === null ? "" : value > 0 ? `+${value}` : `${value}`; }
function formatPercent(value: number | null, digits = 1): string { return value === null ? "—" : `${(value * 100).toFixed(digits)}%`; }
function marketTitle(market: SelectedLeg["market"]): string {
  if (market === "moneyline") return "Money";
  if (market === "prop") return "Player prop";
  return market[0].toUpperCase() + market.slice(1);
}

function marketShortTitle(market: LineMarketKey): string {
  if (market === "moneyline") return "MONEY";
  return market.toUpperCase();
}
function propMarketTitle(market: PropCandidate["market"]): string {
  if (market === "player_pass_yds") return "Pass yards";
  if (market === "player_rush_yds") return "Rush yards";
  return "Receiving yards";
}

function formatKickoff(game: WeeklyMatchup): string {
  const date = new Date(game.kickoffAt);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date).replace(",", " ·");
  return `${formatted} PT`.toUpperCase();
}

type ConfidenceStyle = CSSProperties & { "--bet-confidence": string };

function betConfidence(candidate: MainlineRecommendation | null): number {
  if (!candidate?.actionable) return 0;
  const unitStrength = Math.min(1, candidate.sizing.suggestedUnits / structuralConfig.sizing.maximumUnits);
  const evStrength = Math.min(1, Math.max(0, candidate.expectedValue) / 0.1);
  const uncertaintyStrength = candidate.sizing.greyed ? 0.28 : 1;
  return Math.min(1, (0.25 + unitStrength * 0.45 + evStrength * 0.3) * uncertaintyStrength);
}

function confidenceStyle(candidate: MainlineRecommendation | null): ConfidenceStyle {
  return { "--bet-confidence": betConfidence(candidate).toFixed(3) };
}

function projectedTeamScores(input: {
  away: string;
  home: string;
  projectedHomePoint: number | null;
  projectedTotal: number | null;
}): Record<string, number> | null {
  if (input.projectedHomePoint === null || input.projectedTotal === null) return null;
  const projectedHomeMargin = -input.projectedHomePoint;
  const homeScore = Math.max(0, Math.round((input.projectedTotal + projectedHomeMargin) / 2));
  const awayScore = Math.max(0, Math.round(input.projectedTotal - homeScore));
  return { [input.away]: awayScore, [input.home]: homeScore };
}

function materialCurrentSentiment(
  snapshots: DecisionBoardPayload["games"][number]["sentiment"],
  generatedAt: string
) {
  const generatedTime = Date.parse(generatedAt);
  const current = snapshots.filter((snapshot) => {
    const ageHours = (generatedTime - Date.parse(snapshot.capturedAt)) / 3_600_000;
    return Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= marketSentimentConfig.maximumAgeHours;
  });
  return selectMaterialMarketSentiment(current);
}

function lineSelection(line: LiveLine): string {
  if (line.market === "spread") return `${line.side} ${formatPoint(line.point)}`;
  if (line.market === "total") return `${line.side} ${line.point}`;
  return `${line.side} ML`;
}

function bookmakerMarketVig(lines: readonly LiveLine[], gameId: string, book: LineBookKey, market: LineMarketKey): number | null {
  return lines.find((line) => line.gameId === gameId && line.book === book && line.market === market)?.marketVigPercent ?? null;
}

function combinedAmerican(legs: readonly SelectedLeg[]): number {
  return decimalToAmerican(legs.reduce((product, leg) => product * americanToDecimal(leg.americanPrice), 1));
}

function legExpectedValuePercent(leg: SelectedLeg): number {
  if (leg.fairProbability === null) return 0;
  const probability = Math.min(0.99, Math.max(0.01, leg.fairProbability + (leg.edge ?? 0)));
  return expectedValueWithPush(probability, leg.pushProbability ?? 0, leg.americanPrice) * 100;
}

function legBetProbability(leg: SelectedLeg): number | null {
  return leg.fairProbability === null ? null : Math.min(0.99, Math.max(0.01, leg.fairProbability + (leg.edge ?? 0)));
}

function slipExpectedValuePercent(legs: readonly SelectedLeg[]): number {
  if (!legs.length || legs.some((leg) => leg.fairProbability === null)) return 0;
  const expectedReturn = legs.reduce((product, leg) => {
    const probability = Math.min(0.99, Math.max(0.01, (leg.fairProbability ?? 0) + (leg.edge ?? 0)));
    const push = leg.pushProbability ?? 0;
    return product * (push + (1 - push) * probability * americanToDecimal(leg.americanPrice));
  }, 1);
  return (expectedReturn - 1) * 100;
}

function recommendation(
  probability: number | null,
  americanPrice: number | null,
  edgeInterval: [number, number] | null
): SizingResult | null {
  if (probability === null || americanPrice === null || edgeInterval === null) return null;
  return sizeKelly(probability, americanPrice, edgeInterval, {
    referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
    kellyFraction: structuralConfig.sizing.kellyFraction,
    increment: structuralConfig.sizing.roundDownUnits,
    minimum: structuralConfig.sizing.minimumUnits,
    maximum: structuralConfig.sizing.maximumUnits
  });
}

function straightLegSizing(leg: SelectedLeg): SizingResult | null {
  const betProbability = legBetProbability(leg);
  if (betProbability === null || leg.fairProbability === null || !leg.probabilityInterval) return null;
  return recommendation(betProbability, leg.americanPrice, [
    leg.probabilityInterval[0] - leg.fairProbability,
    leg.probabilityInterval[1] - leg.fairProbability
  ]);
}

function formatInterval(interval: [number, number] | null): string {
  return interval ? `${(interval[0] * 100).toFixed(1)} to ${(interval[1] * 100).toFixed(1)}pp` : "interval unavailable";
}

function snapshotAge(capturedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(capturedAt)) / 60_000));
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${minutes}M`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}H`;
  return `${Math.round(minutes / 1_440)}D`;
}

function teamLogoPath(team: string): string {
  return `/team-logos/${team === "WAS" ? "wsh" : team.toLowerCase()}.png`;
}

function compactKickoffCountdown(kickoffAt: string, now: string): string {
  const remaining = kickoffCountdown(kickoffAt, now);
  if (remaining === 0) return "LOCKED";
  const minutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}H ${minutes % 60}M` : `${minutes}M`;
}

function compactRoofStatus(roof: "outdoor" | "open" | "closed" | "fixed" | "unconfirmed"): string {
  if (roof === "outdoor") return "OUTDOOR";
  if (roof === "open") return "ROOF OPEN";
  if (roof === "closed") return "ROOF CLOSED";
  if (roof === "fixed") return "INDOOR";
  return "ROOF —";
}

function signalInterpretation(signal: MatchupSignal): string {
  if (signal.id === "efficiency") return `${signal.lean} owns the opponent-adjusted efficiency mismatch.`;
  if (signal.id === "success") return `${signal.lean} has the steadier down-to-down path.`;
  if (signal.id === "explosive") return `${signal.lean} has the clearer explosive-play mismatch.`;
  if (signal.id === "turnovers") return `${signal.lean} has the cleaner regression-adjusted possession outlook.`;
  if (signal.id === "pace") return `${signal.lean} pressure rises from the combined tempo.`;
  if (signal.id === "pass_rate") return `${signal.lean} pressure rises from the combined pass tendency.`;
  if (signal.id === "rest") return `${signal.lean} carries the preparation edge.`;
  return `${signal.lean} leads the margin-versus-close strength state.`;
}

function edgeLabel(candidate: MainlineRecommendation | null): string {
  if (!candidate) return "—";
  const points = candidate.probabilityEdge * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp`;
}

function evLabel(candidate: MainlineRecommendation | null): string {
  if (!candidate) return "—";
  const percent = candidate.expectedValue * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function SpreadSparkline({ values }: { values: readonly number[] }) {
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 45 : index * 90 / (values.length - 1);
    const y = 19 - (value - minimum) / span * 16;
    return `${x},${y}`;
  }).join(" ");
  return <svg className="spread-sparkline" viewBox="0 0 90 22" role="img" aria-label="Open-to-current spread movement">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <circle cx={points.split(" ").at(-1)?.split(",")[0]} cy={points.split(" ").at(-1)?.split(",")[1]} r="2.5" fill="currentColor" />
  </svg>;
}

export function WeekOneBoard() {
  const [book, setBook] = useState<LineBookKey>("betmgm");
  const initialBookChosen = useRef(false);
  const expandedGameRef = useRef<HTMLDivElement | null>(null);
  const [slate, setSlate] = useState<WeeklySlate | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [linesStale, setLinesStale] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [slip, setSlip] = useState<SelectedLeg[]>([]);
  const [picker, setPicker] = useState<PickedBy>("gabe");
  const [slipMode, setSlipMode] = useState<SlipMode>("parlay");
  const [reason, setReason] = useState("model-price");
  const [stake, setStake] = useState(25);
  const [executionStatus, setExecutionStatus] = useState<"paper" | "executed">("paper");
  const [plays, setPlays] = useState<WeeklyPlay[]>([]);
  const [message, setMessage] = useState("Select any price cell to add it to the slip.");
  const [intelligence, setIntelligence] = useState<DecisionBoardPayload | null>(null);
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [propBoards, setPropBoards] = useState<Record<string, PlayerPropBoard>>({});
  const [propsLoading, setPropsLoading] = useState<string | null>(null);
  const [teaserPrice, setTeaserPrice] = useState(structuralConfig.teasers.screeningAmerican);
  const [slipOpen, setSlipOpen] = useState(false);
  const [now, setNow] = useState<string | null>(null);
  const matchups = useMemo(() => slate?.games ?? [], [slate]);
  const todayMatchups = useMemo(() => now
    ? todayOnly(matchups.map((game) => ({ kickoffAt: game.kickoffAt, payload: game })), now).map((row) => row.payload)
    : [], [matchups, now]);
  const sundayMode = now !== null && isPacificSunday(now) && todayMatchups.length > 0;
  const visibleMatchups = sundayMode ? todayMatchups : matchups;
  const days = useMemo(() => [...new Set(visibleMatchups.map((game) => game.day))], [visibleMatchups]);
  const slipValue = useMemo(() => slipMode === "teaser" ? null : analyzeSlipValue(slip), [slip, slipMode]);
  const straightEv = useMemo(() => slipMode === "straight" && slip.length === 1 ? legExpectedValuePercent(slip[0]) : null, [slip, slipMode]);
  const latestCapture = useMemo(() => lines.reduce<string | null>((latest, line) =>
    line.book === book && (!latest || line.capturedAt > latest) ? line.capturedAt : latest, null), [book, lines]);
  const activeMarketCoverage = useMemo(() => intelligence?.marketCoverage
    .filter((item) => item.book === book) ?? [], [book, intelligence]);
  const coverageReadout = useMemo(() => {
    if (!activeMarketCoverage.length) return null;
    const incomplete = activeMarketCoverage.filter((item) => item.status !== "complete");
    if (!incomplete.length) return "ALL 3 MARKETS POSTED";
    return incomplete.map((item) => `${marketShortTitle(item.market)} ${item.completeGames}/${item.totalGames}`).join(" · ");
  }, [activeMarketCoverage]);
  const teaserValue = useMemo(() => {
    if (slipMode !== "teaser" || slip.length !== 2 || slip.some((leg) => leg.kind !== "teaser" || leg.fairProbability === null || leg.pushProbability === undefined || leg.probabilityMembers?.length !== structuralConfig.model.bootstrapMembers || leg.pushProbabilityMembers?.length !== structuralConfig.model.bootstrapMembers)) return null;
    if (new Set(slip.map((leg) => leg.gameId)).size !== slip.length) return null;
    const priced = priceTwoTeamTeaserDecision(slip.map((leg) => ({ conditionalWinProbability: leg.fairProbability!, pushProbability: leg.pushProbability!, probabilityMembers: leg.probabilityMembers!, pushProbabilityMembers: leg.pushProbabilityMembers! })), teaserPrice);
    return priced ? { ...priced, evPercent: priced.expectedValue * 100 } : null;
  }, [slip, slipMode, teaserPrice]);
  const parlayDecision = useMemo(() => slipMode === "parlay" ? priceIndependentParlayDecision(slip.map((leg) => ({
    betProbability: legBetProbability(leg),
    pushProbability: leg.pushProbability ?? null,
    uncertaintyInterval: leg.probabilityInterval ?? null
  })), slip.length > 1 ? combinedAmerican(slip) : -110) : null, [slip, slipMode]);
  const straightSizing = useMemo(() => slipMode === "straight"
    ? slip.map(straightLegSizing)
    : [], [slip, slipMode]);
  const preferenceConflicts = useMemo(() => slip.map((leg) => {
    if (leg.kind === "prop" || leg.market === "total") return false;
    const matchup = matchups.find((game) => game.id === leg.gameId);
    return Boolean(matchup && [matchup.away, matchup.home].some((team) => preferredTeams.has(team) && team !== leg.side));
  }), [matchups, slip]);
  const preferenceGateCleared = useMemo(() => preferenceConflicts.every((conflict, index) => {
    if (!conflict) return true;
    if (slipMode === "teaser") return Boolean(teaserValue && teaserValue.expectedValue >= structuralConfig.teasers.preferredOpponentExceptionalEv);
    return (slip[index]?.edge ?? Number.NEGATIVE_INFINITY) >= structuralConfig.monitoring.pushEdgeThreshold;
  }), [preferenceConflicts, slip, slipMode, teaserValue]);
  const straightEligibleLegCount = straightSizing.filter((sizing, index) => sizing?.included && (
    !preferenceConflicts[index] ||
    (slip[index]?.edge ?? Number.NEGATIVE_INFINITY) >= structuralConfig.monitoring.pushEdgeThreshold
  )).length;
  const officialPlays = useMemo(() => plays.filter((play) => isTeamApproved(play.approvals)), [plays]);
  const portfolio = useMemo(() => summarizeTeamCardPortfolio(officialPlays, slate?.week ?? 1), [officialPlays, slate?.week]);
  const proposedPortfolioPositions = useMemo<TeamCardPortfolioPosition[]>(() => {
    if (!slip.length || !slate) return [];
    const position = (legs: readonly SelectedLeg[], market: string, gameId: string): TeamCardPortfolioPosition => ({
      week: slate.week,
      gameId,
      market,
      stakeCents: Math.round(stake * 100),
      contract: legs.map((leg) => ({
        sourceQuoteId: leg.sourceQuoteId,
        gameId: leg.gameId,
        market: leg.kind === "teaser" ? "teaser" : leg.market === "prop" ? "prop" : leg.market,
        side: leg.side,
        point: leg.point,
        americanPrice: leg.americanPrice,
        selection: leg.selection
      }))
    });
    return slipMode === "straight"
      ? slip.map((leg) => position([leg], leg.market, leg.gameId))
      : [position(slip, slipMode, `multi-week-${slate.week}`)];
  }, [slip, slipMode, slate, stake]);
  const portfolioConflicts = useMemo(() => teamCardPortfolioBatchConflicts(
    officialPlays,
    proposedPortfolioPositions
  ), [officialPlays, proposedPortfolioPositions]);
  const proposedUnits = proposedPortfolioPositions.reduce((sum, position) => sum + position.stakeCents / 2_500, 0);
  const weeklyOpportunities = useMemo(() => rankWeeklyMainlineRecommendations(visibleMatchups.flatMap((game) => {
    const gameIntel = intelligence?.games.find((item) => item.gameId === game.id);
    if (!gameIntel) return [];
    return (["betmgm", "fanduel"] as const).flatMap((executionBook) => rankMainlineRecommendations({
      gameId: game.id,
      awayTeam: game.away,
      homeTeam: game.home,
      book: executionBook,
      lines,
      spread: gameIntel.projections.find((item) => item.book === executionBook) ?? null,
      total: gameIntel.totals.find((item) => item.book === executionBook) ?? null,
      moneyline: gameIntel.moneylines.find((item) => item.book === executionBook) ?? null,
      preferredTeams
    }));
  }), Math.max(1, visibleMatchups.length * 2)).filter((candidate) => {
    if (!slate) return false;
    const position: TeamCardPortfolioPosition = {
      week: slate.week,
      gameId: candidate.line.gameId,
      market: candidate.line.market,
      stakeCents: candidate.sizing.suggestedUnits * 2_500,
      contract: [{
        sourceQuoteId: candidate.line.id,
        gameId: candidate.line.gameId,
        market: candidate.line.market,
        side: candidate.line.side,
        point: candidate.line.point,
        americanPrice: candidate.line.americanPrice,
        selection: lineSelection(candidate.line)
      }]
    };
    return teamCardPortfolioBatchConflicts(officialPlays, [position]).length === 0;
  }).slice(0, 5), [intelligence, lines, officialPlays, slate, visibleMatchups]);
  const slipCanApprove = isPricedSlipApprovable({
    mode: slipMode,
    legCount: slip.length,
    straightEligibleLegCount,
    singleBook: new Set(slip.map((leg) => leg.book)).size <= 1,
    standardValue: slipValue,
    teaserExpectedValuePercent: teaserValue?.sizing.included ? teaserValue.evPercent : null
  }) && (slipMode !== "parlay" || Boolean(parlayDecision?.sizing.included && parlayDecision.expectedValue >= 0)) && preferenceGateCleared &&
    portfolioConflicts.length === 0;

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date().toISOString()), 0);
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const slateResponse = await fetch("/api/weekly-slate");
      const slateData = await slateResponse.json() as WeeklySlate & { error?: string };
      if (!slateResponse.ok || slateData.error) throw new Error(slateData.error ?? "The weekly schedule is unavailable");
      const query = `?week=${slateData.week}`;
      const [lineData, playData, decisionData] = await Promise.all([
        fetch(`/api/lines${query}`).then((response) => response.json() as Promise<LinesResponse>),
        fetch(`/api/plays${query}`).then((response) => response.json() as Promise<{ plays?: WeeklyPlay[]; actor?: PickedBy }>),
        fetch(`/api/decision-board${query}`).then((response) => response.json() as Promise<DecisionResponse>)
      ]);
      if (!active) return;
      setSlate(slateData);
      const nextLines = lineData.lines ?? [];
      setLines(nextLines);
      setLinesStale(Boolean(lineData.stale));
      if (!initialBookChosen.current) {
        setBook(bestCoveredExecutionBook(nextLines));
        initialBookChosen.current = true;
      }
      setConfigured(Boolean(lineData.configured));
      setPlays(playData.plays ?? []);
      if (playData.actor) setPicker(playData.actor);
      if (!decisionData.error) setIntelligence(decisionData);
      if (!lineData.configured) setMessage("Live prices need the Odds API key. The board will not invent them.");
      if (lineData.configured && lineData.stale) {
        const refreshResponse = await fetch(`/api/lines${query}`, { method: "POST" });
        const refreshed = await refreshResponse.json() as LinesResponse;
        if (!active) return;
        if (!refreshResponse.ok || refreshed.error) {
          setLinesStale(true);
          setMessage(refreshed.error ?? "The latest prices are unavailable; the last good board is preserved.");
          return;
        }
        const refreshedLines = refreshed.lines ?? nextLines;
        setLines(refreshedLines);
        setLinesStale(Boolean(refreshed.stale));
        const refreshedDecision = await fetch(`/api/decision-board${query}`).then((response) => response.json() as Promise<DecisionResponse>);
        if (active && !refreshedDecision.error) setIntelligence(refreshedDecision);
      }
    };
    void load().catch((error) => active && setMessage(error instanceof Error ? error.message : "The last good board could not be loaded."));
    const refreshed = () => {
      void load().catch(() => {
        // The current card remains usable when a background refresh fails.
      });
    };
    window.addEventListener("projection-lab:data-refreshed", refreshed);
    return () => {
      active = false;
      window.removeEventListener("projection-lab:data-refreshed", refreshed);
    };
  }, []);

  useEffect(() => {
    if (!openGame) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !expandedGameRef.current?.contains(event.target)) {
        setOpenGame(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGame(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openGame]);

  async function toggleDecisionDesk(gameId: string) {
    const next = openGame === gameId ? null : gameId;
    setOpenGame(next);
    if (!next) return;
    setPropsLoading(next);
    try {
      const response = await fetch(`/api/props?gameId=${encodeURIComponent(next)}`, { method: "GET" });
      const data = await response.json() as PlayerPropBoard & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Player prop board failed to load");
      setPropBoards((current) => ({ ...current, [next]: data }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Player prop board failed to load");
    } finally {
      setPropsLoading(null);
    }
  }

  function addLeg(leg: SelectedLeg, mode: SlipMode = slipMode) {
    setSlipOpen(true);
    setSlip((current) => {
      const updated = updateSlipSelections(current, leg, mode);
      if (updated.switchedBook) setMessage(`Slip switched to ${bookNames[leg.book]}; combined contracts cannot cross books.`);
      return updated.legs;
    });
  }

  function mainlineLeg(line: LiveLine, matchup: string): SelectedLeg {
    const gameIntel = intelligence?.games.find((game) => game.gameId === line.gameId);
    const projection = gameIntel?.projections.find((item) => item.book === line.book);
    const totalProjection = gameIntel?.totals.find((item) => item.book === line.book);
    const moneylineProjection = gameIntel?.moneylines.find((item) => item.book === line.book);
    let shrunkProbability: number | null = null;
    let edgeInterval: [number, number] | null = null;
    let pushProbability: number | undefined;
    if (line.market === "spread" && projection?.shrunkHomeProbability !== null && projection?.shrunkHomeProbability !== undefined) {
      shrunkProbability = line.side === projection.homeTeam ? projection.shrunkHomeProbability : 1 - projection.shrunkHomeProbability;
      edgeInterval = projection.edgeInterval
        ? line.side === projection.homeTeam ? projection.edgeInterval : [-projection.edgeInterval[1], -projection.edgeInterval[0]]
        : null;
      pushProbability = projection.pushProbability ?? undefined;
    } else if (line.market === "total" && totalProjection?.shrunkProbability !== null && totalProjection?.shrunkProbability !== undefined && totalProjection.lean.toLowerCase() === line.side.toLowerCase()) {
      shrunkProbability = totalProjection.shrunkProbability;
      edgeInterval = totalProjection.edgeInterval;
      pushProbability = totalProjection.pushProbability ?? undefined;
    } else if (line.market === "moneyline" && moneylineProjection?.shrunkHomeProbability !== null && moneylineProjection?.shrunkHomeProbability !== undefined) {
      shrunkProbability = line.side === moneylineProjection.homeTeam ? moneylineProjection.shrunkHomeProbability : 1 - moneylineProjection.shrunkHomeProbability;
      edgeInterval = moneylineProjection.edgeInterval
        ? line.side === moneylineProjection.homeTeam ? moneylineProjection.edgeInterval : [-moneylineProjection.edgeInterval[1], -moneylineProjection.edgeInterval[0]]
        : null;
      pushProbability = moneylineProjection.tieProbability ?? undefined;
    }
    return {
      id: line.id, sourceQuoteId: line.id, thesisKey: `${line.gameId}:${line.market}`, kind: "mainline", gameId: line.gameId, book: line.book, market: line.market, side: line.side,
      point: line.point, americanPrice: line.americanPrice, fairProbability: line.fairProbability,
      matchup, selection: lineSelection(line), detail: `${marketTitle(line.market)} · ${formatOdds(line.americanPrice)}`,
      edge: shrunkProbability === null || line.fairProbability === null ? null : shrunkProbability - line.fairProbability,
      pushProbability,
      probabilityInterval: line.fairProbability === null || edgeInterval === null ? undefined : [
        Math.max(0.001, line.fairProbability + edgeInterval[0]),
        Math.min(0.999, line.fairProbability + edgeInterval[1])
      ]
    };
  }

  function toggleLine(line: LiveLine, matchup: string, mode: SlipMode = slipMode) {
    if (mode === "teaser") {
      setMessage("Use a highlighted six-point teaser leg under Picks.");
      return;
    }
    const leg = mainlineLeg(line, matchup);
    const sized = straightLegSizing(leg);
    if (sized?.included) setStake(sized.suggestedUnits * 25);
    addLeg(leg, mode);
  }

  function addWeeklyOpportunity(candidate: MainlineRecommendation) {
    const matchup = matchups.find((game) => game.id === candidate.line.gameId);
    if (!matchup) return;
    setBook(candidate.line.book);
    setSlipMode("straight");
    toggleLine(candidate.line, `${matchup.away} @ ${matchup.home}`, "straight");
  }

  function addProp(prop: PropCandidate, matchup: string) {
    setSlipMode("straight");
    setStake(prop.suggestedUnits * 25);
    addLeg(propLeg(prop, matchup), "straight");
  }

  function propLeg(prop: PropCandidate, matchup: string): SelectedLeg {
    return {
      id: prop.id, sourceQuoteId: prop.sourceQuoteId, thesisKey: `${prop.gameId}:prop:${prop.market}:${prop.player.toLowerCase()}`, kind: "prop", gameId: prop.gameId, book: prop.executionBook, market: "prop", side: prop.side,
      point: prop.point, americanPrice: prop.americanPrice, fairProbability: prop.executionFairProbability,
      matchup, selection: `${prop.player} ${prop.side} ${prop.point}`,
      detail: `${propMarketTitle(prop.market)} · ${prop.referenceBooks}-book confirmation`, edge: prop.edge
      , pushProbability: 0, probabilityInterval: [
        Math.max(0.001, prop.executionFairProbability + prop.edgeInterval[0]),
        Math.min(0.999, prop.executionFairProbability + prop.edgeInterval[1])
      ]
    };
  }

  function addTeaser(candidate: TeaserCandidate, matchup: string) {
    const line = lines.find((item) => item.gameId === candidate.gameId && item.book === candidate.book && item.market === "spread" && item.side === candidate.team);
    if (!line || candidate.fairProbability === null || candidate.pushProbability === null) return;
    setSlipMode("teaser");
    addLeg({
      id: `teaser:${line.id}:${candidate.teasedPoint}`, sourceQuoteId: line.id, thesisKey: `${line.gameId}:teaser`, kind: "teaser", gameId: line.gameId, book: line.book, market: "teaser", side: line.side,
      point: candidate.teasedPoint, americanPrice: line.americanPrice, fairProbability: candidate.fairProbability,
      matchup, selection: `${line.side} ${formatPoint(candidate.teasedPoint)}`,
      detail: `6-point ${candidate.classification === "classic_wong" ? "Wong" : candidate.classification === "key_number" ? "key-number" : "positive-EV"} leg`, edge: candidate.fairProbability - (line.fairProbability ?? 0),
      pushProbability: candidate.pushProbability, probabilityInterval: candidate.probabilityInterval ?? undefined,
      probabilityMembers: candidate.probabilityMembers ?? undefined,
      pushProbabilityMembers: candidate.pushProbabilityMembers ?? undefined
    }, "teaser");
  }

  function teaserPairLegs(pair: TeaserPairCandidate): SelectedLeg[] {
    return pair.legs.flatMap<SelectedLeg>((candidate) => {
      const line = lines.find((item) => item.gameId === candidate.gameId && item.book === candidate.book && item.market === "spread" && item.side === candidate.team);
      const matchup = matchups.find((game) => game.id === candidate.gameId);
      if (!line || !matchup || candidate.fairProbability === null || candidate.pushProbability === null) return [];
      return [{
        id: `teaser:${line.id}:${candidate.teasedPoint}`, sourceQuoteId: line.id, thesisKey: `${line.gameId}:teaser`, kind: "teaser", gameId: line.gameId, book: line.book, market: "teaser", side: line.side,
        point: candidate.teasedPoint, americanPrice: line.americanPrice, fairProbability: candidate.fairProbability,
        matchup: `${matchup.away} @ ${matchup.home}`, selection: `${line.side} ${formatPoint(candidate.teasedPoint)}`,
        detail: `6-point ${candidate.classification === "classic_wong" ? "Wong" : candidate.classification === "key_number" ? "key-number" : "positive-EV"} leg`,
        edge: candidate.fairProbability - (line.fairProbability ?? 0), pushProbability: candidate.pushProbability,
        probabilityInterval: candidate.probabilityInterval ?? undefined
        , probabilityMembers: candidate.probabilityMembers ?? undefined,
        pushProbabilityMembers: candidate.pushProbabilityMembers ?? undefined
      }];
    });
  }

  function addTeaserPair(pair: TeaserPairCandidate) {
    const legs = teaserPairLegs(pair);
    if (legs.length !== 2) return;
    setSlipMode("teaser");
    setSlipOpen(true);
    setSlip(legs);
    setTeaserPrice(pair.screeningAmerican);
    setStake(pair.suggestedUnits * 25);
    setMessage(`Push-adjusted ${bookNames[pair.book]} teaser pair loaded. Confirm the offered price before saving.`);
  }

  function bestPaperEquivalent(leg: SelectedLeg, targetBook?: LineBookKey): SelectedLeg | null {
    if (leg.kind === "mainline") {
      const equivalent = lines
        .filter((line) => line.gameId === leg.gameId && line.market === leg.market && line.side.toLowerCase() === leg.side.toLowerCase() && (!targetBook || line.book === targetBook))
        .map((line) => mainlineLeg(line, leg.matchup))
        .filter((candidate) => candidate.edge !== null && candidate.probabilityInterval)
        .sort((left, right) => legExpectedValuePercent(right) - legExpectedValuePercent(left));
      return equivalent[0] ?? null;
    }
    if (leg.kind === "prop") {
      const equivalent = Object.values(propBoards).filter(playerPropBoardIsActionable).flatMap((board) => board.candidates)
        .filter((candidate) => `${candidate.gameId}:prop:${candidate.market}:${candidate.player.toLowerCase()}` === leg.thesisKey && (!targetBook || candidate.executionBook === targetBook))
        .sort((left, right) => right.lowerBoundExpectedValue - left.lowerBoundExpectedValue || right.expectedValue - left.expectedValue);
      return equivalent[0] ? propLeg(equivalent[0], leg.matchup) : null;
    }
    return null;
  }

  function normalizedPaperSlip(): SelectedLeg[] {
    if (slipMode === "straight") return slip.map((leg) => bestPaperEquivalent(leg) ?? leg);
    if (slipMode === "parlay") {
      const alternatives = (["betmgm", "fanduel"] as const).flatMap((candidateBook) => {
        const candidate = slip.map((leg) => bestPaperEquivalent(leg, candidateBook));
        return candidate.every((leg): leg is SelectedLeg => leg !== null)
          ? [{ legs: candidate, ev: slipExpectedValuePercent(candidate) }]
          : [];
      }).sort((left, right) => right.ev - left.ev);
      return alternatives[0]?.legs ?? slip;
    }
    const selectedTheses = [...slip.map((leg) => `${leg.gameId}:${leg.side}`)].sort().join("|");
    const alternatives = (intelligence?.teaserPairs ?? []).flatMap((pair) => {
      const pairTheses = [...pair.legs.map((leg) => `${leg.gameId}:${leg.team}`)].sort().join("|");
      if (pairTheses !== selectedTheses) return [];
      const decision = priceTwoTeamTeaserDecision(pair.legs.map((leg) => ({
        conditionalWinProbability: leg.fairProbability!, pushProbability: leg.pushProbability!,
        probabilityMembers: leg.probabilityMembers!, pushProbabilityMembers: leg.pushProbabilityMembers!
      })), teaserPrice);
      return decision ? [{ pair, expectedValue: decision.expectedValue }] : [];
    }).sort((left, right) => right.expectedValue - left.expectedValue);
    return alternatives[0] ? teaserPairLegs(alternatives[0].pair) : slip;
  }

  function sameSlipContract(left: readonly SelectedLeg[], right: readonly SelectedLeg[]): boolean {
    return left.length === right.length && left.every((leg, index) =>
      leg.sourceQuoteId === right[index]?.sourceQuoteId && leg.point === right[index]?.point && leg.americanPrice === right[index]?.americanPrice
    );
  }

  async function saveSlip() {
    if (!slip.length || !slate) return;
    if (executionStatus === "paper") {
      const normalized = normalizedPaperSlip();
      if (!sameSlipContract(slip, normalized)) {
        setSlip(normalized);
        if (new Set(normalized.map((leg) => leg.book)).size === 1) setBook(normalized[0].book);
        setMessage("Paper card moved to the highest-EV supported book contract. Review the changed point and price, then approve again.");
        return;
      }
    }
    if (slipMode === "parlay" && slip.length < 2) {
      setMessage("A parlay needs at least two legs. Switch to Straights or add another line.");
      return;
    }
    if (slipMode === "parlay" && !slipValue) {
      setMessage("Fair parlay value is withheld for same-game or incomplete-price legs.");
      return;
    }
    if (slipMode === "straight" && straightEligibleLegCount !== slip.length) {
      setMessage("Straight withheld: every contract must have a current model probability, an 80% interval, and at least a 0.5u Kelly result.");
      return;
    }
    if (portfolioConflicts.length) {
      setMessage(`Team-card limit: ${portfolioConflicts[0].message}.`);
      return;
    }
    if (slipMode === "teaser" && (!teaserValue || teaserValue.evPercent < 0 || !teaserValue.sizing.included)) {
      setMessage("Teaser withheld: the exact price must clear the empirical uncertainty and 0.5u Kelly gates.");
      return;
    }
    setMessage(`Recording ${picker === "gabe" ? "Gabe" : "Jarrett"}'s Week ${slate.week} approval…`);
    const selectedReason = pickReasons.find((item) => item.value === reason) ?? pickReasons[0];
    const entries = slipMode === "straight" ? slip.map((leg) => ({
      gameId: leg.gameId,
      book: bookNames[leg.book],
      playType: "single" as const,
      market: leg.market === "prop" ? "prop" as const : leg.market as "spread" | "moneyline" | "total",
      title: leg.selection,
      legs: `${leg.matchup} · ${leg.detail}`,
      americanOdds: leg.americanPrice,
      modelEdgePp: (leg.edge ?? 0) * 100,
      estimatedEvPercent: legExpectedValuePercent(leg),
      statsCase: `${selectedReason.label}. ${leg.detail}.`,
      contract: [{ sourceQuoteId: leg.sourceQuoteId, gameId: leg.gameId, market: leg.market === "prop" ? "prop" as const : leg.market as "spread" | "total" | "moneyline", side: leg.side, point: leg.point, americanPrice: leg.americanPrice, selection: leg.selection }]
    })) : [{
      gameId: `multi-week-${slate.week}`,
      book: bookNames[slip[0].book],
      playType: slipMode,
      market: slipMode,
      title: `${slip.length}-leg ${bookNames[slip[0].book]} ${slipMode}`,
      legs: slip.map((leg) => `${leg.selection} (${leg.matchup})`).join(" · "),
      americanOdds: slipMode === "teaser" ? teaserPrice : combinedAmerican(slip),
      modelEdgePp: 0,
      estimatedEvPercent: slipMode === "teaser" ? teaserValue?.evPercent ?? 0 : slipExpectedValuePercent(slip),
      statsCase: `${selectedReason.label}. ${slipMode === "teaser" ? "Push-adjusted empirical teaser EV cleared the selected book price." : "Power-de-vigged independent-leg price check completed."}`,
      contract: slip.map((leg) => ({ sourceQuoteId: leg.sourceQuoteId, gameId: leg.gameId, market: leg.kind === "teaser" ? "teaser" as const : leg.market === "prop" ? "prop" as const : leg.market as "spread" | "total" | "moneyline", side: leg.side, point: leg.point, americanPrice: leg.americanPrice, selection: leg.selection }))
    }];
    try {
      const saved = await Promise.all(entries.map(async (entry) => {
        const response = await fetch("/api/plays", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...entry,
            week: slate.week,
            primaryReason: reason, stakeDollars: stake,
            executionStatus, cashPlacementConfirmed: false,
            confidence: "play", footballCase: "The team selected this exact contract from the shared decision board.", status: "card"
          })
        });
        const data = await response.json() as { play?: WeeklyPlay; error?: string };
        if (!response.ok || !data.play) throw new Error(data.error ?? "Could not save the slip");
        return data.play;
      }));
      setPlays((current) => {
        const next = new Map(current.map((play) => [play.id, play]));
        for (const play of saved) next.set(play.id, play);
        return [...next.values()];
      });
      if (saved.every((play) => isTeamApproved(play.approvals))) {
        setSlip([]);
        setMessage(`Team approved · ${saved.length} ${saved.length === 1 ? "pick is" : "picks are"} now official.`);
      } else {
        const missing = picker === "gabe" ? "Jarrett" : "Gabe";
        setMessage(`${picker === "gabe" ? "Gabe" : "Jarrett"} approved. Awaiting ${missing} on this exact contract.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the slip");
    }
  }

  async function approvePending(play: WeeklyPlay) {
    if (isTeamApproved(play.approvals) || play.approvals?.includes(picker)) return;
    setMessage(`Rechecking ${play.title} at ${play.book} before ${picker === "gabe" ? "Gabe" : "Jarrett"} approves…`);
    try {
      const response = await fetch("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(exactContractApprovalRequest(play, play.executionStatus === "executed"))
      });
      const data = await response.json() as { play?: WeeklyPlay; error?: string };
      if (!response.ok || !data.play) throw new Error(data.error ?? "Approval failed");
      setPlays((current) => current.map((row) => row.id === data.play!.id ? data.play! : row));
      setMessage(isTeamApproved(data.play.approvals)
        ? `Team approved · ${data.play.title} is now official.`
        : `${picker === "gabe" ? "Gabe" : "Jarrett"} approved. Awaiting the other teammate.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed");
    }
  }

  return <div className={`sportsbook-board book-${book}`}>
    <header className="sportsbook-topline">
      <div><h1>Week {slate?.week ?? 1}</h1><span>{sundayMode ? `${visibleMatchups.length} today` : `${matchups.length || 16} games`}</span></div>
      <div className="board-controls">
        <div className="click-toggle" role="group" aria-label="Sportsbook">{(["betmgm", "fanduel"] as const).map((value) => <button className={book === value ? "active" : ""} onClick={() => setBook(value)} key={value}>{bookNames[value]}</button>)}</div>
      </div>
    </header>

    <div className="line-status" data-ready={lines.length > 0}>
      <span><i />{lines.length ? linesStale ? "LINES STALE" : "LINES LIVE" : configured ? "LINES PENDING" : "ODDS KEY NEEDED"}</span>
      <small>{bookNames[book].toUpperCase()} · {coverageReadout ? `${coverageReadout} · ` : ""}{latestCapture ? `${snapshotAge(latestCapture)} OLD` : "NO SNAPSHOT"}{!configured && <> · <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">GET KEY ↗</a></>}</small>
    </div>

    <div className={`sportsbook-layout ${slipOpen || slip.length ? "" : "slip-collapsed"}`}>
      <section className="event-board" aria-label={`Week ${slate?.week ?? 1} game lines`}>
        <section className={`weekly-opportunity-queue ${weeklyOpportunities.length ? "has-opportunities" : "empty"}`} aria-label="Best executable model opportunities this week">
          <header><span>BEST AVAILABLE</span><small>{weeklyOpportunities.length ? `${weeklyOpportunities.length} ${weeklyOpportunities.length === 1 ? "play" : "plays"}` : "No play"}</small></header>
          {weeklyOpportunities.map((candidate, index) => {
            const matchup = visibleMatchups.find((game) => game.id === candidate.line.gameId);
            const gameIntel = intelligence?.games.find((game) => game.gameId === candidate.line.gameId);
            const context = alignMatchupEvidence(gameIntel?.signals ?? [], candidate.market, candidate.line.side);
            return <button className={`confidence-bet ${candidate.sizing.greyed ? "uncertain" : ""}`} style={confidenceStyle(candidate)} onClick={() => addWeeklyOpportunity(candidate)} key={candidate.line.id}>
              <span>{index + 1}</span>
              <div><small>{matchup ? `${matchup.away} @ ${matchup.home}` : candidate.line.gameId} · {bookNames[candidate.line.book]}</small><b>{lineSelection(candidate.line)} <strong>{formatOdds(candidate.line.americanPrice)}</strong></b><em className={context.verdict}>{compactEvidenceLabel(context)}</em></div>
              <div><b>+{(candidate.expectedValue * 100).toFixed(1)}%</b><small>{candidate.sizing.suggestedUnits}u{candidate.sizing.greyed ? " · UNCERTAIN" : ""}</small></div>
            </button>;
          })}
        </section>
        <div className="market-column-head"><span>Matchup</span>{(["spread", "total", "moneyline"] as const).map((market) => {
          const coverage = activeMarketCoverage.find((item) => item.market === market);
          return <span className={coverage?.status === "complete" ? "" : "coverage-gap"} key={market}><b>{marketShortTitle(market)}</b>{coverage && coverage.status !== "complete" && <small>{coverage.completeGames}/{coverage.totalGames} POSTED</small>}</span>;
        })}<span>Edge</span></div>
        {days.map((day) => <div className="event-day" key={day}>
          <div className="event-day-label"><b>{day}</b><span>{visibleMatchups.filter((game) => game.day === day).length} games</span></div>
          {visibleMatchups.filter((game) => game.day === day).map((game) => {
            const bookLines = lines.filter((line) => line.gameId === game.id && line.book === book);
            const rowData = [{ team: game.away, totalSide: "Over" }, { team: game.home, totalSide: "Under" }] as const;
            const vig = (["spread", "total", "moneyline"] as const).map((market) => bookmakerMarketVig(lines, game.id, book, market));
            const gameIntel = intelligence?.games.find((item) => item.gameId === game.id);
            const availability = gameIntel?.availability;
            const weather = gameIntel?.weather;
            const materialWeather = Boolean(weather &&
              (weather.status === "current" || weather.status === "stale") &&
              weather.windMph !== null && weather.temperatureF !== null &&
              Math.abs(weather.totalAdjustmentPoints) >= 0.5);
            const projection = gameIntel?.projections.find((item) => item.book === book);
            const totalProjection = gameIntel?.totals.find((item) => item.book === book);
            const projectedTotalLabel = totalProjection ? `TOTAL ${totalProjection.projectedTotal}` : undefined;
            const scorePrediction = projectedTeamScores({
              away: game.away,
              home: game.home,
              projectedHomePoint: projection?.projectedHomePoint ?? null,
              projectedTotal: totalProjection?.projectedTotal ?? null
            });
            const deskOpen = openGame === game.id;
            const propBoard = propBoards[game.id];
            const displayedProps = rankBestExecutionProps(propBoard?.candidates ?? [], structuralConfig.props.maximumPerBook);
            const propsActionable = playerPropBoardIsActionable(propBoard);
            const teaserCandidates = (gameIntel?.teasers.filter((item) => item.book === book && (item.classification !== "ordinary" || (item.fairProbability ?? 0) >= 0.68)) ?? [])
              .sort((left, right) => (left.classification === "classic_wong" ? -1 : 0) - (right.classification === "classic_wong" ? -1 : 0) || (right.fairProbability ?? 0) - (left.fairProbability ?? 0))
              .slice(0, 2);
            const teaserPair = intelligence?.teaserPairs.find((pair) => pair.book === book && pair.legs.some((leg) => leg.gameId === game.id));
            const teaserPairIsWong = Boolean(teaserPair?.legs.every((leg) => leg.classification === "classic_wong"));
            const movement = gameIntel?.movements.find((series) => series.book === book && series.side === game.home);
            const movementOpen = movement?.snapshots[0];
            const movementCurrent = movement?.snapshots.at(-1);
            const allBookRecommendations = (["betmgm", "fanduel"] as const).flatMap((executionBook) => rankMainlineRecommendations({
                gameId: game.id,
                awayTeam: game.away,
                homeTeam: game.home,
                book: executionBook,
                lines,
                spread: gameIntel?.projections.find((item) => item.book === executionBook) ?? null,
                total: gameIntel?.totals.find((item) => item.book === executionBook) ?? null,
                moneyline: gameIntel?.moneylines.find((item) => item.book === executionBook) ?? null,
                preferredTeams
              }));
            const mainlineRecommendations = rankBestBookMainlineRecommendations(allBookRecommendations);
            const currentBookRecommendations = rankBestBookMainlineRecommendations(
              allBookRecommendations.filter((candidate) => candidate.line.book === book)
            );
            const actionableMainlines = mainlineRecommendations.filter((candidate) => candidate.actionable).length;
            const currentBookDecision = currentBookRecommendations.find((candidate) => candidate.actionable) ?? currentBookRecommendations[0] ?? null;
            const decisionUnit = currentBookDecision?.actionable ? currentBookDecision.sizing : null;
            const decisionContext = currentBookDecision
              ? alignMatchupEvidence(gameIntel?.signals ?? [], currentBookDecision.market, currentBookDecision.line.side)
              : null;
            const decisionUncertain = Boolean(decisionUnit?.greyed || decisionContext?.verdict === "contradicts");
            const gamePlays = plays.filter((play) => (play.contract ?? []).some((leg) => leg.gameId === game.id));
            const edgeGoneDraft = gamePlays.some((play) => play.status === "research" && play.forecastSnapshot?.legs.some((leg) => {
              const liveEvaluation = gameIntel?.contractEvaluations.find((item) => item.sourceQuoteId === leg.sourceQuoteId);
              return liveEvaluation?.expectedValue !== null && liveEvaluation?.expectedValue !== undefined && liveEvaluation.expectedValue <= 0;
            }));
            const approvedByGabe = gamePlays.some((play) => play.approvals?.includes("gabe"));
            const approvedByJarrett = gamePlays.some((play) => play.approvals?.includes("jarrett"));
            const evidenceContract = mainlineRecommendations.find((candidate) => candidate.actionable) ?? null;
            const meaningfulSignals = gameIntel?.evidence.status === "current" && evidenceContract
              ? materialEvidenceSignals(gameIntel.signals, evidenceContract.market, evidenceContract.line.side)
              : [];
            const materialMovement = Boolean(movementOpen && movementCurrent && (
              movementOpen.point !== movementCurrent.point || movementOpen.americanPrice !== movementCurrent.americanPrice
            ));
            const materialAvailability = Boolean(availability && availability.status !== "pending" && (
              availability.inactivesConfirmed || availability.out > 0 || availability.questionable > 0 ||
              availability.qbInactive > 0 || availability.qbOutOrDoubtful > 0
            ));
            const materialSentiment = materialCurrentSentiment(
              gameIntel?.sentiment ?? [],
              intelligence?.generatedAt ?? new Date().toISOString()
            );
            return <article className={`event-market ${deskOpen ? "desk-open" : ""} ${edgeGoneDraft ? "edge-gone" : ""}`} key={game.id}>
              <div className="matchup-market-row">
                <div className="matchup-cell">
                  <div className="event-time">
                    <b>{formatKickoff(game)}</b>
                    {game.network && <span>{game.network}</span>}
                    {sundayMode && now && <span className="kickoff-countdown">{compactKickoffCountdown(game.kickoffAt, now)}</span>}
                    {sundayMode && <span className={availability?.inactivesConfirmed ? "pregame-confirmed" : "pregame-pending"}>{availability?.inactivesConfirmed ? "INACTIVES ✓" : "INACTIVES —"}</span>}
                    {sundayMode && <span className={weather?.roof === "unconfirmed" ? "pregame-pending" : "pregame-confirmed"}>{compactRoofStatus(weather?.roof ?? "unconfirmed")}</span>}
                  </div>
                  <div className="team-stack" title={projectedTotalLabel}>
                    {rowData.map((row) => <div className="team-code" key={row.team}>
                      <Image className="team-logo" src={teamLogoPath(row.team)} alt="" width={38} height={38} priority unoptimized aria-hidden="true" />
                      <div className="team-identity"><b>{row.team}</b>{scorePrediction && <span>[{scorePrediction[row.team]}]</span>}</div>
                      {preferredTeams.has(row.team) && <em title="Preferred team">★</em>}
                    </div>)}
                  </div>
                  <div className="game-decision-state" aria-label={`Gabe ${approvedByGabe ? "has" : "has not"} selected; Jarrett ${approvedByJarrett ? "has" : "has not"} selected`}>
                    <i className={approvedByGabe ? "gabe selected" : "gabe"}>G{approvedByGabe ? "✓" : ""}</i>
                    <i className={approvedByJarrett ? "jarrett selected" : "jarrett"}>J{approvedByJarrett ? "✓" : ""}</i>
                  </div>
                </div>
                {(["spread", "total", "moneyline"] as const).map((market) => <div className={`market-pair market-${market}`} key={market}>
                  {rowData.map((row) => {
                    const side = market === "total" ? row.totalSide : row.team;
                    const line = bookLines.find((candidate) => candidate.market === market && candidate.side.toLowerCase() === side.toLowerCase());
                    const active = Boolean(line && slip.some((leg) => leg.id === line.id));
                    const againstPreference = Boolean(line && market !== "total" && [game.away, game.home].some((team) => preferredTeams.has(team) && team !== line.side));
                    const comparable = line ? lines.find((candidate) => candidate.gameId === line.gameId && candidate.book !== line.book && candidate.market === line.market && candidate.side.toLowerCase() === line.side.toLowerCase() && candidate.point === line.point) : null;
                    const bestExactPrice = Boolean(line && comparable && line.americanPrice > comparable.americanPrice);
                    const highlightedBet = Boolean(line && currentBookDecision?.actionable && currentBookDecision.line.id === line.id);
                    return <button className={`price-cell ${active ? "active" : ""} ${againstPreference ? "preference-conflict" : ""} ${bestExactPrice ? "best-exact-price" : ""} ${highlightedBet ? "confidence-bet-cell" : ""}`} style={highlightedBet ? confidenceStyle(currentBookDecision) : undefined} disabled={!line} onClick={() => line && toggleLine(line, `${game.away} @ ${game.home}`)} key={row.team} aria-label={line ? `Select ${lineSelection(line)} at ${formatOdds(line.americanPrice)}` : `${marketTitle(market)} unavailable`}>
                      {line ? <><strong>{market === "moneyline" ? formatOdds(line.americanPrice) : market === "total" ? `${row.totalSide === "Over" ? "O" : "U"} ${line.point}` : formatPoint(line.point)}</strong>{market !== "moneyline" && <span>{formatOdds(line.americanPrice)}</span>}<small>{snapshotAge(line.capturedAt)}</small></> : <strong>—</strong>}
                    </button>;
                  })}
                </div>)}
                <div className={`row-decision confidence-bet ${currentBookDecision?.actionable ? "actionable" : ""}`} style={confidenceStyle(currentBookDecision)}>
                  <div className="decision-readout edge-readout">
                    <span>{currentBookDecision ? lineSelection(currentBookDecision.line) : "NO PLAY"}</span>
                    <b>{edgeLabel(currentBookDecision)}</b>
                    <small>{edgeGoneDraft ? "EDGE GONE · REFRESH" : `${evLabel(currentBookDecision)} EV${decisionUnit?.included ? ` · ${decisionUnit.suggestedUnits}u` : ""}${decisionUncertain ? " · UNCERTAIN" : ""}`}</small>
                  </div>
                  <button onClick={() => toggleDecisionDesk(game.id)} aria-expanded={deskOpen}>{deskOpen ? "CLOSE" : actionableMainlines ? `${actionableMainlines} PICKS` : "ANALYZE"}<span>{deskOpen ? "↑" : "↓"}</span></button>
                  <small className="row-vig">VIG {vig.map((value) => value === null ? "—" : value.toFixed(1)).join(" · ")}</small>
                </div>
              </div>
              {deskOpen && <div className="quick-picks" ref={expandedGameRef}>
                <header className="expanded-desk-head">
                  <div><span>DECISION WINDOW</span><b>{game.away} @ {game.home}</b></div>
                  <small>Only material, timestamped evidence is shown.</small>
                  <button onClick={() => setOpenGame(null)} aria-label={`Close ${game.away} at ${game.home} analysis`}>×</button>
                </header>
                <section className="quick-mainlines">
                  <div className="quick-head"><span>MODEL BETS</span><small>{actionableMainlines ? `${actionableMainlines} best-book ${actionableMainlines === 1 ? "play" : "plays"}` : "Price check"}</small></div>
                  {mainlineRecommendations.length ? mainlineRecommendations.map((candidate) => {
                    // Matchup context explains the contract; it is not added to EV or sizing twice.
                    const context = alignMatchupEvidence(gameIntel?.signals ?? [], candidate.market, candidate.line.side);
                    const contractSignals = gameIntel?.evidence.status === "current"
                      ? materialEvidenceSignals(gameIntel.signals, candidate.market, candidate.line.side, 8, 2)
                      : [];
                    const selectedEvaluation = gameIntel?.contractEvaluations.find((item) => item.sourceQuoteId === candidate.line.id);
                    const alternateEvaluation = gameIntel?.contractEvaluations.find((item) =>
                      item.book !== candidate.line.book && item.market === candidate.market &&
                      item.side.toLowerCase() === candidate.line.side.toLowerCase() && item.expectedValue !== null
                    );
                    const translatedDelta = selectedEvaluation?.translatedAmericanPrice !== null && selectedEvaluation?.translatedAmericanPrice !== undefined &&
                      alternateEvaluation?.translatedAmericanPrice !== null && alternateEvaluation?.translatedAmericanPrice !== undefined &&
                      selectedEvaluation.canonicalPoint === alternateEvaluation.canonicalPoint
                      ? Math.abs(
                          quoteCostCents(selectedEvaluation.translatedAmericanPrice) -
                          quoteCostCents(alternateEvaluation.translatedAmericanPrice)
                        )
                      : null;
                    return <button
                      className={`quick-mainline-recommendation ${candidate.sizing.greyed ? "uncertain" : ""}`}
                      disabled={!candidate.actionable}
                      onClick={() => toggleLine(candidate.line, `${game.away} @ ${game.home}`)}
                      key={candidate.line.id}
                    >
                      <div>
                        <b>{lineSelection(candidate.line)} <strong>{formatOdds(candidate.line.americanPrice)}</strong></b>
                        <small>{bookNames[candidate.line.book]} · {marketTitle(candidate.market)} · FAIR {formatPercent(candidate.line.fairProbability)} · BET {formatPercent(candidate.betProbability)} · BE {formatPercent(candidate.breakEvenProbability)} · {snapshotAge(candidate.line.capturedAt)}</small>
                        <small>{candidate.expectedValue >= 0 ? "+" : ""}{(candidate.expectedValue * 100).toFixed(1)}% EV · 80% {formatInterval(candidate.edgeInterval)} · <span className={`evidence-check ${context.verdict}`} title={evidenceDetail(context)}>{compactEvidenceLabel(context)}</span></small>
                        {alternateEvaluation && <small className="book-compare">
                          VS {bookNames[alternateEvaluation.book]} {alternateEvaluation.market === "moneyline" ? "ML" : alternateEvaluation.market === "total" ? `${alternateEvaluation.side === "Over" ? "O" : "U"} ${alternateEvaluation.point}` : formatPoint(alternateEvaluation.point)} {formatOdds(alternateEvaluation.americanPrice)} · FAIR {formatPercent(alternateEvaluation.fairProbability)} · BET {formatPercent(alternateEvaluation.shrunkProbability)} · {alternateEvaluation.expectedValue! >= 0 ? "+" : ""}{(alternateEvaluation.expectedValue! * 100).toFixed(1)}% EV{translatedDelta === null ? "" : ` · ${translatedDelta.toFixed(1)}¢ translated`} · {snapshotAge(alternateEvaluation.capturedAt)}
                        </small>}
                        {contractSignals.map((signal) => <small className="contract-signal" key={signal.id}>
                          <span>{signal.label} · {signal.lean}</span> {signal.detail} · {signalInterpretation(signal)}
                        </small>)}
                      </div>
                      <em>{candidate.actionable ? `${candidate.sizing.suggestedUnits}u ADD` : candidate.preferenceConflict ? "PASS · TEAM" : "PASS"}</em>
                    </button>;
                  }) : <p>No exact-price model edge at this book.</p>}
                </section>
                <section className="quick-teasers">
                  <div className="quick-head"><span>TEASER VALUE</span><small>{teaserPair ? `BEST PAIR +${(teaserPair.expectedValue * 100).toFixed(1)}%` : teaserCandidates.length ? "BUILD A PAIR" : "NO VIABLE LEG"}</small></div>
                  {teaserPair && <button className={`teaser-pair ${teaserPair.unitsGreyed ? "uncertain" : ""}`} onClick={() => addTeaserPair(teaserPair)}>
                    <span className={`teaser-class ${teaserPairIsWong ? "classic_wong" : "ordinary"}`}>{teaserPairIsWong ? "WONG" : "EV PAIR"}</span>
                    <div><b>{teaserPair.legs.map((leg) => `${leg.team} ${formatPoint(leg.teasedPoint)}`).join(" + ")}</b><small>{bookNames[teaserPair.book]} · SCREEN {formatOdds(teaserPair.screeningAmerican)} · PLAY TO {formatOdds(teaserPair.playToAmerican)}{teaserPair.translationWarning !== "none" ? ` · ${teaserPair.translationWarning}` : ""}</small></div>
                    <em>+{(teaserPair.expectedValue * 100).toFixed(1)}% · {teaserPair.suggestedUnits}u{teaserPair.unitsGreyed ? " · UNCERTAIN" : ""}</em>
                  </button>}
                  {teaserCandidates.length ? teaserCandidates.map((candidate) => {
                    const context = alignMatchupEvidence(gameIntel?.signals ?? [], "teaser", candidate.team);
                    return <button onClick={() => addTeaser(candidate, `${game.away} @ ${game.home}`)} key={`${candidate.book}:${candidate.team}:${candidate.originalPoint}`}>
                      <span className={`teaser-class ${candidate.classification}`}>{candidate.classification === "classic_wong" ? "WONG" : candidate.classification === "key_number" ? "KEY" : "EV"}</span>
                      <div><b>{candidate.team} {formatPoint(candidate.originalPoint)} → {formatPoint(candidate.teasedPoint)}</b><small>{formatPercent(candidate.fairProbability)} fair · {formatPercent(candidate.pushProbability)} push · {candidate.crossedKeys.length ? `crosses ${candidate.crossedKeys.join("/")}` : "no key crossed"}</small></div>
                      <em className={context.verdict} title={evidenceDetail(context)}>{compactEvidenceLabel(context)}</em>
                    </button>;
                  }) : <p>No viable path at this line.</p>}
                </section>
                <section className="quick-props">
                  <div className="quick-head"><span>{displayedProps.length ? propsActionable ? "+EV PROPS" : "LAST GOOD PROPS" : "PROP CHECK"}</span><small>{propsLoading === game.id ? "LOADING" : displayedProps.length ? propsActionable ? `${displayedProps.length} CLEARED` : "STALE · WITHHELD" : propBoard?.status === "stale" ? "STALE" : "GATED"}</small></div>
                  {propsLoading === game.id ? <p>Checking exact same-point prices across books…</p> : displayedProps.length ? displayedProps.map((prop) => <button className={`${prop.unitsGreyed ? "uncertain" : ""} ${propsActionable ? "" : "stale"}`} disabled={!propsActionable} onClick={() => propsActionable && addProp(prop, `${game.away} @ ${game.home}`)} key={prop.id}>
                    <div><b>{prop.player}</b><small>{bookNames[prop.executionBook]} · {prop.side} {prop.point} {propMarketTitle(prop.market)} · {prop.referenceBooks} refs · FAIR {formatPercent(prop.executionFairProbability)} · BET {formatPercent(prop.betProbability)} · {prop.sampleGames ? `L${prop.sampleGames} proj ${prop.projectedValue?.toFixed(1)} · ${((prop.hitRate ?? 0) * 100).toFixed(0)}% hit · ` : ""}floor +{(prop.lowerBoundExpectedValue * 100).toFixed(1)}% · {snapshotAge(prop.capturedAt)}</small></div>
                    <strong>{formatOdds(prop.americanPrice)}</strong><em>+{(prop.expectedValue * 100).toFixed(1)}% · {prop.suggestedUnits}u</em>
                  </button>) : <p>{propBoard?.message ?? "Props are scanned when books post them closer to kickoff."}</p>}
                </section>
                {(meaningfulSignals.length || materialMovement || materialWeather || materialAvailability || materialSentiment.length) && <section className="quick-evidence">
                  {materialMovement && movementOpen && movementCurrent && <div className="movement-mini">
                    <span>OPEN → NOW</span>
                    <SpreadSparkline values={movement?.snapshots.map((snapshot) => snapshot.point) ?? []} />
                    <b>{game.home} {formatPoint(movementOpen.point)} {formatOdds(movementOpen.americanPrice)} → {formatPoint(movementCurrent.point)} {formatOdds(movementCurrent.americanPrice)}</b>
                    {projection && <small>model gap {Math.abs(projection.projectedHomePoint - movementOpen.point).toFixed(1)} → {Math.abs(projection.projectedHomePoint - movementCurrent.point).toFixed(1)} pts</small>}
                  </div>}
                  <div className="evidence-signals">
                    <div className="quick-head"><span>MATCHUP EVIDENCE</span><small>{availability?.status === "current" ? `NFL REPORT ${availability.capturedAt ? snapshotAge(availability.capturedAt) : "LIVE"}` : gameIntel?.evidence.status === "current" ? `NFLVERSE THROUGH ${gameIntel.evidence.throughSeason} W${gameIntel.evidence.throughWeek}` : "EVIDENCE STALE · WITHHELD"}</small></div>
                    {materialWeather && weather && <div className={`weather-inline ${weather.status}`}>
                      <span>WEATHER</span>
                      <b>{Math.round(weather.windMph!)} mph · {Math.round(weather.temperatureF!)}°{weather.precipitationProbability === null ? "" : ` · ${Math.round(weather.precipitationProbability)}% rain`}</b>
                      <em>TOTAL {weather.totalAdjustmentPoints > 0 ? "+" : ""}{weather.totalAdjustmentPoints.toFixed(1)} · {weather.capturedAt ? snapshotAge(weather.capturedAt) : "LIVE"}</em>
                    </div>}
                    {materialAvailability && availability && <div className={`availability-inline ${availability.status}`}>
                      <span>AVAILABILITY</span>
                      <b>{availability.inactivesConfirmed ? `${availability.inactivePlayers} inactive` : `${availability.reportedPlayers} listed · ${availability.out} out · ${availability.questionable} questionable`}</b>
                      <em>{availability.qbInactive ? "QB INACTIVE" : availability.inactivesConfirmed ? "INACTIVES CONFIRMED" : availability.qbOutOrDoubtful ? "QB OUT / DOUBTFUL" : "INACTIVES PENDING"}</em>
                    </div>}
                    {materialSentiment.map((sentiment) => {
                      const reading = interpretMarketSentiment(sentiment);
                      const gap = reading.moneyTicketGap;
                      const conclusion = reading.classification === "possible_sharp_pressure"
                        ? `POSSIBLE SHARP PRESSURE +${gap!.toFixed(0)}PP`
                        : reading.classification === "public_lean"
                          ? "PUBLIC LEAN"
                          : `MONEY LAGS TICKETS ${gap === null || gap >= 0 ? "+" : ""}${gap?.toFixed(0) ?? "—"}PP`;
                      return <div className="sentiment-inline" key={`${sentiment.market}:${sentiment.side}`} title={`Action Network public betting · ${sentiment.sourceUrl}`}>
                        <span>{sentiment.market.toUpperCase()} FLOW</span>
                        <b>{sentiment.side} · {sentiment.ticketsPercent.toFixed(0)}% tickets · {sentiment.moneyPercent === null ? "—" : sentiment.moneyPercent.toFixed(0)}% money · {sentiment.sampleBets.toLocaleString("en-US")} bets</b>
                        <em>{conclusion} · {snapshotAge(sentiment.capturedAt)}</em>
                      </div>;
                    })}
                    <div>{meaningfulSignals.map((signal) => <article key={signal.id}>
                      <span>{signal.label}</span><b>{signal.lean}</b><small>{signal.detail}</small><p>{signalInterpretation(signal)}</p>
                    </article>)}</div>
                  </div>
                </section>}
              </div>}
            </article>;
          })}
        </div>)}
      </section>

      <aside className={`shared-slip ${slipOpen || slip.length ? "open" : "collapsed"}`}>
        <div className="slip-head"><button className="slip-toggle" onClick={() => setSlipOpen((current) => !current)} aria-expanded={slipOpen || slip.length > 0}><span>BET SLIP</span><h2>{slip.length} {slip.length === 1 ? "selection" : "selections"}</h2></button>{slip.length > 0 && <button onClick={() => setSlip([])}>Clear</button>}</div>
        <div className="slip-body">
        <div className="picker-switch" aria-label="Authenticated approver"><button className={`active ${picker}`} disabled>{picker === "gabe" ? "Gabe" : "Jarrett"}</button></div>
        <div className="slip-mode">
          <button className={slipMode === "straight" ? "active" : ""} onClick={() => { setSlipMode("straight"); setSlip((current) => current.filter((leg) => leg.kind !== "teaser")); }}>Straights</button>
          <button className={slipMode === "parlay" ? "active" : ""} onClick={() => { setSlipMode("parlay"); setSlip((current) => { const eligible = current.filter((leg) => leg.kind !== "teaser"); const activeBook = eligible.at(-1)?.book; const normalized = activeBook ? eligible.filter((leg) => leg.book === activeBook) : eligible; if (normalized.length !== eligible.length) setMessage(`Parlay kept ${bookNames[activeBook!]} selections; combined contracts cannot cross books.`); return normalized; }); }}>Parlay</button>
          <button className={slipMode === "teaser" ? "active" : ""} onClick={() => { setSlipMode("teaser"); setSlip((current) => current.filter((leg) => leg.kind === "teaser")); }}>Teaser</button>
        </div>
        {slip.length === 0 ? <div className="empty-slip"><b>Click a line.</b><p>The contract lands here. No typing, no dropdowns.</p></div> : <div className="slip-legs">{slip.map((leg, index) => {
          const sizing = slipMode === "straight" ? straightSizing[index] ?? null : null;
          const preferenceWithheld = preferenceConflicts[index] && (slipMode === "teaser"
            ? !teaserValue || teaserValue.expectedValue < structuralConfig.teasers.preferredOpponentExceptionalEv
            : (leg.edge ?? Number.NEGATIVE_INFINITY) < structuralConfig.monitoring.pushEdgeThreshold);
          const decision = preferenceWithheld ? "PASS · TEAM" : slipMode !== "straight" ? `LEG ${index + 1}` : sizing?.included
            ? `${sizing.suggestedUnits}u READY${sizing.greyed ? " · UNCERTAIN" : ""}`
            : sizing ? "PASS · BELOW 0.5u" : "PASS · MODEL WITHHELD";
          return <article className={preferenceWithheld || slipMode === "straight" && !sizing?.included ? "withheld" : sizing?.greyed ? "uncertain" : ""} key={leg.id}><button onClick={() => setSlip((current) => current.filter((item) => item.id !== leg.id))}>×</button><div><small>{leg.matchup} · {marketTitle(leg.market)}</small><b>{leg.selection}</b><span>{leg.detail} · {leg.kind === "teaser" || leg.edge === null ? "Fair" : "Bet"} {formatPercent(leg.kind === "teaser" ? leg.fairProbability : legBetProbability(leg))}</span></div><strong>{leg.kind === "teaser" ? "6 PT" : formatOdds(leg.americanPrice)}</strong><em>{decision}</em></article>;
        })}</div>}
        {slipMode === "teaser" && <div className="teaser-price"><span>OFFERED 2-TEAM PRICE</span><div>{structuralConfig.teasers.selectableAmericanPrices.map((price) => <button className={teaserPrice === price ? "active" : ""} onClick={() => setTeaserPrice(price)} key={price}>{price}</button>)}</div><small>Confirm the live book price. A teaser is blocked when estimated EV is negative.</small></div>}
        <div className="reason-clicks"><span>WHY</span>{pickReasons.slice(0, 8).map((item) => <button className={reason === item.value ? "active" : ""} onClick={() => setReason(item.value)} key={item.value}>{item.label.replace("Model disagrees with market price", "Model edge").replace("Opponent-adjusted efficiency matchup", "Efficiency").replace("Turnover or scoring regression", "Regression").replace("Personnel or injury advantage", "Personnel").replace("Coaching or scheme matchup", "Scheme").replace("Role clarity / team chemistry", "Chemistry").replace("Better number / key-number value", "Key number").replace("Pace / scoring environment", "Pace")}</button>)}</div>
        <div className="execution-clicks"><span>RECORD AS</span><button className={executionStatus === "paper" ? "active" : ""} onClick={() => setExecutionStatus("paper")}>Paper</button><button className={executionStatus === "executed" ? "active" : ""} onClick={() => setExecutionStatus("executed")}>Cash</button></div>
        <div className="stake-clicks"><span>STAKE</span>{[12.5, 25, 37.5, 50].map((value) => <button className={stake === value ? "active" : ""} onClick={() => setStake(value)} key={value}>{value / 25}u</button>)}</div>
        <div className={`portfolio-meter ${portfolioConflicts.length ? "conflict" : ""}`}>
          <div><span>WEEK CARD</span><b>{portfolio.usedUnits.toFixed(1)} / {structuralConfig.sizing.maximumWeekUnits}u</b></div>
          <div><span>AFTER THIS</span><b>{(portfolio.usedUnits + proposedUnits).toFixed(1)}u</b></div>
          <small>{portfolioConflicts.length ? portfolioConflicts[0].message : `${portfolio.remainingUnits.toFixed(1)}u remains before this slip · ${portfolio.officialPicks} official`}</small>
        </div>
        <div className="value-meter">
          <div><span>BOOK PRICE</span><b>{!slip.length ? "—" : slipMode === "teaser" ? formatOdds(teaserPrice) : slipMode === "straight" ? slip.length === 1 ? formatOdds(slip[0].americanPrice) : "EACH" : slipValue ? formatOdds(combinedAmerican(slip)) : "—"}</b></div>
          <div><span>NO-VIG FAIR</span><b>{slipMode === "teaser" ? teaserValue ? formatOdds(teaserValue.fairAmerican) : "—" : slipMode === "straight" ? slip.length === 1 && slipValue ? formatOdds(slipValue.fairAmerican) : "—" : slipValue ? formatOdds(slipValue.fairAmerican) : "—"}</b></div>
          <div className={`vig-loss ${(slipMode === "teaser" && teaserValue && teaserValue.evPercent >= 0) || (straightEv !== null && straightEv >= 0) ? "positive-value" : ""}`}><span>{slipMode === "teaser" || slipMode === "straight" ? "ESTIMATED EV" : "VALUE LOST"}</span><b>{slipMode === "teaser" ? teaserValue ? `${teaserValue.evPercent >= 0 ? "+" : ""}${teaserValue.evPercent.toFixed(1)}%` : "—" : slipMode === "straight" ? straightEv === null ? "—" : `${straightEv >= 0 ? "+" : ""}${straightEv.toFixed(1)}%` : slipValue ? `${slipValue.vigDragPercent.toFixed(1)}%` : "—"}</b><small>{slipMode === "teaser" ? teaserValue ? `${formatPercent(teaserValue.winProbability)} win · ${formatPercent(teaserValue.pushProbability)} push` : "Add exactly two priced teaser legs from different games" : slipMode === "straight" ? slip.length === 1 ? `${formatPercent(legBetProbability(slip[0]))} shrunk bet probability` : "Multiple straights save as separate picks" : slipValue ? `$${slipValue.lossPerUnitDollars.toFixed(2)} per 1u · latest leg +${slipValue.incrementalDragPercent.toFixed(1)}pp` : slip.length > 1 ? "Same-game or incomplete pair: withheld" : "Add a priced leg"}</small></div>
        </div>
        <button className="save-slip" disabled={!slipCanApprove} onClick={saveSlip}>Approve team card</button>
        <p className="slip-message" aria-live="polite">{message}</p>
        {!preferenceGateCleared && <p className="preference-note">SEA / ATL GATE · {slipMode === "teaser" ? `needs +${(structuralConfig.teasers.preferredOpponentExceptionalEv * 100).toFixed(0)}% combined EV` : `needs +${(structuralConfig.monitoring.pushEdgeThreshold * 100).toFixed(1)}pp edge`}</p>}
        <p className="value-note">Estimated value only. Approval never places a wager.</p>
        </div>
      </aside>
    </div>

    <section className="compact-shared-card">
      <div><span>TEAM CARD</span><h2>{officialPlays.length ? `${officialPlays.length} official` : plays.length ? `${plays.length} awaiting` : "Empty"}</h2><small>{portfolio.remainingUnits.toFixed(1)}u left this week</small></div>
      {plays.slice(-6).map((play) => {
        const awaitingMe = !isTeamApproved(play.approvals) && !play.approvals?.includes(picker);
        return <article key={play.id}>
          <b>{play.title}</b>
          <small className="contract-preview">{play.legs}</small>
          <div className="card-approval-row">
            <span className={isTeamApproved(play.approvals) ? "team-approved" : "team-awaiting"}>{play.approvals?.includes("gabe") ? "G✓" : "G—"} · {play.approvals?.includes("jarrett") ? "J✓" : "J—"}</span>
            {awaitingMe && <button onClick={() => approvePending(play)}>{play.executionStatus === "executed" ? "Cash placed + approve" : "Approve"}</button>}
          </div>
          <small>{play.executionStatus === "executed" ? "CASH" : "PAPER"} · {play.book} {formatOdds(play.americanOdds)} · ${(play.stakeCents / 100).toFixed(0)}</small>
        </article>;
      })}
      <Link href="/records">Season record →</Link>
    </section>
  </div>;
}
