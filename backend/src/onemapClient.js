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

function normalizeItinerary(itinerary) {
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

/**
 * routeType "pt" — public transport itineraries. `mode` is "TRANSIT", "BUS"
 * or "RAIL". Returns every itinerary OneMap comes back with (up to
 * numItineraries), normalized to a flat leg list with decoded geometry —
 * lets a caller pick between e.g. the fastest one and the one with fewest
 * transfers, instead of only ever seeing OneMap's single top pick.
 */
export async function getPtItineraries(start, end, { mode, date, time, maxWalkDistance = 1000, numItineraries = 1 }) {
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
      numItineraries: String(numItineraries),
    });
  } catch (err) {
    console.error(`[onemapClient] pt route (${mode}) failed:`, err.message);
    return [];
  }
  return (data?.plan?.itineraries || []).map(normalizeItinerary);
}

/** Single-itinerary convenience wrapper — OneMap's top pick, or null. */
export async function getPtRoute(start, end, opts) {
  const [itinerary] = await getPtItineraries(start, end, { ...opts, numItineraries: 1 });
  return itinerary || null;
}

const SEARCH_BASE = "https://www.onemap.gov.sg/api/common/elastic/search";

/**
 * Free-text address/place search, no key required. Returns the best-match
 * coordinates or null. OneMap's own search, not a general geocoder — good
 * for Singapore addresses and building names, not vague queries.
 */
export async function geocodeAddress(text) {
  const results = await searchPlaces(text, 1);
  return results[0] || null;
}

async function fetchSearchPage(text, pageNum) {
  const url = `${SEARCH_BASE}?${new URLSearchParams({
    searchVal: text,
    returnGeom: "Y",
    getAddrDetails: "Y",
    pageNum: String(pageNum),
  }).toString()}`;
  // Search technically doesn't require a token, but anonymous requests get a
  // much lower rate limit — cheap to send the token we already have (used
  // for routing) and avoid tripping it on multi-page lookups like this one.
  const headers = process.env.ONEMAP_TOKEN ? { Authorization: process.env.ONEMAP_TOKEN } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`OneMap search failed: ${res.status}`);
  return res.json();
}

// 0 = query is a whole word right at the start of the name ("SIM
// HEADQUARTERS" for "sim") — the best kind of match. 1 = whole word
// elsewhere in the name. 2 = query is merely a substring of a longer word
// ("SIMEI", "SIMS ..." for "sim") — OneMap ranks these no differently from
// real word matches, which is why "sim" alone buries SIM HQ behind a dozen
// SIMEI/SIMS/SIME entries.
function matchScore(name, query) {
  const n = name.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = n.indexOf(q);
  if (idx === -1) return 3;
  const isLetter = (c) => !!c && /[a-z]/.test(c);
  const wholeWord = !isLetter(n[idx - 1]) && !isLetter(n[idx + q.length]);
  if (!wholeWord) return 2;
  return idx === 0 ? 0 : 1;
}

/**
 * Same OneMap search as geocodeAddress, but returns several candidates
 * instead of blindly taking the top one — a short/ambiguous query like "sim"
 * matches over a hundred places, and OneMap's own ranking isn't relevance
 * based: for "sim" it returns pages of SIM LIM SQUARE / SIMEI / SIMS ...
 * with "SIM HEADQUARTERS" buried on page 4. A single page 1 fetch isn't
 * enough to know that — even page 1 alone already looks "good" (SIM LIM
 * SQUARE is a genuine whole-word match too) — so the first few pages are
 * always pulled (in parallel, so it's still ~one round trip) and re-ranked
 * together so every real word match has a chance to surface, not just
 * whichever one happened to be on page 1.
 */
export async function searchPlaces(text, limit = 5) {
  const first = await fetchSearchPage(text, 1);
  let results = first?.results || [];
  const totalPages = first?.totalNumPages || 1;

  const extraPages = [2, 3, 4, 5, 6].filter((p) => p <= totalPages);
  if (extraPages.length) {
    const extras = await Promise.all(extraPages.map((p) => fetchSearchPage(text, p).catch(() => null)));
    for (const page of extras) results = results.concat(page?.results || []);
  }

  const seen = new Set();
  const deduped = results.filter((r) => {
    const key = `${r.SEARCHVAL}|${r.ADDRESS}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => matchScore(a.SEARCHVAL, text) - matchScore(b.SEARCHVAL, text));

  return deduped.slice(0, limit).map((r) => ({
    name: r.SEARCHVAL,
    address: r.ADDRESS,
    lat: Number(r.LATITUDE),
    lng: Number(r.LONGITUDE),
  }));
}

const LINE_PREFIX = {
  NS: "NSL", EW: "EWL", CG: "EWL", NE: "NEL", CC: "CCL", CE: "CCL", DT: "DTL", TE: "TEL",
  BP: "BPL", SE: "SLRT", SW: "SLRT", PE: "PLRT", PW: "PLRT", PTC: "PLRT", STC: "SLRT",
};

// Cached for the process lifetime, like ltaClient.js's bus stops/routes
// caches. Our old hand-maintained MRT_STATIONS list only covered ~38 of
// the network's ~220 real stations (interchanges and "major" stations
// only) — "nearest station" was wrong for anyone standing near any of the
// other ~180. Paginates OneMap's own search index instead ("<NAME> MRT/LRT
// STATION (<CODE>)"), drops exit entries, dedupes by the code so an
// interchange's several name variants collapse to one real station.
let stationsCache = null;

export async function getAllStationsFromOneMap() {
  if (stationsCache) return stationsCache;
  const seen = new Map();
  for (const term of ["MRT STATION", "LRT STATION"]) {
    let page = 1;
    let totalPages = 40; // safety cap — real total is usually well under this
    while (page <= totalPages) {
      const data = await fetchSearchPage(term, page).catch(() => null);
      const results = data?.results || [];
      if (!results.length) break;
      totalPages = Math.min(totalPages, data.totalNumPages || totalPages);
      for (const r of results) {
        if (/EXIT/i.test(r.SEARCHVAL)) continue;
        const m = r.SEARCHVAL.match(/^(.*?)\s+(?:MRT|LRT)\s+STATION\s*\(([^)]+)\)/i);
        if (!m) continue;
        const codes = m[2].split("/").map((c) => c.trim());
        if (seen.has(codes[0])) continue;
        seen.set(codes[0], {
          name: m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()),
          lines: [...new Set(codes.map((c) => LINE_PREFIX[c.match(/^[A-Z]+/)?.[0]] || c))],
          latitude: Number(r.LATITUDE),
          longitude: Number(r.LONGITUDE),
        });
      }
      page++;
    }
  }
  stationsCache = [...seen.values()];
  return stationsCache;
}
