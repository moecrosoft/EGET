# Arjun Data & Decision Service — PS2 Smart Commuter Companion

This is the data integration and disruption/decision-logic component of our PS2 submission,
built for the **Arjun** persona (Punggol → one-north, multi-modal, flexible start time,
optimises for comfort/crowding over raw speed).

It pulls live data from LTA DataMall and data.gov.sg, and produces a ranked, reasoned,
door-to-door set of travel recommendations for Arjun's morning commute.

## Prerequisites

- Python 3.10+
- A free LTA DataMall **API Account Key** — register at https://datamall.lta.gov.sg
  (this is the *API Account Key* for the REST API, not the separate "Extended OBU
  Library SDK Key" which LTA may also offer on the same site — that one is unrelated
  and not used here)
- No key needed for data.gov.sg endpoints (weather, rainfall, public holidays)

## Setup

1. Clone/download this folder.
2. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   venv\Scripts\activate      # Windows
   source venv/bin/activate   # Mac/Linux
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root with:
   ```
   LTA_ACCOUNT_KEY=your_actual_key_here
   ```

## Running it

```
python main.py
```

This runs two scenarios:

1. **Live data** — pulls real, current data and prints Arjun's ranked, door-to-door
   recommendations (walk+cycle+LRT, walk+LRT, walk+bus).
2. **Simulated disruption** — a saved, labelled test fixture with fake disrupted/crowded
   conditions, included because live disruptions are rare during testing/judging. This
   proves the recommendation logic actually reacts and re-ranks when conditions worsen.

## Project structure

| File | Purpose |
|---|---|
| `lta_client.py` | Raw API calls: LTA DataMall (train alerts, real-time crowd, crowd forecast, bus arrival) and data.gov.sg (2hr weather, rainfall, public holidays). Includes `safe_call()` for graceful failure handling. |
| `parsing.py` | Normalizes raw API responses into clean internal data structures; also holds the fixed 2026 school vacation date ranges. |
| `recommend.py` | Core decision logic — scores and ranks door-to-door travel options for Arjun. |
| `main.py` | Entry point — runs the live pipeline and the disruption test fixture. |
| `requirements.txt` | Pinned Python dependencies (`requests`, `python-dotenv`) — install with `pip install -r requirements.txt`. |

## Integration point for the team

The function your part of the app should call is:

```python
from recommend import recommend_for_arjun, rank_options

recommendations = recommend_for_arjun(
    train_alerts,       # from parse_train_alerts()
    punggol_crowd,       # from get_station_crowd("NEL", "NE17")
    serangoon_crowd,      # from get_station_crowd("NEL", "NE12")
    cycling_ok,            # from is_weather_ok_for_cycling(weather, rainfall_raw=rainfall)
    bus_services,           # from parse_bus_arrival()
    forecast_level=None,     # optional, from get_forecast_for_time()
    delay_suggestion=None,    # optional, from find_better_departure_window()
    is_atypical_day=False,     # optional — True on a public holiday or school vacation day
    atypical_reason="",         # optional — "public holiday" or "school vacation period"
    walk_estimates=None          # optional — overrides the default placeholder walk minutes
)
ranked = rank_options(recommendations)
```

`ranked` is a list of `(option_dict, score)` tuples, sorted best-first, where each
`option_dict` has `mode` (now door-to-door, e.g. `"walk 5min + LRT + walk 6min"`),
`crowd_level`, and `reason` (human-readable explanation, including any relevant daily
advisory from `TrainServiceAlerts.Message` and a note when walk times are estimates).

For a simplified three-way view instead of the full list:
```python
from recommend import categorize_top_choices

top_picks = categorize_top_choices(ranked)
# top_picks["best_overall"]       -> (option_dict, score) tuple, or None if ranked is empty
# top_picks["most_comfortable"]   -> (option_dict, score) tuple, lowest crowd_level
# top_picks["fastest"]            -> always None currently — no real transit duration data
#                                     exists in this layer yet (walk minutes are estimates,
#                                     not ride time). See top_picks["fastest_note"].
```

`run_live()` in `main.py` returns `{"generated_at": <ISO timestamp>, "recommendations": ranked, "top_picks": top_picks}`
— the timestamp is there so a caller (frontend) can judge data freshness, e.g. for the
no-signal-underground case (see WRITEUP.md).

## Known assumptions

- Arjun's route is fixed as: Punggol (NE17) → North East Line → Serangoon (NE12) →
  change to Circle Line → one-north.
- Bus alternative uses bus stop `65259` (Punggol Stn/Int) as a fixed origin point.
- Weather check is scoped to the "Punggol" area (2hr forecast) plus real-time rainfall
  at station S81 "Punggol Central" (verified near-identical coordinates to Punggol MRT).
- Walk-leg minutes (`WALK_ESTIMATES_MIN` in `recommend.py`) are placeholder estimates,
  not computed from real routing data — see WRITEUP.md for the full boundary explanation.
- School vacation dates are hardcoded for 2026 from MOE's official press release (no
  clean API exists for this on data.gov.sg — checked).