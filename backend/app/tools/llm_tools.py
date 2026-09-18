from typing import Any

from langchain_core.tools import tool

import lta_client as lta_client


@tool
def get_train_service_alerts() -> dict[str, Any]:
    """Get current official LTA train service alerts."""
    return lta_client.train_service_alerts()


@tool
def get_realtime_crowding(line_code: str) -> dict[str, Any]:
    """Get current real-time platform crowding for an MRT/LRT line."""
    return lta_client.crowd_realtime(line_code)


@tool
def get_crowding_forecast(line_code: str) -> dict[str, Any]:
    """Get forecast platform crowding for an MRT/LRT line."""
    return lta_client.crowd_forecast(line_code)


@tool
def get_bus_arrival(bus_stop_code: str) -> dict[str, Any]:
    """Get live bus arrival information for a Singapore bus stop."""
    return lta_client.bus_arrival(bus_stop_code)


@tool
def get_weather_forecast() -> dict[str, Any]:
    """Get the current 2-hour weather forecast for Singapore."""
    return lta_client.get_2hr_weather()


@tool
def get_rainfall() -> dict[str, Any]:
    """Get current rainfall information in Singapore."""
    return lta_client.get_rainfall()


@tool
def get_public_holidays() -> dict[str, Any]:
    """Get Singapore public holiday information."""
    return lta_client.get_public_holidays()