# EGET — Smart Commuter Companion

A transit app for Singapore that answers the question commuters actually
ask every morning: **"how do I get there, and will something ruin it on the
way?"** Built for Problem Statement 2 (see
[`Problem_Statement_2_Specification.pdf`](Problem_Statement_2_Specification.pdf)).

Search a destination, get real bus/MRT/cycle options ranked by speed and
comfort, and get proactively warned — with a one-tap reroute — if rain,
an accident, or an MRT disruption hits your route while you're on it.

**Live demo:** https://eget-562866144161.europe-west1.run.app

## What it does

### Plan a trip
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

### Near You
- Nearby bus stops and MRT/LRT stations from your live location, with live
  arrival times from LTA DataMall
- Tap a bus number for a full-screen route page: every stop plotted on
  the map, direction toggle for looping services, pull-up stop list

### While navigating
- Live weather-aware rain warnings, with a swap-route prompt if you're
  cycling and it starts raining
- Live LTA `TrafficIncidents` checked against your bus leg's path —
  accident nearby? Get a one-tap swap to an unaffected route
- Live LTA `TrainServiceAlerts` checked against your MRT/LRT leg's line —
  same reactive swap if your line goes down mid-trip

### Chat
`POST /api/chat` (`backend/src/agent.js`) is a working Claude-backed chat
agent.

A second, persona-specific agentic loop for "Arjun" exists at
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
- **Deployment**: Google Cloud Run (containerized via root `Dockerfile`)

## Project structure

```
.
├── Dockerfile           # Node 20-slim container setup for Cloud Run
├── Procfile             # Command entrypoint for process managers
├── .env                 # API keys & secret environment configuration
├── backend/
│   ├── server.js        # Express app — serves frontend & /api/* routes
│   └── src/             # LTA/OneMap/weather clients, decision logic, AI agents
└── frontend/            # index.html + app.js + styles.css — static UI assets
```

## Getting started

Requires Node 20+.

```bash
cd backend && npm install
cp ../.env.example ../.env       # fill in the keys below
npm run dev                      # http://localhost:8787
```

### Environment variables

Create a `.env` at the repo root (one level above `backend/`). See
`.env.example` for the full annotated list.

| Key | Required for | If missing |
|---|---|---|
| `LTA_ACCOUNT_KEY` | live bus/train/incident data | falls back to realistic mock data |
| `ONEMAP_TOKEN` | routing, search, autocomplete | those endpoints return `503` |
| `ANTHROPIC_API_KEY` | `/api/chat` | that endpoint fails |
| `GROQ_API_KEY` | Arjun's agent (`backend/src/arjunAgent.js`) | n/a — not currently wired to a route |

Both `LTA_ACCOUNT_KEY` and `ONEMAP_TOKEN` are free, self-service signups
(links in `.env.example`) — no approval wait.

## Deployment to Google Cloud Run

The application deploys directly to Google Cloud Run using a containerized
Node.js environment. The root `Dockerfile` builds the backend server and its
module dependencies, while Express serves the static frontend assets
directly.

### Prerequisites

1. Install the Google Cloud SDK (`gcloud` CLI).
2. Authenticate and select your target GCP project:

   ```bash
   gcloud auth login
   gcloud config set project project-8fac92ef-d80d-4c08-a86
   ```

3. Make sure your local `.env` at the repository root contains all required
   production API keys (`LTA_ACCOUNT_KEY`, `ONEMAP_TOKEN`,
   `ANTHROPIC_API_KEY`, etc.).

> **Note:** Do not define `PORT` inside `.env` — Cloud Run automatically
> assigns `PORT=8080`.

### Deploy command

Run this from the repository root:

```bash
gcloud run deploy eget \
  --source . \
  --region europe-west1 \
  --project project-8fac92ef-d80d-4c08-a86 \
  --allow-unauthenticated \
  --clear-base-image \
  --env-vars-file=.env
```

Or, if running from inside the `backend/` folder, reference the root
context (`..`):

```bash
gcloud run deploy eget \
  --source .. \
  --region europe-west1 \
  --project project-8fac92ef-d80d-4c08-a86 \
  --allow-unauthenticated \
  --clear-base-image \
  --env-vars-file=../.env
```

### What happens during deployment

1. `gcloud` uploads the repository sources to Google Cloud Storage.
2. Google Cloud Build executes the root `Dockerfile`, installing dependencies
   for `backend/`.
3. The container image is pushed to Artifact Registry and instantiated in
   Cloud Run.
4. Environment variables from `.env` are injected into the container runtime.
5. The container binds to host `0.0.0.0` on port `8080` and serves the full
   application live.

**Live service URL:** https://eget-562866144161.europe-west1.run.app

## Team

Tang Nan · Jayasuryan Mutyala · Jie Hua · Khant · Moe