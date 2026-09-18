import { geocodeAddress, getPtRoute, getWalkCycleRoute } from "./onemapClient.js";
import { todayDateString, toOneMapTime } from "./dateUtils.js";

function transitModeLabel(legs) {
  const hasRail = legs.some((l) => l.mode === "RAIL" || l.mode === "SUBWAY");
  const hasBus = legs.some((l) => l.mode === "BUS");
  if (hasRail && hasBus) return "Bus + Train";
  if (hasRail) return "Train";
  if (hasBus) return "Bus";
  return "Walk";
}

/**
 * Real turn-by-turn directions from a point to a free-text destination:
 * geocodes the destination, then asks OneMap for both the best bus+MRT
 * itinerary (mode TRANSIT) and a direct cycling route. Returns every
 * option that came back (not just the fastest) so the UI can offer a
 * real choice, with the fastest one flagged as recommended.
 */
export async function planRoute({ from, to, time }) {
  const destination = await geocodeAddress(to);
  if (!destination) {
    return { error: `Couldn't find "${to}" — try a more specific address or station name.` };
  }

  const [transitRoute, cycleRoute] = await Promise.all([
    getPtRoute(from, destination, { mode: "TRANSIT", date: todayDateString(), time: toOneMapTime(time) }),
    getWalkCycleRoute(from, destination, "cycle").catch(() => null),
  ]);

  const options = [];
  if (transitRoute) {
    options.push({
      id: "transit",
      mode: transitModeLabel(transitRoute.legs),
      totalTimeSeconds: transitRoute.totalTimeSeconds,
      transfers: transitRoute.transfers,
      legs: transitRoute.legs,
    });
  }
  if (cycleRoute) {
    options.push({
      id: "cycle",
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
