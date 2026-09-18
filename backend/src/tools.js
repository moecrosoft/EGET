import { getTrainAlerts, getBusArrivals, getAlternateRoutes, getStationStatus } from "./ltaClient.js";
import { getWeather } from "./weatherClient.js";

// Tool schemas passed to the Anthropic API. Keep descriptions concrete —
// the agent decides when to call these based purely on these strings.
export const toolDefinitions = [
  {
    name: "get_train_alerts",
    description:
      "Get current MRT/LRT service disruptions across all lines (NSL, EWL, CCL, DTL, TEL, NEL, BPL). Call this whenever the commuter asks about delays, disruptions, or 'is my line okay'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_bus_arrivals",
    description:
      "Get live next-bus arrival times for a specific bus stop code (5-digit LTA bus stop code).",
    input_schema: {
      type: "object",
      properties: {
        busStopCode: { type: "string", description: "5-digit LTA bus stop code, e.g. '83139'" },
      },
      required: ["busStopCode"],
    },
  },
  {
    name: "get_alternate_routes",
    description:
      "Given active disruptions, suggest alternate ways to travel between two stations/areas. Use when a commuter's usual route is affected.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Origin station or area name" },
        to: { type: "string", description: "Destination station or area name" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_station_status",
    description: "Get current estimated crowd level at a named MRT/LRT station.",
    input_schema: {
      type: "object",
      properties: {
        station: { type: "string", description: "Station name, e.g. 'Jurong East'" },
      },
      required: ["station"],
    },
  },
  {
    name: "get_weather",
    description:
      "Get the current 2-hour weather nowcast for Singapore, including whether rain is expected soon. Call this when a commuter asks about walking/cycling to a station, or whether they should bring an umbrella.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export async function executeTool(name, input) {
  switch (name) {
    case "get_train_alerts":
      return getTrainAlerts();
    case "get_bus_arrivals":
      return getBusArrivals(input.busStopCode);
    case "get_alternate_routes":
      return getAlternateRoutes(input);
    case "get_station_status":
      return getStationStatus(input.station);
    case "get_weather":
      return getWeather();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
