// Realistic stand-ins for LTA DataMall responses, normalized to the same
// shape our own code (and the agent's tools) expect from the real API.
// Swap in a real LTA_ACCOUNT_KEY in .env and ltaClient.js will use live data
// instead of any of this automatically.

export const LINE_NAMES = {
  NSL: "North South Line",
  EWL: "East West Line",
  CCL: "Circle Line",
  DTL: "Downtown Line",
  TEL: "Thomson-East Coast Line",
  NEL: "North East Line",
  BPL: "Bukit Panjang LRT",
};

// A rotating set of scenarios so a demo can show "normal" and "disrupted"
// states without restarting the server. Call nextScenario() to advance.
const scenarios = [
  // 0: all clear
  [],
  // 1: single-line delay
  [
    {
      line: "NSL",
      lineName: LINE_NAMES.NSL,
      status: "disrupted",
      severity: "delay",
      direction: "Both directions",
      affectedStations: ["Jurong East", "Bukit Batok", "Bishan"],
      message:
        "Train service between Jurong East and Bishan is delayed by about 10 minutes due to a signalling fault. Additional travelling time of around 15 minutes.",
      freeBusBridging: false,
      freeShuttle: false,
      updatedAt: new Date().toISOString(),
    },
  ],
  // 2: major disruption with bridging
  [
    {
      line: "EWL",
      lineName: LINE_NAMES.EWL,
      status: "disrupted",
      severity: "major",
      direction: "Towards Pasir Ris",
      affectedStations: ["Tanah Merah", "Simei", "Tampines", "Pasir Ris"],
      message:
        "No train service between Tanah Merah and Pasir Ris due to a track fault. Free bus bridging services are available. Please add 30-40 minutes to your journey.",
      freeBusBridging: true,
      freeShuttle: false,
      updatedAt: new Date().toISOString(),
    },
    {
      line: "CCL",
      lineName: LINE_NAMES.CCL,
      status: "normal",
      severity: "none",
      direction: null,
      affectedStations: [],
      message: "Service is running normally.",
      freeBusBridging: false,
      freeShuttle: false,
      updatedAt: new Date().toISOString(),
    },
  ],
];
let scenarioIndex = 1;

export function nextScenario() {
  scenarioIndex = (scenarioIndex + 1) % scenarios.length;
  return scenarioIndex;
}

export function getMockTrainAlerts() {
  return scenarios[scenarioIndex];
}

const MOCK_BUS_ARRIVALS_CATALOGUE = {
  "83139": {
    busStopCode: "83139",
    description: "Opp Bukit Batok Stn",
    services: [
      { serviceNo: "961", nextArrivalMins: 3, nextArrival2Mins: 14, load: "SEA" },
      { serviceNo: "990", nextArrivalMins: 7, nextArrival2Mins: 21, load: "SDA" },
    ],
  },
  "01012": {
    busStopCode: "01012",
    description: "Hotel Grand Pacific",
    services: [
      { serviceNo: "56", nextArrivalMins: 2, nextArrival2Mins: 12, load: "SEA" },
      { serviceNo: "133", nextArrivalMins: 9, nextArrival2Mins: 24, load: "LSD" },
    ],
  },
  "28009": {
    busStopCode: "28009",
    description: "Jurong East Stn Exit A",
    services: [
      { serviceNo: "51", nextArrivalMins: 4, nextArrival2Mins: 16, load: "SEA" },
      { serviceNo: "97", nextArrivalMins: 6, nextArrival2Mins: 19, load: "SDA" },
    ],
  },
  "09048": {
    busStopCode: "09048",
    description: "Orchard Stn Exit 3",
    services: [
      { serviceNo: "7", nextArrivalMins: 2, nextArrival2Mins: 11, load: "SEA" },
      { serviceNo: "106", nextArrivalMins: 8, nextArrival2Mins: 22, load: "SDA" },
    ],
  },
};

export function getMockBusArrivals(busStopCode) {
  return (
    MOCK_BUS_ARRIVALS_CATALOGUE[busStopCode] || {
      busStopCode,
      description: "Unknown bus stop (mock data has no record)",
      services: [],
    }
  );
}

// Coordinates for the same stops in MOCK_BUS_ARRIVALS_CATALOGUE, used only
// when there's no live LTA_ACCOUNT_KEY to fetch the real /BusStops dataset.
export const MOCK_BUS_STOPS = [
  { busStopCode: "83139", description: "Opp Bukit Batok Stn", latitude: 1.3492, longitude: 103.7496 },
  { busStopCode: "01012", description: "Hotel Grand Pacific", latitude: 1.2966, longitude: 103.8558 },
  { busStopCode: "28009", description: "Jurong East Stn Exit A", latitude: 1.3329, longitude: 103.7436 },
  { busStopCode: "09048", description: "Orchard Stn Exit 3", latitude: 1.3037, longitude: 103.8318 },
];

// ponytail: a hand-picked subset of stations (not the full ~140), since the
// real dataset (LTA's Geospatial Whole Island) ships as a shapefile in a zip
// that needs extra parsing libraries. Upgrade path: fetch+parse that dataset
// if "nearest station" needs full network coverage.
export const MRT_STATIONS = [
  { name: "Jurong East", lines: ["NSL", "EWL"], latitude: 1.3329, longitude: 103.7436 },
  { name: "Bukit Batok", lines: ["NSL"], latitude: 1.3492, longitude: 103.7496 },
  { name: "Bishan", lines: ["NSL", "CCL"], latitude: 1.3510, longitude: 103.8486 },
  { name: "Dhoby Ghaut", lines: ["NSL", "NEL", "CCL"], latitude: 1.2989, longitude: 103.8456 },
  { name: "City Hall", lines: ["NSL", "EWL"], latitude: 1.2931, longitude: 103.8520 },
  { name: "Raffles Place", lines: ["NSL", "EWL"], latitude: 1.2836, longitude: 103.8514 },
  { name: "Orchard", lines: ["NSL"], latitude: 1.3041, longitude: 103.8318 },
  { name: "Novena", lines: ["NSL"], latitude: 1.3204, longitude: 103.8438 },
  { name: "Ang Mo Kio", lines: ["NSL"], latitude: 1.3699, longitude: 103.8496 },
  { name: "Woodlands", lines: ["NSL", "TEL"], latitude: 1.4370, longitude: 103.7864 },
  { name: "Tampines", lines: ["EWL", "DTL"], latitude: 1.3546, longitude: 103.9437 },
  { name: "Pasir Ris", lines: ["EWL"], latitude: 1.3730, longitude: 103.9494 },
  { name: "Tanah Merah", lines: ["EWL"], latitude: 1.3274, longitude: 103.9464 },
  { name: "Changi Airport", lines: ["EWL"], latitude: 1.3572, longitude: 103.9879 },
  { name: "Bugis", lines: ["EWL", "DTL"], latitude: 1.3006, longitude: 103.8559 },
  { name: "Buona Vista", lines: ["EWL", "CCL"], latitude: 1.3070, longitude: 103.7904 },
  { name: "HarbourFront", lines: ["NEL", "CCL"], latitude: 1.2653, longitude: 103.8220 },
  { name: "Serangoon", lines: ["NEL", "CCL"], latitude: 1.3496, longitude: 103.8732 },
  { name: "Punggol", lines: ["NEL"], latitude: 1.4054, longitude: 103.9022 },
  { name: "Sengkang", lines: ["NEL"], latitude: 1.3915, longitude: 103.8951 },
  { name: "Little India", lines: ["NEL", "DTL"], latitude: 1.3067, longitude: 103.8493 },
  { name: "Chinatown", lines: ["NEL", "DTL"], latitude: 1.2846, longitude: 103.8440 },
  { name: "Botanic Gardens", lines: ["DTL", "CCL"], latitude: 1.3221, longitude: 103.8155 },
  { name: "Newton", lines: ["NSL", "DTL"], latitude: 1.3127, longitude: 103.8384 },
  { name: "MacPherson", lines: ["CCL", "DTL"], latitude: 1.3266, longitude: 103.8901 },
  { name: "Paya Lebar", lines: ["EWL", "CCL"], latitude: 1.3179, longitude: 103.8925 },
  { name: "Marina Bay", lines: ["NSL", "CCL", "TEL"], latitude: 1.2762, longitude: 103.8544 },
  { name: "Outram Park", lines: ["EWL", "NEL", "TEL"], latitude: 1.2807, longitude: 103.8394 },
  { name: "Caldecott", lines: ["CCL", "TEL"], latitude: 1.3378, longitude: 103.8395 },
  { name: "Stevens", lines: ["DTL", "TEL"], latitude: 1.3199, longitude: 103.8258 },
  { name: "Choa Chu Kang", lines: ["NSL", "BPL"], latitude: 1.3854, longitude: 103.7443 },
  { name: "Bukit Panjang", lines: ["DTL", "BPL"], latitude: 1.3789, longitude: 103.7622 },
  { name: "Clementi", lines: ["EWL"], latitude: 1.3151, longitude: 103.7650 },
  { name: "Dover", lines: ["EWL"], latitude: 1.3114, longitude: 103.7786 },
  { name: "one-north", lines: ["CCL"], latitude: 1.2998, longitude: 103.7876 },
  { name: "Kent Ridge", lines: ["CCL"], latitude: 1.2933, longitude: 103.7845 },
  { name: "Sembawang", lines: ["NSL"], latitude: 1.4491, longitude: 103.8200 },
  { name: "Yishun", lines: ["NSL"], latitude: 1.4295, longitude: 103.8350 },
];

// Very small static alternate-route knowledge base. Real deployment should
// replace this with a proper routing engine (e.g. OneMap Routing API) — this
// is intentionally lightweight so the agent has something concrete to use
// when it reasons about disruption workarounds.
export const ALTERNATE_ROUTE_HINTS = [
  {
    disruptedLine: "EWL",
    segment: ["Tanah Merah", "Pasir Ris"],
    suggestion:
      "Take free bridging buses between Tanah Merah and Pasir Ris, or reroute via bus services 12 and 21 which run along a parallel corridor.",
  },
  {
    disruptedLine: "NSL",
    segment: ["Jurong East", "Bishan"],
    suggestion:
      "Consider the Circle Line via Buona Vista then transferring, or bus service 65 which parallels this stretch of the North South Line.",
  },
];

export function getMockStationStatus(stationName) {
  const crowdLevels = ["Low", "Moderate", "High"];
  const seed = stationName.length % crowdLevels.length;
  return {
    station: stationName,
    crowdLevel: crowdLevels[seed],
    updatedAt: new Date().toISOString(),
  };
}
