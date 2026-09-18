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
 * (mode TRANSIT) and a direct cycling route, and returns every meaningfully
 * different option so the UI can offer a real choice: the fastest one
 * ("Shortest"), the one with the fewest transfers if that's a different
 * itinerary ("Comfort"), and cycling — with the fastest flagged recommended.
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
    const fewestTransfers = candidates.reduce((a, b) => {
      if (b.transfers < a.transfers) return b;
      if (b.transfers === a.transfers && b.totalTimeSeconds < a.totalTimeSeconds) return b;
      return a;
    });

    options.push({
      id: "shortest",
      label: "Shortest",
      mode: transitModeLabel(shortest.legs),
      totalTimeSeconds: shortest.totalTimeSeconds,
      transfers: shortest.transfers,
      legs: shortest.legs,
    });

    if (fewestTransfers.transfers < shortest.transfers) {
      options.push({
        id: "comfort",
        label: "Comfort",
        mode: transitModeLabel(fewestTransfers.legs),
        totalTimeSeconds: fewestTransfers.totalTimeSeconds,
        transfers: fewestTransfers.transfers,
        legs: fewestTransfers.legs,
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
