import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve .env relative to this file's location (repo root, one level up
// from backend/), not process.cwd() — so `cd backend && npm start` and
// `node backend/server.js` from the repo root both find the same .env.
// NOTE: placing this call before the imports below does NOT guarantee it
// runs before their top-level code — ES module imports are hoisted and
// fully evaluated before any of this file's own statements, regardless of
// textual order. The invariant that actually matters: no statically-imported
// module in this graph may read process.env at module-evaluation time.
// agent.js / arjunAgent.js satisfy this by building their SDK clients
// lazily (see getAnthropic()/getGroq() in those files), deferred until a
// request actually comes in — by which point this dotenv.config() call
// (which itself runs synchronously, early in this file's own execution)
// has already populated process.env. If a future import ever needs an env
// var at module-evaluation time, it must read it lazily too, not rely on
// import order here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import express from "express";
import cors from "cors";
import {
  getTrainAlerts,
  getBusArrivals,
  getAlternateRoutes,
  getNearbyBusStops,
  getNearbyStations,
  getAllStations,
  findStationByName,
  searchStations,
  getBusRouteStops,
  getTrafficIncidents,
} from "./src/ltaClient.js";
import { searchPlaces } from "./src/onemapClient.js";
import { getWeather } from "./src/weatherClient.js";
import { chatWithAgent } from "./src/agent.js";
import { upsertProfile, getNudges, clearNudges, startMonitor, profiles } from "./src/monitor.js";
import { nextScenario } from "./src/mockData.js";
import { getJourneyOptions } from "./src/journeyPlanner.js";
import { planRoute } from "./src/routePlanner.js";
import { transcribeStation } from "./src/transcribeClient.js";

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n[WARN] ANTHROPIC_API_KEY is not set. The /api/chat endpoint will fail until you add it to .env.\n"
  );
}
if (!process.env.GROQ_API_KEY) {
  console.warn(
    "\n[WARN] GROQ_API_KEY is not set. The /api/transcribe-station endpoint will fail until you add it to .env.\n"
  );
}

// --- Live data (read-only passthroughs, normalized either live or mock) ---
app.get("/api/weather", async (_req, res) => {
  try {
    res.json(await getWeather());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/alerts", async (_req, res) => {
  try {
    res.json(await getTrainAlerts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/incidents", async (_req, res) => {
  try {
    res.json(await getTrafficIncidents());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/arrivals/:busStopCode", async (req, res) => {
  try {
    res.json(await getBusArrivals(req.params.busStopCode));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/routes", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "from and to are required" });
    const result = await getAlternateRoutes({ from, to });
    res.json({
      ...result,
      fromStation: findStationByName(from),
      toStation: findStationByName(to),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Static reference data — lets the frontend draw stations on a map without
// duplicating the coordinate list client-side.
app.get("/api/stations", (_req, res) => {
  res.json({ stations: getAllStations() });
});

app.get("/api/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng are required" });
    }
    const [busStops, stations] = await Promise.all([
      getNearbyBusStops(lat, lng),
      getNearbyStations(lat, lng),
    ]);
    res.json({ busStops, stations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real turn-by-turn transit directions (bus/MRT legs + transfers) from a
// point to a free-text destination, via OneMap. Used by the Home search bar.
app.get("/api/plan-route", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const to = req.query.to;
    if (Number.isNaN(lat) || Number.isNaN(lng) || !to) {
      return res.status(400).json({ error: "lat, lng and to are required" });
    }
    if (!process.env.ONEMAP_TOKEN) {
      return res.status(503).json({ error: "ONEMAP_TOKEN is not set — see .env.example." });
    }
    const time = req.query.time || new Date().toTimeString().slice(0, 5);
    const toLat = Number(req.query.toLat);
    const toLng = Number(req.query.toLng);
    const toLatLng = Number.isNaN(toLat) || Number.isNaN(toLng) ? null : { lat: toLat, lng: toLng };
    res.json(await planRoute({ from: { lat, lng }, to, toLatLng, time }));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Couldn't plan a route right now." });
  }
});

// Destination search suggestions: known MRT/LRT stations that match first,
// then OneMap place results — lets the Home search bar show a picker instead
// of silently routing to whatever a short/ambiguous query happens to match.
app.get("/api/geocode-suggest", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ suggestions: [] });
    const stationMatches = searchStations(q, 5).map((s) => ({
      name: s.name,
      address: `${s.name} MRT/LRT Station`,
      lat: s.latitude,
      lng: s.longitude,
    }));
    const seen = new Set(stationMatches.map((m) => m.name.toLowerCase()));
    const placeMatches = (await searchPlaces(q, 8)).filter((m) => !seen.has((m.name || "").toLowerCase()));
    res.json({ suggestions: [...stationMatches, ...placeMatches].slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Voice input for the From/To fields on the "Where to?" screen: browser
// records a short clip and POSTs the raw bytes here (no multipart form —
// just the audio body with its own content type), Groq Whisper transcribes
// it, and the transcript is matched against the known station list so the
// client can auto-select a station the same way clicking a suggestion does.
app.post("/api/transcribe-station", express.raw({ type: "audio/webm", limit: "5mb" }), async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "GROQ_API_KEY is not set — see .env.example." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No audio received." });
    }
    res.json(await transcribeStation(req.body));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Couldn't transcribe that — try again." });
  }
});

app.get("/api/bus-route/:serviceNo", async (req, res) => {
  try {
    const direction = req.query.direction != null ? Number(req.query.direction) : null;
    res.json(await getBusRouteStops(req.params.serviceNo, direction));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Arjun's persona journey: cycle+LRT vs bus-only, with real OneMap routing ---
app.get("/api/journey-options", async (req, res) => {
  try {
    const time = req.query.time ?? new Date().toTimeString().slice(0, 5);
    if (!process.env.ONEMAP_TOKEN) {
      return res.status(503).json({ error: "ONEMAP_TOKEN is not set — see .env.example." });
    }
    res.json(await getJourneyOptions(time));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Couldn't fetch live conditions for the journey planner." });
  }
});

// Demo-only: advances the mock disruption scenario so you can show the
// proactive monitor reacting to a *new* disruption live. Has no effect once
// a real LTA_ACCOUNT_KEY is configured.
app.post("/api/mock/next-scenario", (_req, res) => {
  res.json({ scenarioIndex: nextScenario() });
});

// --- Commuter profile (in-memory; one profile per demo session id) ---
app.post("/api/profile/:profileId", (req, res) => {
  const { home, work, lines } = req.body || {};
  upsertProfile(req.params.profileId, { home, work, lines: lines || [] });
  res.json({ ok: true });
});

// --- Chat with the real agent ---
app.post("/api/chat", async (req, res) => {
  try {
    const { message, profileId } = req.body || {};
    if (!message) return res.status(400).json({ error: "message is required" });
    const profile = profileId ? profiles.get(profileId) : null;
    const result = await chatWithAgent({ message, profile });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Proactive nudges the monitor has generated for this profile ---
app.get("/api/nudges/:profileId", (req, res) => {
  res.json({ nudges: getNudges(req.params.profileId) });
});

app.post("/api/nudges/:profileId/clear", (req, res) => {
  clearNudges(req.params.profileId);
  res.json({ ok: true });
});

// --- Static frontend ---
app.use(express.static(path.join(__dirname, "..", "frontend")));

// TO THIS:
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Commute Companion backend running on http://${HOST}:${PORT}`);
  const intervalMs = Number(process.env.MONITOR_INTERVAL_MS) || 30000;
  startMonitor(intervalMs);
  console.log(`Proactive monitor sweeping every ${intervalMs / 1000}s`);
});
