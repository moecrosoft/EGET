import {
  LINE_NAMES,
  getMockTrainAlerts,
  getMockBusArrivals,
  getMockStationStatus,
  ALTERNATE_ROUTE_HINTS,
  MOCK_BUS_STOPS,
  MRT_STATIONS,
} from "./mockData.js";
import { normalizeLine } from "./lineCodes.js";

const BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";

function hasRealKey() {
  return Boolean(process.env.LTA_ACCOUNT_KEY);
}

async function ltaFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      AccountKey: process.env.LTA_ACCOUNT_KEY,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`LTA DataMall request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Returns an array of normalized train alert objects, whether from the real
 * TrainServiceAlerts endpoint or from mock data. Falls back to mock data
 * automatically on any live-API error so a demo never hard-fails.
 */
export async function getTrainAlerts() {
  if (!hasRealKey()) return { source: "mock", alerts: getMockTrainAlerts() };

  try {
    const data = await ltaFetch("/TrainServiceAlerts");
    const value = data?.value;
    if (!value || value.Status === 1) {
      // Status 1 = normal service, no active disruptions
      return { source: "live", alerts: [] };
    }
    const alerts = (value.AffectedSegments || []).map((seg) => {
      const line = normalizeLine(seg.Line);
      return {
      line,
      lineName: LINE_NAMES[line] || line,
      status: "disrupted",
      severity: "unknown",
      direction: seg.Direction || null,
      affectedStations: (seg.Stations || "").split(",").map((s) => s.trim()).filter(Boolean),
      message: value.Message?.[0]?.Content || "Service disruption reported.",
      freeBusBridging: seg.FreeBus === "1" || seg.FreeBus === 1,
      freeShuttle: seg.FreeMRT === "1" || seg.FreeMRT === 1,
      updatedAt: value.Message?.[0]?.CreatedDate || new Date().toISOString(),
      };
    });
    return { source: "live", alerts };
  } catch (err) {
    console.error("[ltaClient] live train alerts failed, using mock:", err.message);
    return { source: "mock-fallback", alerts: getMockTrainAlerts() };
  }
}

/**
 * Real-time road incidents (accidents, breakdowns, roadworks) island-wide,
 * each with a lat/lng — used to check whether one falls on a bus leg's path
 * during nav, so we can prompt a swap. No mock fallback: without a real key
 * there's nothing meaningful to show, so it's just an empty list.
 */
export async function getTrafficIncidents() {
  if (!hasRealKey()) return { source: "mock", incidents: [] };
  try {
    const data = await ltaFetch("/TrafficIncidents");
    const incidents = (data.value || []).map((i) => ({
      type: i.Type,
      message: i.Message,
      latitude: i.Latitude,
      longitude: i.Longitude,
    }));
    return { source: "live", incidents };
  } catch (err) {
    console.error("[ltaClient] traffic incidents failed:", err.message);
    return { source: "mock-fallback", incidents: [] };
  }
}

export async function getBusArrivals(busStopCode) {
  if (!hasRealKey()) return { source: "mock", ...getMockBusArrivals(busStopCode) };

  try {
    const data = await ltaFetch(`/v3/BusArrival?BusStopCode=${encodeURIComponent(busStopCode)}`);
    let services = (data.Services || []).map((svc) => {
      const toMins = (iso) =>
        iso ? Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000)) : null;
      return {
        serviceNo: svc.ServiceNo,
        nextArrivalMins: toMins(svc.NextBus?.EstimatedArrival),
        nextArrival2Mins: toMins(svc.NextBus2?.EstimatedArrival),
        load: svc.NextBus?.Load || "unknown",
      };
    });

    // BusArrival is a live feed and can come back empty for a stop that
    // genuinely has scheduled services (data gap, off-hours, bus not yet
    // dispatched) — fall back to the static BusRoutes schedule so the stop
    // still shows which services stop there, just without a live ETA.
    if (services.length === 0) {
      const routes = await fetchAllBusRoutes();
      const scheduledServiceNos = [...new Set(routes.filter((r) => r.BusStopCode === busStopCode).map((r) => r.ServiceNo))];
      services = scheduledServiceNos.map((serviceNo) => ({
        serviceNo,
        nextArrivalMins: null,
        nextArrival2Mins: null,
        load: "unknown",
      }));
    }

    return {
      source: "live",
      busStopCode,
      description: data.BusStopCode ? `Stop ${data.BusStopCode}` : "Unknown stop",
      services,
    };
  } catch (err) {
    console.error("[ltaClient] live bus arrivals failed, using mock:", err.message);
    return { source: "mock-fallback", ...getMockBusArrivals(busStopCode) };
  }
}

/**
 * Alternate-route suggestions. There's no single official "give me an
 * alternate route" LTA endpoint, so this combines whatever active
 * disruptions exist with a small hint table. In a longer build this is the
 * natural place to call the OneMap routing API instead.
 */
export async function getAlternateRoutes({ from, to }) {
  const { alerts } = await getTrainAlerts();
  const relevant = alerts.filter((a) => a.status === "disrupted");
  const hints = ALTERNATE_ROUTE_HINTS.filter((h) =>
    relevant.some((a) => a.line === h.disruptedLine)
  );
  return {
    from,
    to,
    activeDisruptionsConsidered: relevant.map((a) => `${a.line}: ${a.message}`),
    suggestions: hints.length
      ? hints.map((h) => h.suggestion)
      : ["No active disruptions affecting known routes — the direct route should be fine."],
  };
}

export async function getStationStatus(stationName) {
  // Real crowd-density API exists (PCDRealTime) but needs per-line polling;
  // mock is used here for both modes to keep the one-day scope tight.
  return getMockStationStatus(stationName);
}

/**
 * PCDForecast — 30-min crowd buckets for one line, at one station. Real
 * shape (verified against a live call): value[] is one entry per day, each
 * with a Stations[] list, each station carrying its own Interval[] of
 * { Start, CrowdLevel }. `trainLineCode` must be the crowd-density code
 * (e.g. "PLRT"), which differs from TrainServiceAlerts' code (e.g. "PTL")
 * for the same physical line — see lineCodes.js.
 */
export async function getStationCrowdForecast(trainLineCode, stationCode) {
  if (!hasRealKey()) return [];
  try {
    const data = await ltaFetch(`/PCDForecast?TrainLine=${trainLineCode}`);
    const dayRecord = (data?.value ?? [])[0];
    const station =
      dayRecord?.Stations?.find((s) => s.Station === stationCode) ?? dayRecord?.Stations?.[0];
    return (station?.Interval ?? []).map((entry) => ({
      time: entry.Start.slice(11, 16), // "HH:MM" — sliced directly from the +08:00 SGT string
      crowdLevel: String(entry.CrowdLevel).toLowerCase(),
    }));
  } catch {
    // Already degrades gracefully (empty forecast, no crash) — quota/rate
    // limit failures on this endpoint are common enough not to warrant an
    // alarming console.error for something the app already handles fine.
    return [];
  }
}

// LTA's own documented PCDForecast/PCDRealTime `TrainLine` enum. Only
// "PLRT" has ever actually been verified against a live response in this
// codebase (see journeyPlanner.js) — these six are from LTA's published API
// docs, not independently confirmed live, since the account's PCDForecast
// quota has been exhausted for the rest of this session. Small, stable
// enum (11 values total), unlike individual per-station codes, which this
// deliberately avoids needing at all.
export const CROWD_LINE_CODE = { NS: "NSL", EW: "EWL", CG: "CGL", NE: "NEL", CC: "CCL", CE: "CEL", DT: "DTL", TE: "TEL" };

/**
 * Average crowd level across every station on a line, per forecast time
 * bucket — a coarser signal than per-station (PCDForecast's response
 * already groups by station; this collapses that back down), but it avoids
 * needing a name-to-station-code lookup for whichever specific station a
 * route happens to pass through. Real data, not simulated — just
 * line-level instead of stop-level.
 */
export async function getLineCrowdTrend(trainLineCode) {
  if (!hasRealKey()) return [];
  try {
    const data = await ltaFetch(`/PCDForecast?TrainLine=${trainLineCode}`);
    const stations = (data?.value ?? [])[0]?.Stations ?? [];
    if (!stations.length) return [];
    const SCORE = { l: 1, m: 2, h: 3 };
    const byTime = new Map();
    for (const station of stations) {
      for (const entry of station.Interval ?? []) {
        const time = entry.Start.slice(11, 16);
        const score = SCORE[String(entry.CrowdLevel).toLowerCase()] ?? 2;
        if (!byTime.has(time)) byTime.set(time, []);
        byTime.get(time).push(score);
      }
    }
    return [...byTime.entries()]
      .map(([time, scores]) => ({ time, avgScore: scores.reduce((a, b) => a + b, 0) / scores.length }))
      .sort((a, b) => a.time.localeCompare(b.time));
  } catch {
    return [];
  }
}

export function getAllStations() {
  return MRT_STATIONS;
}

export function findStationByName(name) {
  const needle = name.trim().toLowerCase();
  return MRT_STATIONS.find((s) => s.name.toLowerCase() === needle) || null;
}

export function searchStations(text, limit = 5) {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return MRT_STATIONS.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, limit);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearest(points, lat, lng, limit) {
  return points
    .map((p) => ({ ...p, distanceKm: haversineKm(lat, lng, p.latitude, p.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

// Cached for the process lifetime — LTA's own BusStops dataset changes rarely
// enough that re-fetching all ~5000 stops on every request would just waste
// quota. Upgrade path: refresh on a long interval if stops ever go stale.
let busStopsCache = null;

async function fetchAllBusStops() {
  if (busStopsCache) return busStopsCache;
  const stops = [];
  for (let skip = 0; ; skip += 500) {
    const data = await ltaFetch(`/BusStops?$skip=${skip}`);
    const page = data.value || [];
    stops.push(
      ...page.map((s) => ({
        busStopCode: s.BusStopCode,
        description: s.Description,
        latitude: s.Latitude,
        longitude: s.Longitude,
      }))
    );
    if (page.length < 500) break;
  }
  busStopsCache = stops;
  return stops;
}

// Cached like fetchAllBusStops — BusRoutes rarely changes, so pay the ~30
// paged calls once per process lifetime rather than per request.
let busRoutesCache = null;

async function fetchAllBusRoutes() {
  if (busRoutesCache) return busRoutesCache;
  const routes = [];
  for (let skip = 0; ; skip += 500) {
    const data = await ltaFetch(`/BusRoutes?$skip=${skip}`);
    const page = data.value || [];
    routes.push(...page);
    if (page.length < 500) break;
  }
  busRoutesCache = routes;
  return routes;
}

/**
 * All stops for one bus service, in sequence. Most services only run one
 * direction; a handful loop and have two (LTA's Direction field, 1 or 2).
 * Defaults to the lowest-numbered direction; pass `direction` to request
 * the other one. availableDirections lets the caller know whether a
 * direction toggle is even worth showing.
 */
export async function getBusRouteStops(serviceNo, direction = null) {
  if (!hasRealKey()) return { source: "mock", serviceNo, direction: null, availableDirections: [], stops: [] };
  try {
    const [routes, stops] = await Promise.all([fetchAllBusRoutes(), fetchAllBusStops()]);
    const stopMap = new Map(stops.map((s) => [s.busStopCode, s]));
    const serviceRoutes = routes.filter((r) => r.ServiceNo === serviceNo);
    const availableDirections = [...new Set(serviceRoutes.map((r) => r.Direction))].sort((a, b) => a - b);
    const resolvedDirection = availableDirections.includes(direction) ? direction : Math.min(...availableDirections);
    const sequence = serviceRoutes
      .filter((r) => r.Direction === resolvedDirection)
      .sort((a, b) => a.StopSequence - b.StopSequence)
      .map((r) => {
        const info = stopMap.get(r.BusStopCode);
        return {
          busStopCode: r.BusStopCode,
          sequence: r.StopSequence,
          description: info?.description || "Unknown stop",
          latitude: info?.latitude ?? null,
          longitude: info?.longitude ?? null,
        };
      });
    return { source: "live", serviceNo, direction: resolvedDirection, availableDirections, stops: sequence };
  } catch (err) {
    console.error("[ltaClient] bus route stops failed:", err.message);
    return { source: "mock-fallback", serviceNo, direction: null, availableDirections: [], stops: [] };
  }
}

export async function getNearbyStations(lat, lng, limit = 5) {
  return { source: "static-reference", stations: nearest(MRT_STATIONS, lat, lng, limit) };
}

export async function getNearbyBusStops(lat, lng, limit = 5) {
  let stops;
  let source = "live";
  try {
    if (!hasRealKey()) throw new Error("no LTA_ACCOUNT_KEY set");
    stops = nearest(await fetchAllBusStops(), lat, lng, limit);
  } catch (err) {
    if (hasRealKey()) console.error("[ltaClient] live bus stops failed, using mock:", err.message);
    source = hasRealKey() ? "mock-fallback" : "mock";
    stops = nearest(MOCK_BUS_STOPS, lat, lng, limit);
  }

  const withArrivals = await Promise.all(
    stops.map(async (stop) => {
      const arrivals = await getBusArrivals(stop.busStopCode);
      return { ...stop, services: arrivals.services };
    })
  );
  return { source, busStops: withArrivals };
}
