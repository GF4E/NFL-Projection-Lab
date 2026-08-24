import { describe, expect, it } from "vitest";
import { normalizeRoof, resolveVenue, stadiumConfig } from "@/domain/stadiums";
import { fitWeatherTotalAdjustment, type HistoricalWeatherGame } from "@/domain/weather-model";
import { fetchKickoffWeather } from "@/server/providers/open-meteo";
import { weatherRefreshIntervalMs } from "@/server/weather/automation";

describe("automatic kickoff weather", () => {
  it("covers every 2026 venue with a versioned coordinate and roof fallback", () => {
    expect(stadiumConfig.season).toBe(2026);
    expect(Object.keys(stadiumConfig.venues)).toHaveLength(38);
    expect(resolveVenue("Lumen Field")).toMatchObject({ defaultRoof: "outdoor" });
    expect(resolveVenue("Missing Stadium")).toBeNull();
    expect(normalizeRoof("outdoors", "unconfirmed")).toBe("outdoor");
    expect(normalizeRoof("dome", "outdoor")).toBe("fixed");
    expect(normalizeRoof(null, "unconfirmed")).toBe("unconfirmed");
  });

  it("selects the stadium kickoff hour from the full 16-day Open-Meteo horizon", async () => {
    let requested = "";
    const fetcher: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({
        hourly: {
          time: ["2026-09-13T19:00", "2026-09-13T20:00", "2026-09-13T21:00"],
          temperature_2m: [61, 60, 59],
          precipitation_probability: [10, 20, 30],
          wind_speed_10m: [9, 13, 15]
        }
      }), { status: 200, headers: { date: "Sun, 13 Sep 2026 12:00:00 GMT" } });
    };
    const weather = await fetchKickoffWeather({
      gameId: "ne-sea",
      stadium: "Lumen Field",
      latitude: 47.5952,
      longitude: -122.3316,
      roof: "outdoor",
      kickoffAt: "2026-09-13T20:05:00.000Z",
      fetcher
    });
    expect(requested).toContain("start_date=2026-09-13");
    expect(requested).toContain("end_date=2026-09-13");
    expect(weather).toMatchObject({ windMph: 13, temperatureF: 60, precipitationProbability: 20 });
    expect(weather.validAt).toBe("2026-09-13T20:00:00Z");
  });

  it("learns the total adjustment from historical outdoor residuals and ignores indoor games", () => {
    const rows: HistoricalWeatherGame[] = Array.from({ length: 320 }, (_, index) => {
      const windMph = index % 20;
      const temperatureF = 40 + (index * 7) % 40;
      return {
        season: 2022 + (index % 4),
        total: 44 - 0.22 * (windMph - 9.5) + 0.04 * (temperatureF - 59.5),
        totalLine: 44,
        roof: "outdoors",
        windMph,
        temperatureF
      };
    });
    rows.push(...Array.from({ length: 200 }, (_, index) => ({
      season: 2025,
      total: 80,
      totalLine: 40,
      roof: "dome",
      windMph: index % 20,
      temperatureF: 70
    })));
    const calm = fitWeatherTotalAdjustment(rows, { windMph: 2, temperatureF: 60 }, 2026, 2.5);
    const windy = fitWeatherTotalAdjustment(rows, { windMph: 19, temperatureF: 60 }, 2026, 2.5);
    expect(calm).not.toBeNull();
    expect(windy).not.toBeNull();
    expect(windy!.points).toBeLessThan(calm!.points);
    expect(windy!.trainingGames).toBe(320);
  });

  it("refreshes more often as kickoff approaches without polling every cron tick", () => {
    expect(weatherRefreshIntervalMs(72 * 60 * 60_000)).toBe(24 * 60 * 60_000);
    expect(weatherRefreshIntervalMs(24 * 60 * 60_000)).toBe(6 * 60 * 60_000);
    expect(weatherRefreshIntervalMs(2 * 60 * 60_000)).toBe(60 * 60_000);
  });
});
