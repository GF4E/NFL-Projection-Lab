import stadiumConfigJson from "../../config/stadiums.config.json";
import type { WeatherInput } from "./types";

type Roof = WeatherInput["roof"];

interface VenueConfig {
  latitude: number;
  longitude: number;
  defaultRoof: Roof;
}

interface StadiumConfig {
  version: string;
  season: number;
  sourceLinks: string[];
  venues: Record<string, VenueConfig>;
}

export const stadiumConfig = stadiumConfigJson as StadiumConfig;

export function resolveVenue(stadium: string | null): VenueConfig | null {
  if (!stadium) return null;
  return stadiumConfig.venues[stadium] ?? null;
}

export function normalizeRoof(rawRoof: string | null, fallback: Roof): Roof {
  const roof = rawRoof?.trim().toLowerCase();
  if (roof === "outdoors" || roof === "outdoor") return "outdoor";
  if (roof === "open") return "open";
  if (roof === "closed") return "closed";
  if (roof === "dome" || roof === "fixed") return "fixed";
  return fallback;
}
