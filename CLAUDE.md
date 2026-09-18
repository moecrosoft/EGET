# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LTA Smart Mobility Hackathon — Problem Statement 2: "Smart Commuter Companion". Mobile-first web app
(no native build) for a commuter, not an operator. Full brief: `Problem_Statement_2_Specification.pdf`.

**Status:** no code or tooling exists yet. Repo currently holds only the spec PDF, two data.gov.sg
weather OpenAPI specs, and `.env`. Once a stack is chosen, add real build/lint/test commands here.

## Mandate

App must be proactive (warn before the disruption, not after), give decision support (a recommended
action, not just a status), cover both planned and unplanned disruptions, and be tailored to one chosen
commuter persona — not generic output.

## Persona

Must build for exactly one (not yet chosen — update this once decided):
- **Rachel** — fixed-schedule, Tampines→Raffles Place (EWL), leaves 07:40. Interrupt only when it matters, one line.
- **Arjun** — multi-modal/flexible start, Punggol→one-north (cycles+LRT/bus). Optimizes comfort/crowding over speed.
- **Mdm Lim** — accessibility-constrained, Bedok→Singapore General Hospital. Needs lifts, sheltered walkways, large text, day-before warnings.

## Mandatory capabilities (missing any caps that score dimension at level 3)

1. **Route planning** — multi-modal where persona needs it, door-to-door (incl. walking legs), responsive
   to live disruptions/crowding/rain with a stated reason for changes, realistic timing with uncertainty shown.
2. **GIS on OpenStreetMap** — OSM is the required geospatial base. Must display
   "(c) OpenStreetMap contributors" wherever map/derived data is shown. Do not hammer public tile
   servers or the public Overpass instance — self-host tiles/use a provider key, cache Overpass queries.
3. **Visualisation** — route on map with affected portion visually distinguished, alternative shown
   against the original, crowding readable at a glance (3-level scale), time/delay shown per option.

## Data sources & traps

- **LTA DataMall**: `datamall2.mytransport.sg/ltaodataservice/<endpoint>`, `AccountKey` header, pages
  500 rows via `$skip`. Key endpoint: `TrainServiceAlerts` — disruption detail nested in
  `AffectedSegments`; `Message` is a separate list with `Content`/`CreatedDate`.
- **Line codes are inconsistent across DataMall endpoints** — reconciling them is required work, not a bug.
- **Crowding is three distinct signals**, not interchangeable: `PlatformCrowdDensityRealTime`,
  `PlatformCrowdDensityForecast`, and the bus-load field in `BusArrival`.
- `data/4dayWeatherForecast.json` / `data/24hourWeatherForecast.json` are OpenAPI **specs** for
  data.gov.sg endpoints, not weather data itself.
- `TrainServiceAlerts.AffectedSegments` is empty on a normal day — do not build a demo that depends on
  a live disruption; injected/replay test data is fine if clearly labelled as such.
- OSM data: Geofabrik extract for bulk SG data, Overpass API for targeted queries, OSRM/GraphHopper/Valhalla
  for routing, Leaflet/MapLibre GL JS for rendering.

## Hard rules

- Never commit credentials — keys stay in `.env` (already present locally; keep it gitignored once a
  git repo is initialized). Env vars in use: `OPENAI_API_KEY`, `LTA_DATAMALL_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`.
- Do not scrape in breach of a site's ToS.
- Do not use personal data without stating what's stored, where, and for how long.
- App must run from a clean README on a judge's machine with no paid dependency required to verify it.
