import { structuralConfig } from "./config";

export function playerPropBoardMessage(input: {
  quotes: number;
  freshQuotes: number;
  availabilityConfirmed: boolean;
  candidates: number;
  evidence: number;
  stateMessage: string | null;
}): string {
  if (input.quotes > 0 && input.freshQuotes === 0) {
    return `Prop prices are older than ${structuralConfig.props.maximumQuoteAgeMinutes} minutes; suggestions are withheld until a fresh scan`;
  }
  if (input.quotes === 0) return input.stateMessage ?? "Props have not been scanned for this game yet";
  if (!input.availabilityConfirmed) return "Prices are posted; official inactives are still pending, so prop suggestions are withheld";
  if (input.candidates > 0) return `Market, player-history and availability gates cleared · ${input.stateMessage ?? "cached prices"}`;
  return input.evidence > 0
    ? "No prop cleared the exact-price, player-history and worst-case EV gates"
    : "Player-history baseline is not ready; market-only prop signals are withheld";
}
