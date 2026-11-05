export async function fetchWeatherHint(): Promise<string | null> {
  const latitude = process.env.WEATHER_LATITUDE;
  const longitude = process.env.WEATHER_LONGITUDE;
  if (!latitude || !longitude) return null;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude);
    url.searchParams.set("longitude", longitude);
    url.searchParams.set("current", "temperature_2m,precipitation");
    const response = await fetch(url, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { current?: { temperature_2m?: number; precipitation?: number } };
    const temperature = payload.current?.temperature_2m;
    if (typeof temperature !== "number") return null;
    return temperature < 12 ? "天气偏冷，可优先考虑热食" : null;
  } catch {
    return null;
  }
}
