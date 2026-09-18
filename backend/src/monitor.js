import { getTrainAlerts } from "./ltaClient.js";
import { generateProactiveNudge } from "./agent.js";

// In-memory store is enough for a one-day hackathon build. Swap for a real
// DB if this goes further. profiles: Map<profileId, {home, work, lines}>
export const profiles = new Map();
// nudges: Map<profileId, Array<{id, text, createdAt, alertLine}>>
export const nudges = new Map();

// Avoid re-notifying the same profile about the same alert repeatedly.
const seenAlertKeys = new Set();

function alertKey(profileId, alert) {
  return `${profileId}::${alert.line}::${alert.message}`;
}

export function upsertProfile(profileId, profile) {
  profiles.set(profileId, profile);
  if (!nudges.has(profileId)) nudges.set(profileId, []);
}

export function getNudges(profileId) {
  return nudges.get(profileId) || [];
}

export function clearNudges(profileId) {
  nudges.set(profileId, []);
}

let sweeping = false;

export async function sweepOnce() {
  if (sweeping) return; // don't overlap sweeps
  sweeping = true;
  try {
    const { alerts } = await getTrainAlerts();
    const disruptions = alerts.filter((a) => a.status === "disrupted");
    if (disruptions.length === 0 || profiles.size === 0) return;

    for (const [profileId, profile] of profiles.entries()) {
      for (const alert of disruptions) {
        const key = alertKey(profileId, alert);
        if (seenAlertKeys.has(key)) continue;

        const text = await generateProactiveNudge({ profile, alert });
        seenAlertKeys.add(key);
        if (!text) continue;

        const list = nudges.get(profileId) || [];
        list.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          alertLine: alert.line,
          createdAt: new Date().toISOString(),
        });
        nudges.set(profileId, list);
      }
    }
  } catch (err) {
    console.error("[monitor] sweep failed:", err.message);
  } finally {
    sweeping = false;
  }
}

export function startMonitor(intervalMs) {
  sweepOnce(); // run one immediately so a demo doesn't wait
  return setInterval(sweepOnce, intervalMs);
}
