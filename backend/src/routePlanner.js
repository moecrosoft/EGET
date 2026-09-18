import { geocodeAddress, getPtRoute, getWalkCycleRoute } from "./onemapClient.js";
import { todayDateString, toOneMapTime } from "./dateUtils.js";

/**
 * Real turn-by-turn directions from a point to a free-text destination:
 * geocodes the destination, then asks OneMap for both the best bus+MRT
 * itinerary (mode TRANSIT) and a direct cycling route, and returns
 * whichever is faster — cycling regularly beats transit for short hops.
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
  const cycleOption = cycleRoute && {
    totalTimeSeconds: cycleRoute.totalTimeSeconds,
    transfers: 0,
    legs: [{ mode: "CYCLE", route: null, from: null, to: null, durationSeconds: cycleRoute.totalTimeSeconds, coordinates: cycleRoute.coordinates }],
  };

  const best = !transitRoute ? cycleOption
    : !cycleOption ? transitRoute
    : cycleOption.totalTimeSeconds < transitRoute.totalTimeSeconds ? cycleOption
    : transitRoute;

  if (!best) {
    return { error: `No route found to "${to}" at this time — service may not be running.` };
  }

  return {
    destination: { name: to, ...destination },
    totalTimeSeconds: best.totalTimeSeconds,
    transfers: best.transfers,
    legs: best.legs,
  };
}
