// OneMap routing API client. Free registration, no self-hosted OSRM needed.
// Docs: https://www.onemap.gov.sg/apidocs/routing

const BASE = "https://www.onemap.gov.sg/api/public/routingsvc/route";

function toLatLng(point) {
  return `${point.lat},${point.lng}`;
}

/**
 * Decodes a Google-style encoded polyline (precision 5) into [lat, lng] pairs.
 * Both OneMap's route_geometry (walk/cycle/drive) and its pt legGeometry.points
 * use this encoding. No library needed for ~20 lines of well-known math.
 */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let result = 0, shift = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

async function callOneMap(params) {
  const url = `${BASE}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: { Authorization: process.env.ONEMAP_TOKEN } });
  if (!res.ok) throw new Error(`OneMap routing failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** routeType "walk" or "cycle" — single-leg point-to-point routing. */
export async function getWalkCycleRoute(start, end, routeType) {
  const data = await callOneMap({ start: toLatLng(start), end: toLatLng(end), routeType });
  return {
    totalTimeSeconds: data.route_summary.total_time,
    totalDistanceMeters: data.route_summary.total_distance,
    coordinates: decodePolyline(data.route_geometry),
  };
}

/**
 * routeType "pt" — public transport itinerary. `mode` is "TRANSIT", "BUS" or
 * "RAIL". Returns the first (best) itinerary, normalized to a flat leg list
 * with decoded geometry, or null if no route was found.
 */
export async function getPtRoute(start, end, { mode, date, time, maxWalkDistance = 1000 }) {
  let data;
  try {
    data = await callOneMap({
      start: toLatLng(start),
      end: toLatLng(end),
      routeType: "pt",
      mode,
      date,
      time,
      maxWalkDistance: String(maxWalkDistance),
      numItineraries: "1",
    });
  } catch (err) {
    console.error(`[onemapClient] pt route (${mode}) failed:`, err.message);
    return null;
  }

  const itinerary = data?.plan?.itineraries?.[0];
  if (!itinerary) return null;

  return {
    totalTimeSeconds: itinerary.duration,
    transfers: itinerary.transfers,
    walkDistanceMeters: itinerary.walkDistance,
    legs: itinerary.legs.map((leg) => ({
      mode: leg.mode,
      route: leg.route || null,
      routeName: leg.routeLongName || null,
      from: leg.from.name,
      to: leg.to.name,
      durationSeconds: leg.duration ?? Math.round((leg.endTime - leg.startTime) / 1000),
      coordinates: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
    })),
  };
}

const SEARCH_BASE = "https://www.onemap.gov.sg/api/common/elastic/search";

/**
 * Free-text address/place search, no key required. Returns the best-match
 * coordinates or null. OneMap's own search, not a general geocoder — good
 * for Singapore addresses and building names, not vague queries.
 */
export async function geocodeAddress(text) {
  const url = `${SEARCH_BASE}?${new URLSearchParams({
    searchVal: text,
    returnGeom: "Y",
    getAddrDetails: "Y",
    pageNum: "1",
  }).toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OneMap search failed: ${res.status}`);
  const data = await res.json();
  const top = data?.results?.[0];
  if (!top) return null;
  return { lat: Number(top.LATITUDE), lng: Number(top.LONGITUDE), address: top.ADDRESS };
}
