from lta_client import train_service_alerts, bus_arrival, get_2hr_weather, safe_call
from parsing import (
    parse_train_alerts, get_station_crowd, is_weather_ok_for_cycling, parse_bus_arrival,
    get_station_forecast, get_forecast_for_time
)
from recommend import recommend_for_arjun, rank_options


def run_live():
    """Pulls real, live data and prints ranked recommendations for Arjun."""
    raw = safe_call(train_service_alerts, fallback={"value": {"Status": 1, "AffectedSegments": [], "Message": []}})
    parsed = parse_train_alerts(raw)

    punggol_crowd = safe_call(get_station_crowd, "NEL", "NE17", fallback={"level": "NA"})
    serangoon_crowd = safe_call(get_station_crowd, "NEL", "NE12", fallback={"level": "NA"})

    weather = safe_call(get_2hr_weather, fallback=None)
    cycling_ok = is_weather_ok_for_cycling(weather) if weather else True

    bus_raw = safe_call(bus_arrival, "65259", fallback={"Services": []})
    bus_services = parse_bus_arrival(bus_raw)

    # Proactive: what will Punggol look like at Arjun's usual 8:00 departure?
    punggol_forecast_slots = safe_call(get_station_forecast, "NEL", "NE17", fallback=[])
    forecast_at_8am = get_forecast_for_time(punggol_forecast_slots, "2026-09-18T08:00:00+08:00")

    recommendations = recommend_for_arjun(
        parsed, punggol_crowd, serangoon_crowd, cycling_ok, bus_services,
        forecast_level=forecast_at_8am["level"]
    )
    ranked = rank_options(recommendations)

    print("Ranked recommendations for Arjun (live data):")
    for opt, score in ranked:
        print(f" - [{score}] {opt['mode']}: {opt['reason']}")

    return ranked


# --- Saved test fixture: simulated disruption scenario ---
# Live conditions are quiet most days (per the brief), so this labelled
# fake-data scenario proves the logic actually differentiates when it
# matters. Keep this for the demo video.
def run_disrupted_test():
    """Injected/labelled test data simulating a real NEL disruption + crowded Punggol."""
    fake_disrupted_alerts = {
        "status": 2,
        "segments": [{"Line": "NEL", "Direction": "Both", "Stations": "NE12,NE13,NE14"}],
        "messages": []
    }
    fake_crowded_punggol = {"level": "h"}
    fake_serangoon_crowd = {"level": "h"}
    fake_bus_services = [{"service_no": "34", "load": "SEA", "wheelchair_accessible": True,
                           "bus_type": "SD", "estimated_arrival": ""}]

    recommendations = recommend_for_arjun(
        fake_disrupted_alerts, fake_crowded_punggol, fake_serangoon_crowd,
        cycling_ok=True, bus_services=fake_bus_services
    )
    ranked = rank_options(recommendations)

    print("\nRanked recommendations for Arjun (SIMULATED disruption — labelled test data):")
    for opt, score in ranked:
        print(f" - [{score}] {opt['mode']}: {opt['reason']}")

    return ranked


if __name__ == "__main__":
    run_live()
    run_disrupted_test()