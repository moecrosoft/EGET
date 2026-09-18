// Pure decision logic for Arjun's cycle+LRT vs bus-only comparison.
// No network calls in here — server.js does the fetching, this just reasons.

const CROWD_RANK = { l: 0, m: 1, h: 2 };

function crowdWorseThan(a, b) {
  return (CROWD_RANK[a] ?? 1) > (CROWD_RANK[b] ?? 1);
}

/**
 * @param {object} input
 * @param {object} input.cycleLrt   { etaMinutes, crowdLevel, delayMinutes, bikeAllowed, affectedSegments }
 * @param {object} input.busOnly    { etaMinutes, crowdLevel, delayMinutes, affectedSegments }
 * @param {object} input.weather    { rainExpectedWithinMinutes, nowcast }
 * @param {Array}  input.forecastBuckets  [{ time: "08:00", crowdLevel: "m" }, ...] for the cycle-LRT leg
 * @param {Date}   input.now  reference time for the leave-later scan — pass the *requested* time, not real wall-clock time
 */
export function decide({ cycleLrt, busOnly, weather, forecastBuckets = [], now = new Date() }) {
  const rainSoon =
    typeof weather.rainExpectedWithinMinutes === "number" &&
    weather.rainExpectedWithinMinutes < 30;

  let recommendationId = "cycle-lrt";
  let reason = "";

  // Rule 1: weather gate — rain pushes hard toward bus-only regardless of time saved
  if (rainSoon) {
    recommendationId = "bus-only";
    reason = `Rain expected within ${weather.rainExpectedWithinMinutes} min — bus-only keeps you dry, even though it's ${busOnly.etaMinutes - cycleLrt.etaMinutes} min slower.`;
  }
  // Rule 2: disruption gate — penalize an option with active affected segments
  else if (cycleLrt.affectedSegments?.length > 0 && !busOnly.affectedSegments?.length) {
    recommendationId = "bus-only";
    reason = "Your LRT connection has an active service alert — bus-only avoids it.";
  } else if (busOnly.affectedSegments?.length > 0 && !cycleLrt.affectedSegments?.length) {
    recommendationId = "cycle-lrt";
    reason = "Your bus route has an active service alert — cycle+LRT avoids it.";
  }
  // Rule 3: crowding gate — if the faster option is badly crowded, weigh comfort
  else if (crowdWorseThan(cycleLrt.crowdLevel, busOnly.crowdLevel) && cycleLrt.crowdLevel === "h") {
    recommendationId = "bus-only";
    reason = "Cycle+LRT is faster but running high crowding right now — bus-only trades a few minutes for comfort.";
  }
  // Rule 4: bike policy gate — exclude cycle+LRT if bikes aren't allowed at this time
  else if (cycleLrt.bikeAllowed === false) {
    recommendationId = "bus-only";
    reason = "Bikes aren't allowed on this LRT line right now — bus-only is the available option.";
  }
  // Default: recommend whichever is faster, weather/crowding/disruption permitting
  else {
    recommendationId = cycleLrt.etaMinutes <= busOnly.etaMinutes ? "cycle-lrt" : "bus-only";
    const winner = recommendationId === "cycle-lrt" ? cycleLrt : busOnly;
    const loser = recommendationId === "cycle-lrt" ? busOnly : cycleLrt;
    reason = `Clear conditions and ${winner.crowdLevel === "l" ? "low" : "moderate"} crowding — saves ${Math.abs(winner.etaMinutes - loser.etaMinutes)} min over the alternative.`;
  }

  // Rule 5: leave-later check — scan forecast buckets for a real, timestamped improvement
  const recommended = recommendationId === "cycle-lrt" ? cycleLrt : busOnly;
  const alternativeTiming = findBetterDepartureTime(forecastBuckets, recommended.crowdLevel, now);

  return { recommendationId, reason, alternativeTiming };
}

/**
 * Scans forward through timestamped forecast buckets and returns the first one
 * that's a meaningful crowding improvement over the current level — this is what
 * replaces a hardcoded "20 min" with a real, data-driven number (could be 8, could be 35).
 */
export function findBetterDepartureTime(forecastBuckets, currentCrowdLevel, now = new Date()) {
  for (const bucket of forecastBuckets) {
    const bucketTime = parseHHMMToday(bucket.time, now);
    if (bucketTime <= now) continue;

    if ((CROWD_RANK[bucket.crowdLevel] ?? 1) < (CROWD_RANK[currentCrowdLevel] ?? 1)) {
      const minutesAway = Math.round((bucketTime - now) / 60000);
      return {
        label: `Leave in ${minutesAway} min`,
        atTime: bucket.time,
        reason: `Crowding is forecast to drop to ${crowdWord(bucket.crowdLevel)} by ${bucket.time}.`,
      };
    }
  }
  return null; // no improvement found in the forecast window — don't fabricate one
}

function crowdWord(level) {
  return { l: "low", m: "moderate", h: "high" }[level] ?? level;
}

function parseHHMMToday(hhmm, referenceDate) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(referenceDate);
  d.setHours(h, m, 0, 0);
  return d;
}
