import { getTrainAlerts, getStationCrowdForecast } from "./ltaClient.js";
import { getWeather } from "./weatherClient.js";
import { getWalkCycleRoute, getPtRoute } from "./onemapClient.js";
import { decide } from "./decisionLogic.js";
import { todayDateString, toOneMapTime } from "./dateUtils.js";

// Arjun's two known routes: cycle to the Punggol interchange then LRT+rail
// to one-north, or bus-only door to door. Representative fixed points, not
// real addresses — HOME is a residential point in Punggol.
const HOME = { lat: 1.4025, lng: 103.9068 };
const PUNGGOL_INTERCHANGE = { lat: 1.4053, lng: 103.9021 };
const ONE_NORTH = { lat: 1.2996, lng: 103.7876 };

// Punggol LRT's crowd-density code ("PLRT") differs from its TrainServiceAlerts
// code ("PTL") — the exact line-code trap LTA's docs warn about.
const PUNGGOL_LRT_CROWD_CODE = "PLRT";
const PUNGGOL_LRT_ALERT_CODE = "PTL";
const PUNGGOL_INTERCHANGE_STATION_CODE = "PTC";

const cache = new Map();
async function cached(key, ttlMs, fetchFn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fetchFn();
  cache.set(key, { value, at: Date.now() });
  return value;
}

async function getCycleLrtRoute(time) {
  const date = todayDateString();
  const [cycleLeg, railLeg] = await Promise.all([
    cached("cycle:home-interchange", 60 * 60 * 1000, () =>
      getWalkCycleRoute(HOME, PUNGGOL_INTERCHANGE, "cycle")
    ),
    cached(`pt:interchange-onenorth:RAIL:${time}`, 5 * 60 * 1000, () =>
      getPtRoute(PUNGGOL_INTERCHANGE, ONE_NORTH, { mode: "RAIL", date, time: toOneMapTime(time) })
    ),
  ]);

  const legs = [{ mode: "CYCLE", route: null, coordinates: cycleLeg.coordinates }, ...(railLeg?.legs ?? [])];
  const etaMinutes =
    Math.round(cycleLeg.totalTimeSeconds / 60) + Math.round((railLeg?.totalTimeSeconds ?? 0) / 60);
  return { etaMinutes, legs };
}

async function getBusOnlyRoute(time) {
  const date = todayDateString();
  const ptRoute = await cached(`pt:home-onenorth:BUS:${time}`, 5 * 60 * 1000, () =>
    getPtRoute(HOME, ONE_NORTH, { mode: "BUS", date, time: toOneMapTime(time) })
  );
  return {
    etaMinutes: ptRoute ? Math.round(ptRoute.totalTimeSeconds / 60) : null,
    legs: ptRoute?.legs ?? [],
  };
}

export async function getJourneyOptions(time) {
  const [weather, trainAlertsResult, crowdForecast, cycleLrtRoute, busOnlyRoute] = await Promise.all([
    getWeather(),
    getTrainAlerts(),
    getStationCrowdForecast(PUNGGOL_LRT_CROWD_CODE, PUNGGOL_INTERCHANGE_STATION_CODE),
    getCycleLrtRoute(time),
    getBusOnlyRoute(time),
  ]);

  const currentBucket = [...crowdForecast].reverse().find((b) => b.time <= time);
  const currentCrowd = currentBucket?.crowdLevel ?? crowdForecast[0]?.crowdLevel ?? "m";
  const punggolLrtAlerts = trainAlertsResult.alerts.filter((a) => a.line === PUNGGOL_LRT_ALERT_CODE);

  const cycleLrt = {
    etaMinutes: cycleLrtRoute.etaMinutes ?? 38,
    crowdLevel: currentCrowd,
    delayMinutes: 0,
    bikeAllowed: true,
    affectedSegments: punggolLrtAlerts,
    legs: cycleLrtRoute.legs,
  };
  const busOnly = {
    etaMinutes: busOnlyRoute.etaMinutes ?? 45,
    crowdLevel: "l",
    delayMinutes: 0,
    affectedSegments: [],
    legs: busOnlyRoute.legs,
  };

  // "now" for the leave-later scan means the requested time, not real
  // wall-clock time — this endpoint is parameterized by `time`.
  const [reqH, reqM] = time.split(":").map(Number);
  const requestedAsDate = new Date();
  requestedAsDate.setHours(reqH, reqM, 0, 0);

  const decision = decide({ cycleLrt, busOnly, weather, forecastBuckets: crowdForecast, now: requestedAsDate });

  return {
    requestedTime: time,
    weather,
    options: [
      { id: "cycle-lrt", mode: "Cycle + LRT", ...cycleLrt },
      { id: "bus-only", mode: "Bus (multi-leg)", ...busOnly },
    ],
    recommendation: { optionId: decision.recommendationId, reason: decision.reason },
    alternativeTiming: decision.alternativeTiming,
  };
}
