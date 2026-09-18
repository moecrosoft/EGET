# WRITEUP — Data Integration & Decision Logic (Arjun)

*This covers the data integration and disruption/decision-logic component of the
PS2 submission. Routing/GIS, backend, and frontend/UI are documented separately by
the respective owners.*

## Persona: Arjun

Punggol → one-north commuter. Multi-modal (cycles to the LRT, takes NEL then changes
to Circle Line at Serangoon, sometimes takes a bus the whole way). Flexible start
time. Optimises for comfort and predictability over raw speed — willing to leave
later or take a slower option to avoid a crowded ride.

This component exists to answer, at any point in his morning window: **given current
and forecasted conditions, what should Arjun actually do right now, and why?**

## Architecture

```
LTA DataMall API  ─┐
data.gov.sg (2hr    │
weather, rainfall,  │
public holidays)   ─┼──> lta_client.py (raw calls, auth, error handling)
                    │           │
                    │           v
                    │      parsing.py (normalizes raw responses;
                    │                  also holds fixed 2026 school
                    │                  vacation date ranges)
                    │           │
                    │           v
                    └──>  recommend.py (scores & ranks door-to-door
                                travel options)
                                │
                                v
                          main.py (entry point / test harness)
```

**Data sources used:**
- `TrainServiceAlerts` — disruption status on NEL/CCL (`AffectedSegments`), plus daily
  advisories (`Message`) filtered to ones actually relevant to Arjun's route
- `PCDRealTime` — current crowd level at Punggol (NE17) and Serangoon (NE12)
- `PCDForecast` — forecasted crowd level at Punggol in 30-min intervals, used both to
  proactively warn Arjun when conditions are about to worsen, and to scan ahead for a
  genuinely better time to leave
- `v3/BusArrival` (stop 65259, Punggol Stn/Int) — next bus, load level (`SEA`/`SDA`/`LSD`),
  and vehicle type (`SD`/`DD`/`BD`) as an alternative mode
- data.gov.sg 2-hour weather forecast — scoped to the "Punggol" area
- data.gov.sg real-time rainfall — station S81 "Punggol Central", verified via the
  live station list to sit at coordinates 1.4028, 103.9095, essentially the same
  location as Punggol MRT. Overrides forecast *text* (which can be stale, e.g. "Partly
  Cloudy" while it's already raining) with an actual measured reading.
- data.gov.sg public holidays (MOM dataset `d_149b61ad0a22f61c09dc80f2df5bbec8`,
  Open Data Licence, free/no key) — verified live before use
- MOE school vacation dates for 2026 — no structured API exists for this on
  data.gov.sg (checked); these are the four officially published fixed date ranges
  from MOE's press release ("School Terms and Holidays for 2026", 30 Jul 2025),
  transcribed once and cited, not scraped live

**Decision logic:** each option is scored using a simple weighted system — low crowd
scores highest, an active disruption on the route applies a larger penalty, and a
forecasted worsening (even with calm real-time conditions) applies a smaller proactive
penalty. Options are ranked, and the top option is what the app would surface to
Arjun, each with a plain-language reason attached.

**Proactive delay suggestion:** Arjun's persona explicitly states he *"will happily
leave twenty minutes later to avoid a crush."* `find_better_departure_window()` scans
the forecast up to 60 minutes ahead of the actual current time and, when a meaningfully
quieter window exists, surfaces it as its own ranked option (e.g. *"wait 30min, leave
later: crowd expected to drop to 'l' from 'h'"*) rather than only warning about
worsening conditions.

**Atypical-day awareness:** on a public holiday or during a school vacation period,
`PCDForecast` still reflects normal-weekday demand patterns that don't actually hold
that day. On these days, the forecast-based "getting busier soon" warning and the
delay-suggestion option are both suppressed, and remaining options carry a note (e.g.
*"school vacation period — usual crowd forecast may not apply"*) instead of a
confident-but-wrong nudge.

**Daily advisory surfacing:** `TrainServiceAlerts.Message` is populated most days
(unlike `AffectedSegments`, which is empty on a normal day) — `find_relevant_messages()`
filters this stream to advisories that actually mention Arjun's lines/stations, and
surfaces the first match as part of the option's reason. This means the app has
something genuine to show even on a day with no real disruption, without needing
simulated data for this particular capability.

**Door-to-door routing:** every option now includes walk legs at each end — e.g.
`"walk 5min + LRT + walk 6min"`, `"walk 4min + Bus 34 + walk 6min"`,
`"cycle + LRT + walk 6min (to office)"` — rather than a station-to-station
recommendation, per the requirement that *"a route that starts at a station and ends
at a station is not a commuter's journey."* **Important honesty note:** the exact walk
minutes (`WALK_ESTIMATES_MIN` in `recommend.py`) are placeholder assumptions, not
computed from real distance/routing data — clearly labelled as such in both the code
and every affected option's reason text (`"[walk times are estimates, pending real
routing data]"`). Real figures would come from the routing/GIS component's OneMap/OSM
integration; this layer is structured so those real values can simply replace the
placeholder constants without changing the surrounding logic.

**No-signal-underground boundary:** the actual offline/caching behaviour (holding the
last journey, showing a stale-data banner) is a frontend/client-side decision, not
something this layer controls. This layer's contribution is a `generated_at`
timestamp on every live result (`run_live()` returns `{"generated_at": ..., "recommendations": ...}`),
so the frontend has what it needs to judge and display data freshness when connectivity
is lost. This layer does not itself cache anything — every call is a live snapshot.

## Assumptions

- Arjun's fixed route: Punggol (NE17) → NEL → Serangoon (NE12) → change to CCL →
  one-north. Only these two stations' crowd levels are checked.
- Bus alternative is anchored to a single fixed stop (65259, Punggol Stn/Int) rather
  than a dynamically determined nearest stop.
- Weather is checked for the "Punggol" area (2hr forecast text) plus real-time
  rainfall at station S81 — good enough for deciding whether Arjun should cycle,
  since that's the leg weather actually affects.
- Forecast checks and the delay-suggestion window are evaluated against the actual
  current time (Singapore time zone) at the moment the recommendation runs, not a
  fixed hour.
- Walk-leg minutes are placeholder estimates (see Door-to-door routing above), not
  yet backed by real routing data.

## What's real vs. simulated (for judging/demo transparency)

- All data-pulling and parsing was tested against **live, real API responses** — not
  assumed from documentation. In three cases (train alerts shape, crowd forecast
  shape, crowd forecast being empty on first attempt due to a shape mismatch) the
  real response differed meaningfully from what was expected, and the code was
  corrected to match the verified real shape rather than left on an assumption.
- Because live disruptions are rare, a **labelled, clearly-marked simulated disruption
  scenario** is included in `main.py` (`run_disrupted_test()`) using fabricated but
  realistically-shaped data, to demonstrate that the ranking logic correctly
  differentiates and re-prioritises the bus option when rail conditions worsen. This
  allowance is used *only* for the major-disruption path — the daily advisory
  (`Message`) surfacing, rainfall, and public-holiday/school-vacation logic all work
  against genuinely live data with no simulated allowance needed.

## Known limitations

- The recommendation function currently only covers Arjun's fixed route/stations —
  it is not yet generalised to arbitrary origin/destination pairs.
- The bus alternative only checks a single fixed stop (65259, hardcoded) and a single
  arriving service; it does not compare across multiple possible bus routes. Strong
  candidate for a handoff to routing/GIS: if `BusStopLocation` geospatial data is used
  there to find Arjun's actual nearest stop, that stop code could be passed into this
  layer's `bus_arrival()` call instead of the hardcoded one.
- Walk-leg minutes are estimates, not real routing data (see Door-to-door routing).
- Not yet wrapped as an API endpoint (planned next step, pending team integration)
  — currently runs as a script producing ranked output.
- No lift/accessibility-specific logic, since that matters more for a different
  persona (Mdm Lim) than for Arjun.

## Data layer boundary (geospatial data is intentionally out of scope here)

LTA's geospatial layers — `CoveredLinkWay` (sheltered walkways), `CyclingPath`,
`Footpath`, `PedestrainOverheadbridge_UnderPass`, `TrainStation`/`TrainStationExit`,
`BusStopLocation`, `TaxiStand` — are GeoJSON/shapefile spatial data, not REST
endpoints, and require spatial matching (e.g. via OSM/OneMap) rather than the simple
API calls this layer makes. These are deliberately out of scope for this component
and owned by the routing/GIS part of the submission. This layer's contribution to
that work is limited to supplying live signals routing can consume — specifically,
the `cycling_ok` weather/rainfall flag, which routing can use to decide whether to
prefer a sheltered path (`CoveredLinkWay`) over a faster uncovered one — and the
placeholder walk-leg structure, ready to be filled with real routing-derived minutes.

## Considered but not implemented

- **Walking to a different-line station instead of transferring underground** — in
  parts of Singapore's network, walking a short distance between two nearby stations
  on different lines can be faster than an in-station transfer. Arjun's actual
  transfer (Serangoon, NE12/CC13) is a same-station interchange between NEL and CCL,
  so this pattern doesn't apply to his route and wasn't built.
- **Stadium event data** — checked whether events near Stadium (CC6) on the Circle
  Line could affect Arjun's crowd levels. Serangoon (CC13) to one-north (CC23) travels
  the short way around the CCL loop and never passes through Stadium, so this genuinely
  doesn't apply to his specific route and wasn't built.