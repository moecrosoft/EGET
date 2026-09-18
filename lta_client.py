import os
import requests
from dotenv import load_dotenv

load_dotenv()

BASE = "https://datamall2.mytransport.sg/ltaodataservice"
HEADERS = {
    "AccountKey": os.environ["LTA_ACCOUNT_KEY"],
    "accept": "application/json"
}


def get(endpoint, params=None):
    r = requests.get(f"{BASE}/{endpoint}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def train_service_alerts():
    return get("TrainServiceAlerts")


def crowd_realtime(line_code):
    return get("PCDRealTime", {"TrainLine": line_code})


def crowd_forecast(line_code):
    return get("PCDForecast", {"TrainLine": line_code})


def bus_arrival(bus_stop_code):
    return get("v3/BusArrival", {"BusStopCode": bus_stop_code})


def get_2hr_weather():
    r = requests.get("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast")
    r.raise_for_status()
    return r.json()


def get_rainfall():
    r = requests.get("https://api-open.data.gov.sg/v2/real-time/api/rainfall")
    r.raise_for_status()
    return r.json()


def get_public_holidays():
    """
    Official MOM public holidays dataset via data.gov.sg, verified live:
    https://data.gov.sg/datasets/d_149b61ad0a22f61c09dc80f2df5bbec8/view
    Free, no key required, Open Data Licence.
    """
    url = "https://data.gov.sg/api/action/datastore_search?resource_id=d_149b61ad0a22f61c09dc80f2df5bbec8"
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


def safe_call(func, *args, fallback=None, **kwargs):
    """Runs an API call safely — returns fallback instead of crashing if it fails."""
    try:
        return func(*args, **kwargs)
    except Exception as e:
        print(f"[warning] {func.__name__} failed: {e}")
        return fallback