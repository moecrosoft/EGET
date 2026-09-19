# EGET — Smart Commuter Companion

A transit app for Singapore that answers the question commuters actually
ask every morning: **"how do I get there, and will something ruin it on the
way?"** Built for Problem Statement 2 (see
[`Problem_Statement_2_Specification.pdf`](Problem_Statement_2_Specification.pdf)).

Search a destination, get real bus/MRT/cycle options ranked by speed and
comfort, and get proactively warned — with a one-tap reroute — if rain,
an accident, or an MRT disruption hits your route while you're on it.

**Live demo:** https://eget-562866144161.europe-west1.run.app

Also deployed (Qwiklabs lab project — has the very latest commits, but
disappears when the lab session ends, so don't rely on it lasting):
https://eget-769419892850.europe-west1.run.app

## What it does

### Plan a trip
- Search a destination with autocomplete (known MRT/LRT stations match
  first, so short/ambiguous queries like "sembawang" resolve to the real
  station, not a random same-named building) — the "From" field is
  editable the same way, so a trip can start from anywhere, not just your
  current location
- Real turn-by-turn directions from OneMap — bus, MRT/LRT, and cycling
  legs, not just straight-line distance
- Up to three real options per search: **Shortest** (fastest overall),
  **Comfort** (the most comfortable *other* itinerary OneMap actually
  returned — fewest transfers, then least walking), and **Cycle** — never
  a fabricated duplicate, only shown when a genuinely different itinerary
  exists
- Weather-aware reasoning next to the recommended option (e.g. "Raining
  now — a non-cycling option would stay dry", or current conditions
  folded into the reason text) — the same idea Arjun's board uses,
  generalized to any search
- "Leave N min later" suggestions when a route's rail line is forecast to
  meaningfully quiet down within the hour, using real LTA crowd-forecast
  data averaged across the line (not a per-station lookup — see
  `CLAUDE.md` for why)
- Every leg shows its real MRT/LRT line color (NS/EW/NE/CC/DT/TE, straight
  from LTA's official colour spec), a "Change at [stop]" callout for every
  transfer, and total trip time

### Near You
- Nearby bus stops **and MRT/LRT stations** from your live location — the
  station list is built from OneMap's own ~220-station index (not a small
  hand-picked list), so "nearest" is actually accurate wherever you are;
  tapping a station plans a real route there, same as tapping a
  destination suggestion
- Live arrival times from LTA DataMall, auto-refreshing every few seconds
  while the screen's open, no manual reload needed
- Tap a bus number for a full-screen route page: every stop plotted on
  the map, direction toggle for looping services, pull-up stop list

### While navigating
- A live GPS position marker on the nav map, not just a static route
- Live weather-aware rain warnings, with a swap-route prompt if you're
  cycling and it starts raining
- Live LTA `TrafficIncidents` checked against your bus leg's path —
  accident nearby? Get a one-tap swap to an unaffected route
- Live LTA `TrainServiceAlerts` checked against your MRT/LRT leg's line —
  same reactive swap if your line goes down mid-trip
- The swap always picks the fastest available option that actually avoids
  the specific problem (not just "the other option"), and never suggests
  swapping *into* cycling — see the `?simulate=rain` / `?simulate=accident`
  / `?simulate=trainalert` query params below to demo this without
  waiting for real conditions
- A real OS-level push notification fires alongside the in-app swap card
  (via a small service worker, `frontend/sw.js`), so a disruption is
  noticeable even if the app isn't in the foreground — needs HTTPS (works
  on the live demo; on `localhost` it's fine too, just not on a plain
  `http://` LAN IP) and notification permission, which is requested when
  navigation starts

## Demoing the reactive reroute without waiting for real disruptions

Real disruptions are rare — `TrainServiceAlerts.AffectedSegments` is empty
on a normal day, and accidents/rain aren't on demand. To show the swap-card
flow live: open the app with one of these appended to the URL, then search
any destination and tap "Leave now" — the card appears ~3s after you land
on the nav screen, using the exact same UI the real detection drives:

- `https://eget-769419892850.europe-west1.run.app/?simulate=rain`
- `https://eget-769419892850.europe-west1.run.app/?simulate=accident`
- `https://eget-769419892850.europe-west1.run.app/?simulate=trainalert`

(Swap in whichever deployed URL, or `http://localhost:8787`, is currently
live — the query param works the same everywhere.) It's a single-page app
(no reloads between screens), so the query param stays in the address bar
the whole time — no need to re-add it per screen. Since these are HTTPS
URLs, allowing the notification permission prompt also demos the real
push notification alongside the in-app card.

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
| OneMap routing + search | turn-by-turn directions, destination autocomplete, geocoding, the full MRT/LRT station list for "Near You" |
| data.gov.sg 2hr forecast + real-time rainfall | rain-aware routing and the reactive rain-swap prompt |

## Tech stack

- **Backend**: Node.js + Express (`backend/`), ES modules
- **Frontend**: Vanilla JS + Leaflet.js — no build step, served as static
  files directly by the backend
- **Maps**: OpenStreetMap tiles, dark-mode via CSS filter
- **Deployment**: Google Cloud Run (containerized via root `Dockerfile`)

## Project structure

```
.
├── Dockerfile               # Node 20-slim container setup for Cloud Run
├── Procfile                 # Command entrypoint for process managers (e.g. Heroku-style)
├── .env                     # Real API keys, gitignored — see .env.example
├── env.deploy.example.yaml  # Template for Cloud Run's --env-vars-file (YAML, not dotenv)
├── env.deploy.yaml          # Real deploy secrets, gitignored — copy from the template above
├── CLAUDE.md                # Orientation notes for AI-assisted work on this repo
├── backend/
│   ├── server.js            # Express app — serves frontend & every /api/* route
│   └── src/                 # LTA/OneMap/weather clients, route planning, decision logic, AI agents
└── frontend/                # index.html + app.js + styles.css + sw.js — static UI, no build step
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

Both `LTA_ACCOUNT_KEY` and `ONEMAP_TOKEN` are free, self-service signups
(links in `.env.example`) — no approval wait.

## Deployment to Google Cloud Run

The application deploys directly to Google Cloud Run using a containerized
Node.js environment. The root `Dockerfile` builds the backend server, and
Express serves the static frontend assets directly — nothing else to build
or configure.

### Prerequisites

1. Install the Google Cloud SDK (`gcloud` CLI).
2. Authenticate and select your target GCP project:

   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. Copy `env.deploy.example.yaml` to `env.deploy.yaml` and fill in the same
   real values that are in your local `.env`.

   > **Important:** Cloud Run's `--env-vars-file` needs **YAML** syntax
   > (`KEY: value`), not the `.env` file's dotenv syntax (`KEY=value`).
   > Pointing `--env-vars-file` straight at `.env` will fail to parse or
   > silently skip the variables — use `env.deploy.yaml`, not `.env`.
   >
   > Also don't put `PORT` in `env.deploy.yaml` — Cloud Run injects and
   > manages its own (defaults to `8080`); `server.js` already falls back
   > to `8080` on its own, and forcing a different value here makes the
   > container listen on the wrong port and fail Cloud Run's health check.

### Deploy command

Run this from the repository root (the same directory as `Dockerfile`):

```bash
gcloud run deploy eget \
  --source . \
  --region europe-west1 \
  --project YOUR_PROJECT_ID \
  --allow-unauthenticated \
  --env-vars-file=env.deploy.yaml
```

(On Windows PowerShell, either put it all on one line, or use PowerShell's
backtick `` ` `` for line continuation instead of `\` — a trailing backslash
isn't a continuation character there and will fail to parse.)

### What happens during deployment

1. `gcloud` uploads the repository sources to Google Cloud Storage.
2. Google Cloud Build executes the root `Dockerfile`, installing dependencies
   for `backend/`.
3. The container image is pushed to Artifact Registry and instantiated in
   Cloud Run.
4. Environment variables from `env.deploy.yaml` are injected into the
   container runtime.
5. The container binds to host `0.0.0.0` on the port Cloud Run assigns
   (`8080` by default) and serves the full application live.

## Team

Tang Nan · Jayasuryan Mutyala · Jie Hua · Moe