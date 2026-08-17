export type MaintenanceStage<T> =
  | { status: "completed"; result: T }
  | { status: "failed"; error: string };

export interface BackgroundMaintenanceTasks {
  pregame(): Promise<unknown>;
  odds(): Promise<unknown>;
  weather(): Promise<unknown>;
  injuries(): Promise<unknown>;
  nflverse(): Promise<unknown>;
  sentiment(): Promise<unknown>;
  drafts(): Promise<unknown>;
  lifecycle?(): Promise<unknown>;
  settlement(): Promise<unknown>;
}

async function stage<T>(label: string, task: () => Promise<T>): Promise<MaintenanceStage<T>> {
  try {
    return { status: "completed", result: await task() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    return { status: "failed", error: `${label}: ${message}` };
  }
}

export async function orchestrateBackgroundMaintenance(
  tasks: BackgroundMaintenanceTasks,
  checkedAt: string
) {
  const pregame = await stage("official pregame context", tasks.pregame);
  const [odds, weather, injuries, nflverse, sentiment, drafts] = await Promise.all([
    stage("scheduled odds", tasks.odds),
    stage("kickoff weather", tasks.weather),
    stage("official injuries", tasks.injuries),
    stage("nflverse importer", tasks.nflverse),
    stage("market sentiment", tasks.sentiment),
    stage("draft expiry", tasks.drafts)
  ]);
  const [lifecycle, settlement] = await Promise.all([
    tasks.lifecycle
      ? stage("model lifecycle", tasks.lifecycle)
      : Promise.resolve({ status: "completed" as const, result: { status: "delegated" as const } }),
    stage("automatic settlement", tasks.settlement)
  ]);
  return { checkedAt, pregame, odds, weather, injuries, nflverse, sentiment, drafts, lifecycle, settlement };
}

export type MaintenanceLane = "routine" | "lifecycle";

/**
 * The five-minute production trigger gives coefficient work an isolated worker
 * invocation at the two Tuesday lifecycle boundaries. All other ticks remain on
 * the routine import/snapshot/settlement lane.
 */
export function scheduledMaintenanceLane(now: Date): MaintenanceLane {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const lifecycleBoundary = parts.weekday === "Tue" && (
    Number(parts.hour) === 6 && Number(parts.minute) === 30 ||
    Number(parts.hour) === 7 && Number(parts.minute) === 0
  );
  return lifecycleBoundary ? "lifecycle" : "routine";
}
