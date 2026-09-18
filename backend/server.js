import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve .env relative to this file's location (repo root, one level up
// from backend/), not process.cwd() — so `cd backend && npm start` and
// `node backend/server.js` from the repo root both find the same .env. This
// must run before any other import's top-level code, since agent.js /
// arjunAgent.js now build their SDK clients lazily (see getAnthropic()/
// getGroq() in those files) — but dotenv still needs to be configured this
// early so process.env is populated before any request handler runs.
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
  getBusRouteStops,
} from "./src/ltaClient.js";
import { chatWithAgent } from "./src/agent.js";
import { upsertProfile, getNudges, clearNudges, startMonitor, profiles } from "./src/monitor.js";
import { nextScenario } from "./src/mockData.js";
import { getJourneyOptions } from "./src/journeyPlanner.js";
import { planRoute } from "./src/routePlanner.js";
import aiRouter from "../api/index.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(aiRouter);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n[WARN] ANTHROPIC_API_KEY is not set. The chat/agent endpoints will fail until you add it to .env.\n"
  );
}

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "\n[WARN] GROQ_API_KEY is not set. The /ai/arjun/chat endpoint will fail until you add it to .env.\n"
  );
}

// --- Live data (read-only passthroughs, normalized either live or mock) ---
app.get("/api/alerts", async (_req, res) => {
  try {
    res.json(await getTrainAlerts());
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
    res.json(await planRoute({ from: { lat, lng }, to, time }));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Couldn't plan a route right now." });
  }
});

app.get("/api/bus-route/:serviceNo", async (req, res) => {
  try {
    res.json(await getBusRouteStops(req.params.serviceNo));
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

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Commute Companion backend running on http://localhost:${PORT}`);
  const intervalMs = Number(process.env.MONITOR_INTERVAL_MS) || 30000;
  startMonitor(intervalMs);
  console.log(`Proactive monitor sweeping every ${intervalMs / 1000}s`);
});
