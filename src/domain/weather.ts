import type { WeatherInput } from "./types";

export function validateKickoffWeather(input: WeatherInput): WeatherInput {
  if (input.roof === "closed" || input.roof === "fixed") {
    return {
      ...input,
      windMph: null,
      temperatureF: null,
      precipitationProbability: null
    };
  }
  if (input.roof === "unconfirmed") {
    throw new Error("Roof status must be confirmed before weather enters the forecast");
  }
  const validDelta = Math.abs(
    new Date(input.validAt).getTime() - new Date(input.kickoffAt).getTime()
  );
  if (validDelta > 60 * 60 * 1000) {
    throw new Error("Weather must be valid for the stadium kickoff hour");
  }
  return input;
}
