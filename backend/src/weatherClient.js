const NOWCAST_URL = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast";
const RAINFALL_URL = "https://api-open.data.gov.sg/v2/real-time/api/rainfall";

// Arjun's persona route starts in Punggol — matches ps2-arjun's parsing.py
// (is_weather_ok_for_cycling's default area, station S81 "Punggol Central",
// verified near-identical coordinates to Punggol MRT).
const AREA = "Punggol";
const RAINFALL_STATION_ID = "S81";

let cache = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;

/**
 * Real Singapore weather for Punggol: the 2hr nowcast (area-matched, not
 * just "whichever area happens to be first") plus real-time rainfall at the
 * nearest station — a live reading is a much stronger "is it actually
 * raining" signal than forecast text alone (forecast can say "cloudy" while
 * it's already raining, or "showers" while the window hasn't started yet).
 *
 * The free 2hr forecast only gives a ~2hr validity block (e.g. "4.30am to
 * 6.30am"), not a precise "rain starts at HH:MM" — no public API offers
 * that at station precision. So rainExpectedWithinMinutes stays a rough
 * urgency number (0 once real-time rain is actually detected, else a flat
 * estimate when the forecast text is rainy but it hasn't started yet) —
 * upgrade path: a paid nowcasting API if minute-level lead time is ever
 * needed.
 */
export async function getWeather() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  try {
    const [forecastRes, rainfallRes] = await Promise.all([fetch(NOWCAST_URL), fetch(RAINFALL_URL)]);
    if (!forecastRes.ok) throw new Error(`weather nowcast failed: ${forecastRes.status}`);
    const forecastData = await forecastRes.json();
    const item = forecastData?.data?.items?.[0];
    const areaForecast = item?.forecasts?.find((f) => f.area === AREA)?.forecast ?? item?.forecasts?.[0]?.forecast ?? "Unknown";
    const forecastRainy = /rain|shower|thunder/i.test(areaForecast);

    let rainNowMm = null;
    if (rainfallRes.ok) {
      const rainfallData = await rainfallRes.json();
      const readings = rainfallData?.data?.readings || [];
      const latest = readings[readings.length - 1];
      rainNowMm = latest?.data?.find((r) => r.stationId === RAINFALL_STATION_ID)?.value ?? null;
    }
    const isRainingNow = rainNowMm != null && rainNowMm > 0;

    cache = {
      nowcast: areaForecast,
      isRainingNow,
      rainNowMm,
      forecastValidTo: item?.valid_period?.end ?? null,
      rainExpectedWithinMinutes: isRainingNow ? 0 : forecastRainy ? 15 : null,
    };
    cacheAt = Date.now();
    return cache;
  } catch (err) {
    console.error("[weatherClient] weather fetch failed:", err.message);
    return { nowcast: "Unknown", isRainingNow: false, rainNowMm: null, forecastValidTo: null, rainExpectedWithinMinutes: null };
  }
}
