# Arjun Data & Decision Service — PS2 Smart Commuter Companion

This is the data integration and disruption/decision-logic component of our PS2 submission,
built for the **Arjun** persona (Punggol → one-north, multi-modal, flexible start time,
optimises for comfort/crowding over raw speed).

It pulls live data from LTA DataMall and data.gov.sg, and produces a ranked, reasoned
set of travel recommendations (cycle+LRT / LRT / bus) for Arjun's morning commute.

## Prerequisites

- Python 3.10+
- A free LTA DataMall **API Account Key** — register at https://datamall.lta.gov.sg
  (this is the *API Account Key* for the REST API, not the separate "Extended OBU
  Library SDK Key" which LTA may also offer on the same site — that one is unrelated
  and not used here)

## Setup

1. Clone/download this folder.
2. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   venv\Scripts\activate      # Windows
   source venv/bin/activate   # Mac/Linux
   pip install requests python-dotenv
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

1. **Live data** — pulls real, current LTA/weather data and prints Arjun's ranked
   recommendations (cycle+LRT, LRT only, bus).
2. **Simulated disruption** — a saved, labelled test fixture with fake disrupted/crowded
   conditions, included because live disruptions are rare during testing/judging. This
   proves the recommendation logic actually reacts and re-ranks when conditions worsen.

## Project structure

| File | Purpose |
|---|---|
| `lta_client.py` | Raw API calls to LTA DataMall and data.gov.sg (train alerts, real-time crowd, crowd forecast, bus arrival, weather). Includes `safe_call()` for graceful failure handling. |
| `parsing.py` | Normalizes raw API responses into clean internal data structures. |
| `recommend.py` | Core decision logic — scores and ranks travel options for Arjun. |
| `main.py` | Entry point — runs the live pipeline and the disruption test fixture. |

## Integration point for the team

The function your part of the app should call is:

```python
from recommend import recommend_for_arjun, rank_options

recommendations = recommend_for_arjun(
    train_alerts,      # from parse_train_alerts()
    punggol_crowd,      # from get_station_crowd("NEL", "NE17")
    serangoon_crowd,     # from get_station_crowd("NEL", "NE12")
    cycling_ok,           # from is_weather_ok_for_cycling()
    bus_services,          # from parse_bus_arrival()
    forecast_level=None     # optional, from get_forecast_for_time()
)
ranked = rank_options(recommendations)
```

`ranked` is a list of `(option_dict, score)` tuples, sorted best-first, where each
`option_dict` has `mode`, `crowd_level`, and `reason` (human-readable explanation).

## Known assumptions

- Arjun's route is fixed as: Punggol (NE17) → North East Line → Serangoon (NE12) →
  change to Circle Line → one-north.
- Bus alternative uses bus stop `65259` (Punggol Stn/Int) as a fixed origin point.
- Weather check is scoped to the "Punggol" area from the 2-hour forecast.