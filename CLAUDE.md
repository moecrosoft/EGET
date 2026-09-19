# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LTA Smart Mobility Hackathon — Problem Statement 2: "Smart Commuter Companion". EGET is a
mobile-first web app (no native build) for a commuter, built and deployed — see `README.md` for
what actually runs, the tech stack, and how to run it locally. Full brief:
`Problem_Statement_2_Specification.pdf`.

**Status:** working, deployed app. Backend is Node/Express (`backend/server.js` + `backend/src/`),
frontend is vanilla JS + Leaflet (`frontend/`), no build step. Live at the URL in `README.md`.

## Mandate

App must be proactive (warn before the disruption, not after), give decision support (a recommended
action, not just a status), cover both planned and unplanned disruptions, and be tailored to one chosen
commuter persona — not generic output.

## Persona

**Arjun** — multi-modal/flexible start, Punggol→one-north (cycles+LRT/bus). Optimizes comfort/crowding
over speed. This is the chosen persona; the fixed "Today" board is built around his exact route
(`backend/src/journeyPlanner.js`). The other two personas from the original brief (Rachel, fixed-schedule
Tampines→Raffles Place; Mdm Lim, accessibility-constrained Bedok→SGH) were considered but not built.

The general-purpose custom-destination search (`backend/src/routePlanner.js`, the "Where to?" screen)
applies the same comfort-first, reason-given philosophy to *any* origin/destination, not just Arjun's
fixed route — see README's "What it does" for specifics.

## Mandatory capabilities (missing any caps that score dimension at level 3)

1. **Route planning** — multi-modal where persona needs it, door-to-door (incl. walking legs), responsive
   to live disruptions/crowding/rain with a stated reason for changes, realistic timing with uncertainty shown.
2. **GIS on OpenStreetMap** — OSM is the required geospatial base. Built on Leaflet.js + plain OSM tiles
   (`{s}.tile.openstreetmap.org`), not a self-hosted tile server or OSRM/GraphHopper — fine for this
   scale, but don't hammer the public tile servers with automated/bulk requests. OneMap (Singapore gov,
   free token) handles routing and geocoding, not OSRM.
3. **Visualisation** — route on map with affected portion visually distinguished, alternative shown
   against the original, crowding readable at a glance (3-level scale), time/delay shown per option.

## Data sources & traps

- **LTA DataMall**: `datamall2.mytransport.sg/ltaodataservice/<endpoint>`, `AccountKey` header, pages
  500 rows via `$skip`. Key endpoint: `TrainServiceAlerts` — disruption detail nested in
  `AffectedSegments`; `Message` is a separate list with `Content`/`CreatedDate`.
- **Line codes are inconsistent across DataMall endpoints** — reconciling them is required work, not a
  bug. See `backend/src/lineCodes.js` (TrainServiceAlerts' 3-letter codes) and the `LINE_ALERT_CODE` /
  `LINE_COLORS` maps in `frontend/app.js` (OneMap's 2-letter codes) — two different vocabularies for the
  same lines, reconciled by hand since no single source gives both.
- **`PCDForecast`'s `TrainLine` parameter has only ever been verified live for `PLRT`** (Punggol LRT —
  see `journeyPlanner.js`). The six main lines' codes (NSL/EWL/CCL/DTL/TEL/NEL, used in
  `routePlanner.js`'s `findDelaySuggestion`) are from LTA's published docs, not independently confirmed,
  because the account's `PCDForecast` quota got rate-limited account-wide during development and stayed
  that way. If you hit `[ltaClient] crowd forecast` failures, check this before assuming it's a bug —
  it degrades gracefully (empty forecast, no crash) either way.
- **Crowding is three distinct signals**, not interchangeable: `PlatformCrowdDensityRealTime`,
  `PlatformCrowdDensityForecast`, and the bus-load field in `BusArrival`.
- `data/4dayWeatherForecast.json` / `data/24hourWeatherForecast.json` are OpenAPI **specs** for
  data.gov.sg endpoints, not weather data itself — reference material, not something any code reads.
- `TrainServiceAlerts.AffectedSegments` is empty on a normal day — do not build a demo that depends on
  a live disruption. Use `frontend/app.js`'s `?simulate=rain|accident|trainalert` query-param hook (see
  README) to demo the reactive-reroute flow without waiting for real conditions.

## Testing methodology

No automated test suite — verified by hitting real APIs directly (curl) and by headless-Chrome
screenshot checks of the actual running app (`node --watch backend/server.js`, then
`chrome --headless=new --screenshot=... http://localhost:8787/?...`), using temporary query-param
boot hooks in `frontend/app.js` that are always reverted after verifying, not left in place.

## Hard rules

- Never commit credentials — keys stay in `.env` (repo root, gitignored) or, for deployment,
  `env.deploy.yaml` (also gitignored — Cloud Run's `--env-vars-file` needs YAML, not dotenv syntax).
  Env vars actually read by the app: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `LTA_ACCOUNT_KEY`,
  `ONEMAP_TOKEN`, `PORT`, `MONITOR_INTERVAL_MS` — see `.env.example` for the annotated list. Don't
  reintroduce `OPENROUTER_API_KEY`/`QDRANT_*`-style vars unless something actually reads them; a
  previous unused RAG-pipeline scaffold that used them was removed.
- Do not scrape in breach of a site's ToS.
- Do not use personal data without stating what's stored, where, and for how long.
- App must run from a clean README on a judge's machine with no paid dependency required to verify it.
