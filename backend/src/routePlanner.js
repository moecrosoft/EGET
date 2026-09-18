import { geocodeAddress, getPtRoute } from "./onemapClient.js";
import { todayDateString, toOneMapTime } from "./dateUtils.js";

/**
 * Real turn-by-turn transit directions from a point to a free-text
 * destination: geocodes the destination, then asks OneMap for the best
 * bus+MRT itinerary (mode TRANSIT lets it mix both and pick transfers).
 */
export async function planRoute({ from, to, time }) {
  const destination = await geocodeAddress(to);
  if (!destination) {
    return { error: `Couldn't find "${to}" — try a more specific address or station name.` };
  }

  const route = await getPtRoute(from, destination, {
    mode: "TRANSIT",
    date: todayDateString(),
    time: toOneMapTime(time),
  });
  if (!route) {
    return { error: `No route found to "${to}" at this time — service may not be running.` };
  }

  return {
    destination: { name: to, ...destination },
    totalTimeSeconds: route.totalTimeSeconds,
    transfers: route.transfers,
    legs: route.legs,
  };
}
