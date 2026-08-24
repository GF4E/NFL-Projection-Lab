import { z } from "zod";
import type { WeatherInput } from "@/domain/types";
import { validateKickoffWeather } from "@/domain/weather";

const responseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    precipitation_probability: z.array(z.number()),
    wind_speed_10m: z.array(z.number())
  })
});

export async function fetchKickoffWeather(input: {
  gameId: string;
  stadium: string;
  latitude: number;
  longitude: number;
  roof: WeatherInput["roof"];
  kickoffAt: string;
  fetcher?: typeof fetch;
}): Promise<WeatherInput> {
  if (input.roof === "closed" || input.roof === "fixed") {
    return validateKickoffWeather({
      gameId: input.gameId,
      stadium: input.stadium,
      roof: input.roof,
      kickoffAt: input.kickoffAt,
      forecastIssuedAt: new Date().toISOString(),
      validAt: input.kickoffAt,
      windMph: null,
      temperatureF: null,
      precipitationProbability: null
    });
  }
  const kickoff = new Date(input.kickoffAt);
  const date = kickoff.toISOString().slice(0, 10);
  const query = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "UTC",
    start_date: date,
    end_date: date
  });
  const response = await (input.fetcher ?? fetch)(`https://api.open-meteo.com/v1/forecast?${query}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Weather import failed with HTTP ${response.status}`);
  const payload = responseSchema.parse(await response.json());
  const kickoffHour = input.kickoffAt.slice(0, 13);
  const index = payload.hourly.time.findIndex((time) => time.slice(0, 13) === kickoffHour);
  if (index < 0) throw new Error("Open-Meteo response does not contain the stadium kickoff hour");
  return validateKickoffWeather({
    gameId: input.gameId,
    stadium: input.stadium,
    roof: input.roof,
    kickoffAt: input.kickoffAt,
    forecastIssuedAt: new Date(response.headers.get("date") ?? Date.now()).toISOString(),
    validAt: `${payload.hourly.time[index]}:00Z`,
    windMph: payload.hourly.wind_speed_10m[index],
    temperatureF: payload.hourly.temperature_2m[index],
    precipitationProbability: payload.hourly.precipitation_probability[index]
  });
}
