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
weather forecast)  ─┼──> lta_client.py (raw calls, auth, error handling)
                    │           │
                    │           v
                    │      parsing.py (normalizes raw responses)
                    │           │
                    │           v
                    └──>  recommend.py (scores & ranks travel options)
                                │
                                v
                          main.py (entry point / test harness)
```

**Data sources used:**
- `TrainServiceAlerts` — disruption status on NEL/CCL
- `PCDRealTime` — current crowd level at Punggol (NE17) and Serangoon (NE12)
- `PCDForecast` — forecasted crowd level at Punggol, used to proactively warn Arjun
  before conditions at his usual departure time actually get worse
- `v3/BusArrival` (stop 65259, Punggol Stn/Int) — next bus + load level as an
  alternative mode
- data.gov.sg 2-hour weather forecast — scoped to the "Punggol" area, used to decide
  whether cycling is a sensible option right now

**Decision logic:** each option (cycle+LRT, LRT only, bus) is scored using a simple
weighted system — low crowd scores highest, an active disruption on the route applies
a larger penalty, and a forecasted worsening (even with calm real-time conditions)
applies a smaller proactive penalty. Options are ranked, and the top option is what
the app would surface to Arjun, each with a plain-language reason attached (e.g.
*"heads up: forecast shows it getting busier soon, consider leaving now"*).

## Assumptions

- Arjun's fixed route: Punggol (NE17) → NEL → Serangoon (NE12) → change to CCL →
  one-north. Only these two stations' crowd levels are checked.
- Bus alternative is anchored to a single fixed stop (65259, Punggol Stn/Int) rather
  than a dynamically determined nearest stop.
- Weather is checked only for the "Punggol" area — good enough for deciding whether
  Arjun should cycle from home, since that's the leg weather actually affects.
- The 8:00am forecast slot is used as Arjun's reference "usual departure time" for
  the proactive warning; this is a placeholder until the actual UI passes in his
  real intended departure time.

## What's real vs. simulated (for judging/demo transparency)

- All data-pulling and parsing was tested against **live, real API responses** — not
  assumed from documentation. In two cases (train alerts shape, crowd forecast shape)
  the real response differed meaningfully from the official docs, and the parsing
  code was corrected to match the verified real shape.
- Because live disruptions are rare, a **labelled, clearly-marked simulated disruption
  scenario** is included in `main.py` (`run_disrupted_test()`) using fabricated but
  realistically-shaped data, to demonstrate that the ranking logic correctly
  differentiates and re-prioritises the bus option when rail conditions worsen.

## Known limitations

- The recommendation function currently only covers Arjun's fixed route/stations —
  it is not yet generalised to arbitrary origin/destination pairs.
- The bus alternative only checks a single fixed stop and a single arriving service;
  it does not compare across multiple possible bus routes.
- Not yet wrapped as an API endpoint (planned next step, pending team integration)
  — currently runs as a script producing ranked output.
- No lift/accessibility-specific logic, since that matters more for a different
  persona (Mdm Lim) than for Arjun.

## Considered but not implemented

- **Walking to a different-line station instead of transferring underground** — in
  parts of Singapore's network, walking a short distance between two nearby stations
  on different lines can be faster than an in-station transfer. We considered adding
  this as a general fallback, but Arjun's actual transfer (Serangoon, NE12/CC13) is
  a same-station interchange between NEL and CCL, so this pattern doesn't apply to
  his route and wasn't built. It would require real walking-distance data between
  station exits (OSM/OneMap), which sits with the routing/GIS component rather than
  this data/decision-logic layer. Worth revisiting generically if the app is extended
  beyond Arjun's fixed route.