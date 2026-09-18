# EGET — Smart Commuter Companion

A transit app for Singapore that answers the question commuters actually
ask every morning: **"how do I get there, and will something ruin it on the
way?"** Built for Problem Statement 2 (see
[`Problem_Statement_2_Specification.pdf`](Problem_Statement_2_Specification.pdf)).

Search a destination, get real bus/MRT/cycle options ranked by speed and
comfort, and get proactively warned — with a one-tap reroute — if rain,
an accident, or an MRT disruption hits your route while you're on it.

## What it does

**Plan a trip**
- Search a destination with autocomplete (known MRT/LRT stations match
  first, so short/ambiguous queries like "sembawang" resolve to the real
  station, not a random same-named building)
- Real turn-by-turn directions from OneMap — bus, MRT/LRT, and cycling
  legs, not just straight-line distance
- Two ranked options when there's a genuine trade-off: **Shortest**
  (fastest overall) and **Comfort** (fewest changes), never a fabricated
  duplicate when nothing beats the fastest option
- Every leg shows its real MRT/LRT line color (NS/EW/NE/CC/DT/TE, straight
  from LTA's official colour spec), a "Change at [stop]" callout for every
  transfer, and total trip time

**Near You**
- Nearby bus stops and MRT/LRT stations from your live location, live
  arrival times from LTA DataMall
- Tap a bus number for a full-screen route page: every stop plotted on
  the map, direction toggle for looping services, pull-up stop list

**While navigating**
- Live weather-aware rain warnings, with a swap-route prompt if you're
  cycling and it starts raining
- Live LTA `TrafficIncidents` checked against your bus leg's path —
  accident nearby? Get a one-tap swap to an unaffected route
- Live LTA `TrainServiceAlerts` checked against your MRT/LRT leg's line —
  same reactive swap if your line goes down mid-trip

**Chat** — `POST /api/chat` (`backend/src/agent.js`), a working Claude-backed
chat agent. A second, persona-specific agentic loop for "Arjun" exists at
`backend/src/arjunAgent.js` but isn't currently wired to a route — it
powered an AI playground UI that was removed, and the API layer that
exposed it (`api/`) was removed with it since nothing called it anymore.

## Live data, not mocks

Every one of these is a real, currently-working integration (mock data
only kicks in automatically as a fallback if a key is missing or a live
call fails):

| Source | Used for |
|---|---|
| LTA DataMall `BusArrival`, `BusStops`, `BusRoutes` | live arrivals, nearby stops, full route/stop sequences |
| LTA DataMall `TrainServiceAlerts` | MRT/LRT disruption detection during nav |
| LTA DataMall `TrafficIncidents` | accident/roadwork detection during nav |
| LTA DataMall `PCDRealTime` / `PCDForecast` | crowd level now and forecasted |
| OneMap routing + search | turn-by-turn directions, destination autocomplete, geocoding |
| data.gov.sg 2hr forecast + real-time rainfall | rain-aware routing and the reactive rain-swap prompt |

## Tech stack

- **Backend**: Node.js + Express (`backend/`), ES modules
- **Frontend**: Vanilla JS + Leaflet.js — no build step, served as static
  files directly by the backend
- **AI**: Anthropic Claude (`/api/chat`); Groq (Arjun's persona agent,
  built but not currently wired to a route)
- **Maps**: OpenStreetMap tiles, dark-mode via CSS filter

## Project structure

```
backend/server.js       Express app — every /api/* route
backend/src/            LTA/OneMap/weather clients, route planning, decision logic, AI agents
frontend/                index.html + app.js + styles.css — the actual UI, no build step
lta_client.py, parsing.py,
recommend.py, main.py    Separate Python decision-logic exploration —
                         see ARJUN_DECISION_SERVICE.md (below)
```

## Getting started

Requires Node 20+.

```bash
cd backend && npm install        # also installs ../api per its postinstall script
cp ../.env.example ../.env       # fill in the keys below
npm run dev                      # http://localhost:8787
```

`.env` (repo root, one level above `backend/`) — see
[`.env.example`](.env.example) for the full annotated list:

| Key | Required for | If missing |
|---|---|---|
| `LTA_ACCOUNT_KEY` | live bus/train/incident data | falls back to realistic mock data |
| `ONEMAP_TOKEN` | routing, search, autocomplete | those endpoints return 503 |
| `ANTHROPIC_API_KEY` | `/api/chat` | that endpoint fails |
| `GROQ_API_KEY` | Arjun's agent (`backend/src/arjunAgent.js`) | n/a — not currently wired to a route |

Both `LTA_ACCOUNT_KEY` and `ONEMAP_TOKEN` are free, self-service signups
(links in `.env.example`) — no approval wait.

### Deploying

`Dockerfile` and `Procfile` both run `backend/server.js` directly — that's
the one thing that needs to be deployed; it serves the frontend itself.

## The team's other component

[`ARJUN_DECISION_SERVICE.md`](ARJUN_DECISION_SERVICE.md) documents a
separate Python module built alongside this app: real LTA/data.gov.sg data
pulling, parsing, and a scored/ranked decision-logic layer for a specific
commuter persona (Arjun: Punggol → one-north, optimises for comfort over
speed). It's a standalone, thoroughly-documented exploration of the
decision-logic problem — not wired into this app's live server, since the
integrated app above implements its own version of that logic
(`backend/src/decisionLogic.js`) for the deployed product. Worth reading
for the reasoning behind what "comfort-optimised" and "honest uncertainty"
actually mean for this problem, tested throughout against live API
responses rather than assumed from docs.

## Team

Tang Nan · Jayasuryan Mutyala · Jie Hua · Khant · Moe
