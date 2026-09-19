import { geocodeAddress, getPtItineraries, getWalkCycleRoute } from "./onemapClient.js";
import { todayDateString, toOneMapTime } from "./dateUtils.js";
import { findStationByName } from "./ltaClient.js";

function transitModeLabel(legs) {
  const hasRail = legs.some((l) => l.mode === "RAIL" || l.mode === "SUBWAY");
  const hasBus = legs.some((l) => l.mode === "BUS");
  if (hasRail && hasBus) return "Bus + Train";
  if (hasRail) return "Train";
  if (hasBus) return "Bus";
  return "Walk";
}

/**
 * Real turn-by-turn directions from a point to a destination: `to` is
 * geocoded as free text, unless `toLatLng` is given (e.g. a bus stop or
 * station whose coordinates we already know — its name usually won't
 * geocode well as an address). Asks OneMap for several bus+MRT itineraries
 * (mode TRANSIT), a bus-only itinerary, and a direct cycling route, and
 * returns up to three real options: "Shortest" (fastest overall),
 * "Comfort" (the most comfortable *other* itinerary OneMap actually
 * returned — fewest transfers, then least walking), and "Cycle" — with
 * the fastest flagged recommended.
 */
export async function planRoute({ from, to, toLatLng, time }) {
  // A plain station/town name (e.g. "Sembawang") geocodes as free text to
  // whatever address OneMap's search ranks first — often a random building
  // that happens to share the name, not the actual interchange (seen live:
  // "Sembawang" resolved to a Sembawang Air Base address 3km from the real
  // town/MRT). Snap to our own known station coordinates first when the
  // text matches one exactly, before falling back to address search.
  const station = toLatLng ? null : findStationByName(to);
  const destination = toLatLng || (station && { lat: station.latitude, lng: station.longitude, address: `${station.name} MRT/LRT Station` }) || (await geocodeAddress(to));
  if (!destination) {
    return { error: `Couldn't find "${to}" — try a more specific address or station name.` };
  }

  const [transitItineraries, busOnlyItineraries, cycleRoute] = await Promise.all([
    getPtItineraries(from, destination, { mode: "TRANSIT", date: todayDateString(), time: toOneMapTime(time), numItineraries: 3 }),
    getPtItineraries(from, destination, { mode: "BUS", date: todayDateString(), time: toOneMapTime(time), numItineraries: 1 }),
    getWalkCycleRoute(from, destination, "cycle").catch(() => null),
  ]);

  // Comfort candidates come from a separate mode=BUS call (not just the
  // TRANSIT list) because OneMap's TRANSIT alternates are usually the same
  // itinerary shape with a different bus number for the last mile — a real
  // "fewer changes" option is often only reachable by asking for bus-only.
  const candidates = [...transitItineraries, ...busOnlyItineraries];
  const options = [];
  if (candidates.length) {
    const shortest = candidates.reduce((a, b) => (b.totalTimeSeconds < a.totalTimeSeconds ? b : a));
    options.push({
      id: "shortest",
      label: "Shortest",
      mode: transitModeLabel(shortest.legs),
      totalTimeSeconds: shortest.totalTimeSeconds,
      transfers: shortest.transfers,
      legs: shortest.legs,
    });

    // "Comfort" is the most comfortable *other* real itinerary OneMap
    // returned — fewest transfers, then least walking — not required to
    // beat Shortest on those, since the point is offering a genuine choice
    // (e.g. one more transfer but a shorter walk), not just a strictly
    // "better" duplicate. Only omitted when OneMap gave us nothing else at
    // all to choose between.
    const others = candidates.filter((c) => c !== shortest);
    if (others.length) {
      const comfort = others.reduce((a, b) => {
        if (b.transfers < a.transfers) return b;
        if (b.transfers === a.transfers && b.walkDistanceMeters < a.walkDistanceMeters) return b;
        return a;
      });
      options.push({
        id: "comfort",
        label: "Comfort",
        mode: transitModeLabel(comfort.legs),
        totalTimeSeconds: comfort.totalTimeSeconds,
        transfers: comfort.transfers,
        legs: comfort.legs,
      });
    }
  }
  if (cycleRoute) {
    options.push({
      id: "cycle",
      label: "Cycle",
      mode: "Cycle",
      totalTimeSeconds: cycleRoute.totalTimeSeconds,
      transfers: 0,
      legs: [{ mode: "CYCLE", route: null, from: null, to: null, durationSeconds: cycleRoute.totalTimeSeconds, coordinates: cycleRoute.coordinates }],
    });
  }

  if (!options.length) {
    return { error: `No route found to "${to}" at this time — service may not be running.` };
  }
  options.sort((a, b) => a.totalTimeSeconds - b.totalTimeSeconds);

  return {
    destination: { name: to, ...destination },
    options,
    recommendedId: options[0].id,
  };
}
