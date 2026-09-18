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


def is_weather_ok_for_cycling(weather_raw, area="Punggol", rainfall_raw=None, rainfall_station_id="S81"):
    """
    Checks the forecast text for a specific area (defaults to Punggol for Arjun).
    If rainfall_raw is also given (from get_rainfall()), checks the ACTUAL
    real-time reading from station S81 "Punggol Central" (verified nearly
    identical coordinates to Punggol MRT) as a stronger, more accurate signal
    than forecast text alone — a forecast can say "cloudy" while it's already
    raining right now.
    """
    bad_keywords = ["rain", "shower", "thundery"]
    forecast_ok = True
    try:
        forecasts = weather_raw["data"]["items"][0]["forecasts"]
        for f in forecasts:
            if f.get("area") == area:
                forecast_text = f.get("forecast", "").lower()
                forecast_ok = not any(keyword in forecast_text for keyword in bad_keywords)
                break
    except (KeyError, IndexError, TypeError):
        forecast_ok = True  # can't read it, default to "assume ok" rather than crash

    if rainfall_raw is not None:
        rainfall_mm = parse_rainfall(rainfall_raw, rainfall_station_id)
        if rainfall_mm is not None and rainfall_mm > 0:
            return False  # actually raining right now — overrides forecast text

    return forecast_ok


def parse_rainfall(raw, station_id="S81"):
    """
    Returns the latest rainfall reading (mm, 5-min total) for one station,
    or None if not found. Defaults to station S81 "Punggol Central" — verified
    against the live station list to be at coordinates 1.4028, 103.9095,
    essentially the same location as Punggol MRT.
    """
    readings = raw.get("data", {}).get("readings", [])
    if not readings:
        return None
    latest = readings[-1]  # readings are chronological; last entry is most recent
    for entry in latest.get("data", []):
        if entry.get("stationId") == station_id:
            return entry.get("value")
    return None


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


def parse_public_holidays(raw):
    """Returns a set of holiday date strings (YYYY-MM-DD) from the raw API response."""
    records = raw.get("result", {}).get("records", [])
    return {r["date"] for r in records if "date" in r}


def is_public_holiday(holiday_dates, date_str):
    """date_str should be YYYY-MM-DD (e.g. from datetime.now().date().isoformat())."""
    return date_str in holiday_dates


# School vacation periods for 2026, MOE (Primary & Secondary calendar), as
# officially published in MOE's press release "School Terms and Holidays for
# 2026" (30 Jul 2025): https://www.moe.gov.sg/news/press-releases/20250730-school-terms-and-holidays-for-2026
# No structured API exists for this on data.gov.sg (checked) — these are the
# four officially published fixed date ranges, transcribed once, not scraped
# live. Cited here per the brief's requirement to note source for "other data."
SCHOOL_VACATION_2026 = [
    ("2026-03-14", "2026-03-22"),  # Between Terms I & II
    ("2026-05-30", "2026-06-28"),  # Between Semesters I & II
    ("2026-09-05", "2026-09-13"),  # Between Terms III & IV
    ("2026-11-21", "2026-12-31"),  # End of school year
]


def is_school_vacation(date_str, vacation_ranges=SCHOOL_VACATION_2026):
    """date_str should be YYYY-MM-DD. Checks against the fixed 2026 MOE vacation ranges."""
    for start, end in vacation_ranges:
        if start <= date_str <= end:
            return True
    return False


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