import { z } from "zod";
import { normalizeOfficialInjuries } from "@/domain/injuries";
import type { NormalizedInjury } from "@/domain/types";

const rowSchema = z.object({
  player: z.string().min(1),
  team: z.string().min(2),
  gameId: z.string().min(1),
  practiceStatus: z.string().nullable().optional(),
  gameStatus: z.string().nullable().optional(),
  inactive: z.boolean().nullable().optional()
});

export async function fetchOfficialInjuries(input: {
  endpoint: string;
  expectedTeams: string[];
  fetcher?: typeof fetch;
}): Promise<NormalizedInjury[]> {
  const response = await (input.fetcher ?? fetch)(input.endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Official injury import failed with HTTP ${response.status}`);
  const rows = z.array(rowSchema).min(1).parse(await response.json());
  const sourceTimestamp = new Date(response.headers.get("last-modified") ?? response.headers.get("date") ?? Date.now()).toISOString();
  return normalizeOfficialInjuries(rows, input.endpoint, sourceTimestamp, input.expectedTeams);
}
