from datetime import datetime, timezone, timedelta
from lta_client import train_service_alerts, bus_arrival, get_2hr_weather, get_rainfall, get_public_holidays, safe_call
from parsing import (
    parse_train_alerts, get_station_crowd, is_weather_ok_for_cycling, parse_bus_arrival,
    get_station_forecast, get_forecast_for_time, parse_public_holidays, is_public_holiday,
    is_school_vacation
)
from recommend import recommend_for_arjun, rank_options, find_better_departure_window, categorize_top_choices

SGT = timezone(timedelta(hours=8))


def run_live():
    """Pulls real, live data and prints ranked recommendations for Arjun."""
    raw = safe_call(train_service_alerts, fallback={"value": {"Status": 1, "AffectedSegments": [], "Message": []}})
    parsed = parse_train_alerts(raw)

    punggol_crowd = safe_call(get_station_crowd, "NEL", "NE17", fallback={"level": "NA"})
    serangoon_crowd = safe_call(get_station_crowd, "NEL", "NE12", fallback={"level": "NA"})

    weather = safe_call(get_2hr_weather, fallback=None)
    rainfall = safe_call(get_rainfall, fallback=None)
    cycling_ok = is_weather_ok_for_cycling(weather, rainfall_raw=rainfall) if weather else True

    bus_raw = safe_call(bus_arrival, "65259", fallback={"Services": []})
    bus_services = parse_bus_arrival(bus_raw)

    # Public holiday + school vacation check — both soften the forecast-based
    # nudges below, since PCDForecast reflects normal-weekday patterns that
    # don't hold on either kind of day.
    holidays_raw = safe_call(get_public_holidays, fallback={"result": {"records": []}})
    holiday_dates = parse_public_holidays(holidays_raw)
    today_str = datetime.now(SGT).date().isoformat()
    today_is_holiday = is_public_holiday(holiday_dates, today_str)
    today_is_school_vacation = is_school_vacation(today_str)

    is_atypical_day = today_is_holiday or today_is_school_vacation
    if today_is_holiday:
        atypical_reason = "public holiday"
    elif today_is_school_vacation:
        atypical_reason = "school vacation period"
    else:
        atypical_reason = ""

    # Proactive: check the forecast relative to the ACTUAL current time (not a
    # hardcoded hour), and scan ahead up to 60 min for a better window to leave.
    now_str = datetime.now(SGT).isoformat()
    punggol_forecast_slots = safe_call(get_station_forecast, "NEL", "NE17", fallback=[])
    forecast_now = get_forecast_for_time(punggol_forecast_slots, now_str)
    delay_suggestion = find_better_departure_window(punggol_forecast_slots, now_str, max_delay_minutes=60)

    recommendations = recommend_for_arjun(
        parsed, punggol_crowd, serangoon_crowd, cycling_ok, bus_services,
        forecast_level=forecast_now["level"],
        delay_suggestion=delay_suggestion,
        is_atypical_day=is_atypical_day,
        atypical_reason=atypical_reason
    )
    ranked = rank_options(recommendations)
    top_picks = categorize_top_choices(ranked)

    # Freshness timestamp: this data layer only ever returns a live snapshot —
    # it does not cache or know about connectivity state. When wrapped in an
    # API endpoint, this generated_at is what lets the frontend show "last
    # updated Xmin ago" or a stale-data banner if the commuter loses signal
    # underground (see WRITEUP.md for the full offline-behavior boundary).
    result = {
        "generated_at": now_str,
        "recommendations": ranked,
        "top_picks": top_picks
    }

    print(f"Ranked recommendations for Arjun (live data, generated {now_str}):")
    for opt, score in ranked:
        print(f" - [{score}] {opt['mode']}: {opt['reason']}")

    print("\nTop picks:")
    best = top_picks["best_overall"]
    comfy = top_picks["most_comfortable"]
    print(f" - Best Overall: {best[0]['mode']} — {best[0]['reason']}")
    print(f" - Most Comfortable: {comfy[0]['mode']} — {comfy[0]['reason']}")
    print(f" - Fastest: not shown — {top_picks['fastest_note']}")

    return result


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