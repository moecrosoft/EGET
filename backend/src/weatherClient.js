const NOWCAST_URL = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast";

let cache = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;

/**
 * Singapore-wide 2-hour nowcast, no API key required. Returns the first
 * forecast area's reading as a general "is it raining somewhere nearby"
 * signal — ponytail: not matched to the commuter's actual station, upgrade
 * to area-matching (like ps2-arjun's Punggol-specific lookup) if a route
 * feature ever needs per-station weather.
 */
export async function getWeather() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  try {
    const res = await fetch(NOWCAST_URL);
    if (!res.ok) throw new Error(`weather nowcast failed: ${res.status}`);
    const data = await res.json();
    const forecast = data?.data?.items?.[0]?.forecasts?.[0]?.forecast ?? "Unknown";
    const rainy = /rain|shower|thunder/i.test(forecast);
    cache = { nowcast: forecast, rainExpectedWithinMinutes: rainy ? 15 : null };
    cacheAt = Date.now();
    return cache;
  } catch (err) {
    console.error("[weatherClient] nowcast fetch failed:", err.message);
    return { nowcast: "Unknown", rainExpectedWithinMinutes: null };
  }
}
