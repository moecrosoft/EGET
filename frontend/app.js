const API = ""; // same-origin
const $ = (id) => document.getElementById(id);

// ============================= Theme (light/dark) =============================
const THEME_KEY = "eget-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

// --- Icon paths, lifted verbatim from the EGET design file ---
const ICON = {
  bike: "M5 17.5a3 3 0 106 0 3 3 0 10-6 0M13 17.5a3 3 0 106 0 3 3 0 10-6 0M8 17.5l4-8h4M10 9.5h4",
  train: "M7 3h10v12H7zM7 15l-2 5M17 15l2 5M7 8.5h10",
  bus: "M4 5h16v10H4zM5 15v3h3v-3M16 15v3h3v-3M4 10h16",
  walk: "M13 8l-3 4 2 3-1 5M13 8l3 3 2 1M10 12l-3 2M12.6 4.6h.01",
  rain: "M7 13.5a4 4 0 013-6.4 5 5 0 019 2.4 3 3 0 01-1 6H9M8.5 19l-1 2M12.5 19l-1 2M16.5 19l-1 2",
  sun: "M12 5V3M12 21v-2M5 12H3M21 12h-2M6.4 6.4L5 5M19 19l-1.4-1.4M17.6 6.4L19 5M5 19l1.4-1.4M8.5 12a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0",
};

const MODE_ICON = { CYCLE: ICON.bike, WALK: ICON.walk, BUS: ICON.bus, RAIL: ICON.train, SUBWAY: ICON.train };
const MODE_COLOR = { CYCLE: "#a8acb2", WALK: "#8b9088", BUS: "#1f8a57", RAIL: "#9e28b5", SUBWAY: "#9e28b5" };
const CROWD_COLOR = { l: "#4fbe8b", m: "#e0a93a", h: "#e2605a" };
const LOAD_COLOR = { SEA: "#4fbe8b", SDA: "#e0a93a", LSD: "#e2605a" };
const LOAD_LABEL = { SEA: "Seats", SDA: "Standing", LSD: "Packed" };

function pathSvg(d, { size = 24, stroke = "#f2f0ec", width = 1.6 } = {}) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"></path></svg>`;
}

function addMinutesToClock(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m + Math.round(minutes), 0, 0);
  return d.toTimeString().slice(0, 5);
}

function nowClock() {
  return new Date().toTimeString().slice(0, 5);
}

// --- Leaflet maps: one dark map instance per screen that needs one ---
let boardMap, boardLayer, nearMap, nearLayer, nearRouteMap, nearRouteLayer, navMap, navLayer;

function createDarkMap(divId) {
  const m = L.map(divId, { zoomControl: false, attributionControl: false });
  // Plain OSM tiles, darkened with a CSS filter on the tile pane (see styles.css) —
  // avoids the API key that dark-styled tile providers now require.
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
  return m;
}

function initMaps() {
  boardMap = createDarkMap("boardMap");
  boardLayer = L.layerGroup().addTo(boardMap);
  boardMap.setView([1.35, 103.85], 12);

  nearMap = createDarkMap("nearMap");
  nearLayer = L.layerGroup().addTo(nearMap);
  nearMap.setView([1.4, 103.9], 15);

  nearRouteMap = createDarkMap("nearRouteMap");
  nearRouteLayer = L.layerGroup().addTo(nearRouteMap);

  navMap = createDarkMap("navMap");
  navLayer = L.layerGroup().addTo(navMap);
}

const LEG_MAP_STYLE = (leg) => ({ color: MODE_COLOR[leg.mode] || "#8791ab", weight: 4 });

function plotLegs(map, layer, legs, { fit = true } = {}) {
  layer.clearLayers();
  const bounds = [];
  (legs || []).forEach((leg) => {
    if (!leg.coordinates || leg.coordinates.length < 2) return;
    L.polyline(leg.coordinates, LEG_MAP_STYLE(leg)).addTo(layer);
    bounds.push(...leg.coordinates);
  });
  if (fit && bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
  return bounds;
}

// ============================= Screen / tab plumbing =============================
let screen = "plan";
const MAPS_BY_SCREEN = {
  board: () => [boardMap],
  near: () => [nearMap, nearRouteMap],
  nav: () => [navMap],
};

function showScreen(name) {
  screen = name;
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
  $("nearCtaWrap").hidden = name !== "plan";
  (MAPS_BY_SCREEN[name]?.() || []).forEach((m) => m && setTimeout(() => m.invalidateSize(), 0));
  if (name === "near" && nearStops.length === 0) findNearby();
}

$("nearCta").onclick = () => showScreen("near");

// ============================= Today (board) =============================
let journeyData = null;
let customRoute = null; // set after a real destination search from the Where to? screen
let customRouteOptionId = null; // which of customRoute.options is currently shown

async function fetchJourney(time) {
  try {
    const res = await fetch(`${API}/api/journey-options?time=${encodeURIComponent(time)}`);
    return await res.json();
  } catch (err) {
    return { error: "Couldn't load journey options: " + err.message };
  }
}

function updateWeatherBanner(weather) {
  const banner = $("weatherBanner");
  if (weather && typeof weather.rainExpectedWithinMinutes === "number") {
    banner.hidden = false;
    $("weatherBannerText").textContent = `Rain in ${weather.rainExpectedWithinMinutes} min · plan changed`;
  } else {
    banner.hidden = true;
  }
}

function legCard(leg) {
  const mins = leg.durationSeconds != null ? Math.round(leg.durationSeconds / 60) : "–";
  const label =
    leg.mode === "BUS" ? (leg.route ? `Bus ${leg.route}` : "Bus") :
    leg.mode === "RAIL" || leg.mode === "SUBWAY" ? (leg.route ? `Line ${leg.route}` : "Train") :
    leg.mode === "CYCLE" ? "Cycle" :
    leg.mode === "WALK" ? "Walk" : leg.mode;
  const color = MODE_COLOR[leg.mode] || "#8791ab";
  return `<div class="leg-card">
    ${pathSvg(MODE_ICON[leg.mode] || ICON.walk, { size: 26, stroke: color, width: 1.6 })}
    <span class="leg-mins">${mins}</span>
    <span class="leg-label">${label}</span>
  </div>`;
}

function renderBoardPersona(data) {
  if (data.error) {
    $("boardModeRow").innerHTML = `<div class="hint-text">${data.error}</div>`;
    $("boardLegStrip").innerHTML = "";
    $("boardLeaveLater").hidden = true;
    return;
  }
  updateWeatherBanner(data.weather);
  $("tripBarLabel").textContent = "Punggol Field → one-north";

  const rec = data.options.find((o) => o.id === data.recommendation?.optionId) || data.options[0];
  const time = data.requestedTime || nowClock();
  const arrive = addMinutesToClock(time, rec.etaMinutes);
  const rainy = typeof data.weather?.rainExpectedWithinMinutes === "number";

  $("boardModeRow").innerHTML = `
    ${pathSvg(rec.id === "cycle-lrt" ? ICON.bike : ICON.bus, { size: 40, width: 1.5 })}
    <div class="mode-text">
      <span class="mode-name">${rec.mode}</span>
      <span class="mode-why">${pathSvg(rainy ? ICON.rain : ICON.sun, { size: 14, stroke: "#9aa0a6", width: 2 })}<span>${data.weather?.nowcast || "Weather unavailable"}</span></span>
    </div>
    <span class="mode-eta">
      <span class="mode-eta-time">${arrive}</span>
      <span class="mode-eta-label">Arrive</span>
    </span>`;

  $("boardLegStrip").innerHTML = (rec.legs || []).map(legCard).join("") || `<div class="hint-text">No route legs available.</div>`;

  plotLegs(boardMap, boardLayer, rec.legs);

  const later = data.alternativeTiming;
  $("boardLeaveLater").hidden = !later;
  if (later) $("boardLeaveLaterLabel").textContent = later.label + (later.reason ? ` — ${later.reason}` : "");

  $("boardLeaveNowBtn").textContent = `Leave now · ${time}`;
  $("boardLeaveNowBtn").onclick = () => startNav(rec, time, arrive);
}

function renderBoardCustom(route) {
  updateWeatherBanner(null);
  $("tripBarLabel").textContent = `Your location → ${route.destination.name}`;

  const options = route.options || [];
  const selectedId = customRouteOptionId || route.recommendedId || options[0]?.id;
  const selected = options.find((o) => o.id === selectedId) || options[0];

  $("boardOptionRow").hidden = options.length < 2;
  $("boardOptionRow").innerHTML = options
    .map(
      (o) => `<button class="near-mode-tab${o.id === selected.id ? " active" : ""}" data-option="${o.id}">
        ${o.mode} · ${Math.round(o.totalTimeSeconds / 60)}m
      </button>`
    )
    .join("");
  document.querySelectorAll("#boardOptionRow .near-mode-tab").forEach((btn) => {
    btn.onclick = () => {
      customRouteOptionId = btn.dataset.option;
      renderBoardCustom(route);
    };
  });

  const totalMin = Math.round(selected.totalTimeSeconds / 60);
  const time = nowClock();
  const arrive = addMinutesToClock(time, totalMin);

  $("boardModeRow").innerHTML = `
    ${pathSvg(MODE_ICON[selected.legs?.[0]?.mode] || ICON.walk, { size: 40, width: 1.5 })}
    <div class="mode-text">
      <span class="mode-name">${route.destination.name}</span>
      <span class="mode-why"><span>${selected.transfers > 0 ? `${selected.transfers} transfer${selected.transfers > 1 ? "s" : ""}` : "Direct"}</span></span>
    </div>
    <span class="mode-eta">
      <span class="mode-eta-time">${arrive}</span>
      <span class="mode-eta-label">Arrive</span>
    </span>`;

  $("boardLegStrip").innerHTML = (selected.legs || []).map(legCard).join("") || `<div class="hint-text">No route legs available.</div>`;
  plotLegs(boardMap, boardLayer, selected.legs);
  $("boardLeaveLater").hidden = true;
  $("boardLeaveNowBtn").textContent = `Leave now · ${time}`;
  $("boardLeaveNowBtn").onclick = () => startNav({ legs: selected.legs, mode: route.destination.name }, time, arrive);
}

function renderBoard() {
  if (customRoute) renderBoardCustom(customRoute);
  else if (journeyData) renderBoardPersona(journeyData);
}

async function refreshJourney() {
  const time = nowClock();
  journeyData = await fetchJourney(time);
  if (!customRoute) renderBoard();
}

$("tripBar").onclick = () => showScreen("plan");

// ============================= Navigation =============================
function startNav(option, leaveTime, arriveTime) {
  const legs = option.legs || [];
  const current = legs[0];
  const next = legs[1];
  $("navModeIcon").querySelector("path").setAttribute("d", MODE_ICON[current?.mode] || ICON.walk);
  $("navInstruction").textContent = current
    ? `${current.mode === "CYCLE" ? "Cycle" : current.mode === "WALK" ? "Walk" : current.mode === "BUS" ? "Take bus" + (current.route ? " " + current.route : "") : "Take " + (current.route || "the train")}${current.to ? " to " + current.to : ""}`
    : "Head to your first stop";
  $("navInstructionSub").textContent = `Leave ${leaveTime}`;
  $("navNextLabel").textContent = next
    ? `Then ${next.mode === "BUS" ? "bus" : next.mode.toLowerCase()}${next.route ? " " + next.route : ""} to ${next.to || "your next stop"}`
    : "Last leg of the trip";
  $("navArrive").textContent = arriveTime;

  plotLegs(navMap, navLayer, legs);
  showScreen("nav");
}

$("navPlanBtn").onclick = () => showScreen("board");
$("navEndBtn").onclick = () => showScreen("board");

// ============================= Where to? =============================
$("planFindBtn").onclick = () => findDestination($("planToInput").value.trim());
$("planToInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") findDestination($("planToInput").value.trim());
});
document.querySelectorAll(".recent-row").forEach((row) => {
  row.onclick = () => {
    const dest = row.dataset.recent;
    $("planToInput").value = dest;
    findDestination(dest);
  };
});

function findDestination(dest) {
  if (!dest) {
    customRoute = null;
    renderBoard();
    showScreen("board");
    return;
  }
  if (!navigator.geolocation) {
    alert("Geolocation isn't supported by this browser.");
    return;
  }
  $("planFindBtn").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      $("planFindBtn").textContent = "Finding the best route…";
      try {
        const time = nowClock();
        const res = await fetch(
          `${API}/api/plan-route?lat=${coords.latitude}&lng=${coords.longitude}&to=${encodeURIComponent(dest)}&time=${time}`
        );
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          customRoute = data;
          customRouteOptionId = null;
          renderBoard();
          showScreen("board");
        }
      } catch (err) {
        alert("Couldn't find a route: " + err.message);
      } finally {
        $("planFindBtn").textContent = "Find my route";
      }
    },
    (err) => {
      alert("Couldn't get your location: " + err.message);
      $("planFindBtn").textContent = "Find my route";
    }
  );
}

// ============================= Near you =============================
let nearStops = [];
let nearStations = [];
let nearMode = "bus";
let nearStopIdx = null;
let meLatLng = null;

function haloIcon() {
  return L.divIcon({ className: "", html: `<div class="eget-me-dot"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
}
function pinIcon(count) {
  return L.divIcon({
    className: "",
    html: `<div class="eget-pin">${pathSvg(ICON.bus, { size: 15, stroke: "#0e1114", width: 2 })}<span>${count} bus${count === 1 ? "" : "es"}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [10, 30],
  });
}
function stationPinIcon(name) {
  return L.divIcon({
    className: "",
    html: `<div class="eget-pin">${pathSvg(ICON.train, { size: 15, stroke: "#0e1114", width: 2 })}<span>${name}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [10, 30],
  });
}

document.querySelectorAll(".near-mode-tab").forEach((btn) => {
  btn.onclick = () => {
    nearMode = btn.dataset.mode;
    document.querySelectorAll(".near-mode-tab").forEach((b) => b.classList.toggle("active", b === btn));
    renderNearList();
  };
});

function renderNearList() {
  $("nearList").hidden = false;
  $("nearDetail").hidden = true;
  $("nearCaption").textContent =
    nearMode === "bus" ? "Live arrivals from LTA, refreshed on open" : "Nearest stations, by straight-line distance";

  nearLayer.clearLayers();
  const bounds = [];
  if (meLatLng) {
    L.marker(meLatLng, { icon: haloIcon() }).addTo(nearLayer);
    bounds.push(meLatLng);
  }

  if (nearMode === "bus") {
    $("nearStopList").innerHTML = nearStops
      .map(
        (s, i) => `<button class="stop-row" data-idx="${i}">
          ${pathSvg(ICON.bus, { size: 30, stroke: "#1f8a57", width: 1.6 })}
          <span class="stop-row-text">
            <span class="stop-row-name">${s.description}</span>
            <span class="stop-row-sub">${s.distanceKm.toFixed(2)} km · ${s.services.length} bus${s.services.length === 1 ? "" : "es"}</span>
          </span>
          <span class="stop-row-eta">
            <span class="stop-row-eta-mins">${s.services[0]?.nextArrivalMins ?? "?"}m</span>
            <span class="stop-row-eta-arrow">&rarr;</span>
          </span>
        </button>`
      )
      .join("") || `<div class="hint-text">No bus stops found nearby.</div>`;

    document.querySelectorAll("#nearStopList .stop-row").forEach((row) => {
      row.onclick = () => openStop(Number(row.dataset.idx));
    });

    nearStops.forEach((s) => {
      if (s.latitude == null || s.longitude == null) return;
      const ll = [s.latitude, s.longitude];
      L.marker(ll, { icon: pinIcon(s.services.length) }).on("click", () => openStop(nearStops.indexOf(s))).addTo(nearLayer);
      bounds.push(ll);
    });
  } else {
    $("nearStopList").innerHTML = nearStations
      .map(
        (s) => `<div class="stop-row" style="cursor:default">
          ${pathSvg(ICON.train, { size: 30, stroke: "#9e28b5", width: 1.6 })}
          <span class="stop-row-text">
            <span class="stop-row-name">${s.name}</span>
            <span class="stop-row-sub">${s.distanceKm.toFixed(2)} km · ${s.lines.join("/")}</span>
          </span>
        </div>`
      )
      .join("") || `<div class="hint-text">No MRT/LRT stations found nearby.</div>`;

    nearStations.forEach((s) => {
      if (s.latitude == null || s.longitude == null) return;
      const ll = [s.latitude, s.longitude];
      L.marker(ll, { icon: stationPinIcon(s.name) }).addTo(nearLayer);
      bounds.push(ll);
    });
  }

  if (bounds.length) nearMap.fitBounds(bounds, { padding: [24, 24] });
  setTimeout(() => nearMap.invalidateSize(), 0);
}

function openStop(idx) {
  nearStopIdx = idx;
  const stop = nearStops[idx];
  $("nearList").hidden = true;
  $("nearDetail").hidden = false;

  $("nearStopName").textContent = stop.description;
  $("nearStopMeta").textContent = `Stop ${stop.busStopCode} · ${stop.distanceKm.toFixed(2)} km`;

  $("nearBusRows").innerHTML = stop.services
    .map(
      (svc) => `<button class="bus-row" data-service="${svc.serviceNo}">
        <span class="bus-badge-no">${svc.serviceNo}</span>
        <span class="bus-row-text">
          <span class="bus-row-dest">Next in ${svc.nextArrivalMins ?? "?"} min</span>
          <span class="bus-row-meta"><span class="crowd-dot" style="background:${LOAD_COLOR[svc.load] || "#6f7378"}"></span><span>${LOAD_LABEL[svc.load] || "Unknown load"}${svc.nextArrival2Mins != null ? ` · then ${svc.nextArrival2Mins}m` : ""}</span></span>
        </span>
        <span class="bus-row-eta">${svc.nextArrivalMins ?? "?"}m</span>
      </button>`
    )
    .join("") || `<div class="hint-text">No live arrivals at this stop.</div>`;

  document.querySelectorAll("#nearBusRows .bus-row").forEach((row) => {
    row.onclick = () => {
      document.querySelectorAll("#nearBusRows .bus-row").forEach((r) => r.classList.toggle("active", r === row));
      loadBusRoute(row.dataset.service);
    };
  });

  const first = stop.services[0];
  if (first) loadBusRoute(first.serviceNo);
  else {
    $("nearRouteLabel").textContent = "";
    $("nearStopSeq").innerHTML = "";
    nearRouteLayer.clearLayers();
  }
  setTimeout(() => nearRouteMap.invalidateSize(), 0);
}

async function loadBusRoute(serviceNo) {
  document.querySelectorAll("#nearBusRows .bus-row").forEach((r) => r.classList.toggle("active", r.dataset.service === serviceNo));
  $("nearRouteLabel").textContent = `Bus ${serviceNo}`;
  $("nearStopSeq").innerHTML = `<div class="hint-text">Loading route…</div>`;
  try {
    const res = await fetch(`${API}/api/bus-route/${encodeURIComponent(serviceNo)}`);
    const data = await res.json();
    const stops = data.stops || [];
    if (!stops.length) {
      $("nearStopSeq").innerHTML = `<div class="hint-text">No route data available (needs a live LTA_ACCOUNT_KEY).</div>`;
      nearRouteLayer.clearLayers();
      return;
    }
    $("nearRouteLabel").textContent = `Bus ${serviceNo} → ${stops[stops.length - 1].description}`;
    $("nearStopSeq").innerHTML = stops
      .map((s, i) => {
        const isEnd = i === 0 || i === stops.length - 1;
        const notLast = i !== stops.length - 1;
        return `<div class="stop-seq-row">
          ${notLast ? `<span class="stop-seq-connector"></span>` : ""}
          <span class="stop-seq-dot-wrap"><span class="stop-seq-dot" style="width:${isEnd ? "12px" : "8px"};height:${isEnd ? "12px" : "8px"};background:${isEnd ? "#f2f0ec" : "#1f8a57"}"></span></span>
          <span class="stop-seq-name" style="color:${isEnd ? "#f2f0ec" : "#a8acb2"}">${s.description}</span>
        </div>`;
      })
      .join("");

    nearRouteLayer.clearLayers();
    const coords = stops.filter((s) => s.latitude != null && s.longitude != null).map((s) => [s.latitude, s.longitude]);
    if (coords.length > 1) {
      L.polyline(coords, { color: "#1f8a57", weight: 3.4 }).addTo(nearRouteLayer);
      nearRouteMap.fitBounds(coords, { padding: [16, 16] });
    }
  } catch (err) {
    $("nearStopSeq").innerHTML = `<div class="hint-text">Couldn't load route: ${err.message}</div>`;
  }
}

$("nearBackBtn").onclick = () => {
  nearStopIdx = null;
  renderNearList();
};

$("nearHomeBtn").onclick = () => showScreen("plan");

function findNearby() {
  if (!navigator.geolocation) {
    $("nearStopList").innerHTML = `<div class="hint-text">Geolocation isn't supported by this browser.</div>`;
    return;
  }
  $("nearStopList").innerHTML = `<div class="hint-text">Locating…</div>`;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      meLatLng = [coords.latitude, coords.longitude];
      try {
        const res = await fetch(`${API}/api/nearby?lat=${coords.latitude}&lng=${coords.longitude}`);
        const data = await res.json();
        nearStops = (data.busStops?.busStops || []).map((s) => ({ ...s, services: s.services || [] }));
        nearStations = data.stations?.stations || [];
        renderNearList();
      } catch (err) {
        $("nearStopList").innerHTML = `<div class="hint-text">Couldn't load nearby stops: ${err.message}</div>`;
      }
    },
    (err) => {
      $("nearStopList").innerHTML = `<div class="hint-text">Couldn't get your location: ${err.message}</div>`;
    }
  );
}

$("themeToggle").onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
};

// ============================= Clock + boot =============================
function tickClock() {
  $("clock").textContent = nowClock();
}

initMaps();
tickClock();
showScreen("plan");
refreshJourney();
setInterval(tickClock, 15000);
setInterval(refreshJourney, 5 * 60000);
