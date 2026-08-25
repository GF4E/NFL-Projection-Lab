export type MaintenanceStage<T> =
  | { status: "completed"; result: T }
  | { status: "failed"; error: string };

export interface BackgroundMaintenanceTasks {
  pregame(): Promise<unknown>;
  odds(): Promise<unknown>;
  weather(): Promise<unknown>;
  injuries(): Promise<unknown>;
  nflverse(): Promise<unknown>;
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
  const [odds, weather, injuries, nflverse] = await Promise.all([
    stage("scheduled odds", tasks.odds),
    stage("kickoff weather", tasks.weather),
    stage("official injuries", tasks.injuries),
    stage("nflverse importer", tasks.nflverse)
  ]);
  return { checkedAt, pregame, odds, weather, injuries, nflverse };
}
