from datetime import datetime
from lta_client import crowd_realtime, crowd_forecast


def parse_train_alerts(raw):
    value = raw["value"]
    return {
        "status": value["Status"],  # 1 = normal, 2 = disrupted
        "segments": value.get("AffectedSegments", []),
        "messages": value.get("Message", [])
    }


def parse_crowd_data(raw):
    """Turns the raw list into a dict keyed by station code, for easy lookup."""
    readings = {}
    for entry in raw.get("value", []):
        readings[entry["Station"]] = {
            "level": entry["CrowdLevel"],   # could be 'l', 'm', 'h', or 'NA' — don't assume
            "start_time": entry["StartTime"],
            "end_time": entry["EndTime"]
        }
    return readings


def get_station_crowd(line_code, station_code):
    """Fetch crowd data for a line, return the level for one specific station."""
    raw = crowd_realtime(line_code)
    parsed = parse_crowd_data(raw)
    return parsed.get(station_code, {"level": "NA"})  # station might not be in response — handle that


def is_weather_ok_for_cycling(weather_raw, area="Punggol"):
    """Checks the forecast for a specific area only — defaults to Punggol for Arjun."""
    bad_keywords = ["rain", "shower", "thundery"]
    try:
        forecasts = weather_raw["data"]["items"][0]["forecasts"]
    except (KeyError, IndexError):
        return True  # can't read it, default to "assume ok" rather than crash

    for f in forecasts:
        if f.get("area") == area:
            forecast_text = f.get("forecast", "").lower()
            return not any(keyword in forecast_text for keyword in bad_keywords)

    return True  # area not found in response, fall back to "assume ok"


def parse_crowd_forecast(raw):
    """Groups forecast entries by station, each with a list of 30-min time-slot readings.
    Verified real shape: value -> [ {Date, Stations: [ {Station, Interval: [{Start, CrowdLevel}]} ]} ]"""
    forecast_by_station = {}
    for date_entry in raw.get("value", []):
        for station_entry in date_entry.get("Stations", []):
            station = station_entry.get("Station")
            intervals = [
                {"start_time": i.get("Start"), "level": i.get("CrowdLevel")}
                for i in station_entry.get("Interval", [])
            ]
            forecast_by_station[station] = intervals
    return forecast_by_station


def get_station_forecast(line_code, station_code):
    """Fetch the full day's forecast slots for one station."""
    raw = crowd_forecast(line_code)
    parsed = parse_crowd_forecast(raw)
    return parsed.get(station_code, [])


def get_forecast_for_time(forecast_slots, target_time_str):
    """Given a list of {start_time, level} slots and a target ISO time string,
    return the slot whose window contains (or is closest before) that time."""
    if not forecast_slots:
        return {"level": "NA"}

    target = datetime.fromisoformat(target_time_str)
    best_match = forecast_slots[0]
    for slot in forecast_slots:
        slot_time = datetime.fromisoformat(slot["start_time"])
        if slot_time <= target:
            best_match = slot
        else:
            break
    return best_match


def parse_bus_arrival(raw):
    """Extract the next bus per service, with load info."""
    services = []
    for svc in raw.get("Services", []):
        next_bus = svc.get("NextBus", {})
        services.append({
            "service_no": svc.get("ServiceNo"),
            "load": next_bus.get("Load"),          # SEA/SDA/LSD
            "wheelchair_accessible": next_bus.get("Feature") == "WAB",
            "bus_type": next_bus.get("Type"),        # SD/DD/BD
            "estimated_arrival": next_bus.get("EstimatedArrival")
        })
    return services