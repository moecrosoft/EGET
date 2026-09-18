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
  warning: "M12 3l9 16H3zM12 10v4M12 17h.01",
};

const MODE_ICON = { CYCLE: ICON.bike, WALK: ICON.walk, BUS: ICON.bus, RAIL: ICON.train, SUBWAY: ICON.train };
const MODE_COLOR = { CYCLE: "#a8acb2", WALK: "#8b9088", BUS: "#1f8a57", RAIL: "#9e28b5", SUBWAY: "#9e28b5" };
// Official Singapore rail-line colors, from LTA's own "MRT Line Colour" RGB
// spec (NS #d42e12, EW #009645, NE #9900ab, CC #fa9e0d, DT #005ec4, TE #784008).
const LINE_COLORS = {
  NS: "#d42e12", EW: "#009645", CG: "#009645", NE: "#9900ab",
  CC: "#fa9e0d", CE: "#fa9e0d", DT: "#005ec4", TE: "#784008",
  BP: "#748477", SE: "#748477", SW: "#748477", PE: "#748477", PW: "#748477",
};
function legColor(leg) {
  if ((leg.mode === "RAIL" || leg.mode === "SUBWAY") && LINE_COLORS[leg.route]) return LINE_COLORS[leg.route];
  return MODE_COLOR[leg.mode] || "#8791ab";
}
// OneMap's 2-letter line codes (leg.route) vs LTA TrainServiceAlerts' own
// 3-letter codes (alert.line) — different vocabularies for the same lines.
const LINE_ALERT_CODE = { NS: "NSL", EW: "EWL", CG: "EWL", NE: "NEL", CC: "CCL", CE: "CCL", DT: "DTL", TE: "TEL" };

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
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
  // fadeAnimation off: Leaflet's per-tile "will-change: opacity" (from its
  // leaflet-fade-anim class) was breaking the compositing order of anything
  // absolutely-positioned above the map — a pull-up sheet rendered visibly
  // translucent over the tiles instead of opaque.
  const m = L.map(divId, { zoomControl: false, attributionControl: false, fadeAnimation: false });
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

const LEG_MAP_STYLE = (leg) => ({ color: legColor(leg), weight: 4 });

function routeBadgeIcon(leg) {
  const label = leg.route || (leg.mode === "BUS" ? "Bus" : leg.mode === "RAIL" || leg.mode === "SUBWAY" ? "MRT" : "");
  if (!label) return null;
  const color = legColor(leg);
  const mins = leg.durationSeconds != null ? ` · ${Math.round(leg.durationSeconds / 60)}m` : "";
  return L.divIcon({ className: "", html: `<span class="route-line-badge" style="background:${color}">${label}${mins}</span>`, iconSize: [0, 0] });
}
function transferDotIcon(color) {
  return L.divIcon({ className: "", html: `<div class="eget-transfer-dot" style="border-color:${color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
}

// Plots each leg in its mode's color, a route-number badge (like Google
// Maps' bus/line pill) at the midpoint of transit legs, and a dot at every
// change-over point so a multi-leg trip reads as a sequence of legs on the
// map, not just one long line.
function plotLegs(map, layer, legs, { fit = true } = {}) {
  layer.clearLayers();
  const bounds = [];
  (legs || []).forEach((leg, i, arr) => {
    if (!leg.coordinates || leg.coordinates.length < 2) return;
    L.polyline(leg.coordinates, LEG_MAP_STYLE(leg)).addTo(layer);
    bounds.push(...leg.coordinates);

    if (leg.mode === "BUS" || leg.mode === "RAIL" || leg.mode === "SUBWAY") {
      const icon = routeBadgeIcon(leg);
      if (icon) L.marker(leg.coordinates[Math.floor(leg.coordinates.length / 2)], { icon, interactive: false }).addTo(layer);
    }
    if (i < arr.length - 1) {
      const junction = leg.coordinates[leg.coordinates.length - 1];
      L.marker(junction, { icon: transferDotIcon(legColor(leg)), interactive: false }).addTo(layer);
    }
  });
  // Deferred: callers plot a route and switch screens in the same tick, so
  // the map's container can still be display:none (0x0) right here — fitting
  // bounds against that produces a bogus zoom. By the time this timeout
  // fires, the screen-switch that already happened synchronously has made
  // the container visible, so invalidateSize sees its real size.
  if (fit && bounds.length) {
    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20] });
    }, 0);
  }
  return bounds;
}

// ============================= Screen / tab plumbing =============================
let screen = "plan";
const MAPS_BY_SCREEN = {
  board: () => [boardMap],
  near: () => [nearMap],
  route: () => [nearRouteMap],
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
  if (weather?.isRainingNow) {
    banner.hidden = false;
    $("weatherBannerText").textContent = "Raining now · plan may change";
  } else if (weather && typeof weather.rainExpectedWithinMinutes === "number" && weather.forecastValidTo) {
    banner.hidden = false;
    const until = new Date(weather.forecastValidTo).toTimeString().slice(0, 5);
    $("weatherBannerText").textContent = `Rain possible before ${until} · plan may change`;
  } else {
    banner.hidden = true;
  }
}

function legModeLabel(leg) {
  return leg.mode === "BUS" ? (leg.route ? `Bus ${leg.route}` : "Bus") :
    leg.mode === "RAIL" || leg.mode === "SUBWAY" ? (leg.route ? `${leg.route} Line` : "Train") :
    leg.mode === "CYCLE" ? "Cycle" :
    leg.mode === "WALK" ? "Walk" : leg.mode;
}

function legCard(leg, isLast) {
  const mins = leg.durationSeconds != null ? Math.round(leg.durationSeconds / 60) : "–";
  const label = legModeLabel(leg);
  const color = legColor(leg);
  const changeFlag = !isLast && leg.to ? `<span class="leg-flag">Change at ${leg.to}</span>` : "";
  return `<div class="leg-card">
    ${pathSvg(MODE_ICON[leg.mode] || ICON.walk, { size: 26, stroke: color, width: 1.6 })}
    <span class="leg-mins">${mins}</span>
    <span class="leg-label">${label}</span>
    ${changeFlag}
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
      <span class="mode-why">${pathSvg(rainy ? ICON.rain : ICON.sun, { size: 14, stroke: "#9aa0a6", width: 2 })}<span>${data.weather?.nowcast || "Weather unavailable"} · ${Math.round(rec.etaMinutes)} min</span></span>
    </div>
    <span class="mode-eta">
      <span class="mode-eta-time">${arrive}</span>
      <span class="mode-eta-label">Arrive</span>
    </span>`;

  $("boardLegStrip").innerHTML = (rec.legs || []).map((leg, i, arr) => legCard(leg, i === arr.length - 1)).join("") || `<div class="hint-text">No route legs available.</div>`;

  plotLegs(boardMap, boardLayer, rec.legs);

  const later = data.alternativeTiming;
  $("boardLeaveLater").hidden = !later;
  if (later) $("boardLeaveLaterLabel").textContent = later.label + (later.reason ? ` — ${later.reason}` : "");

  $("boardLeaveNowBtn").textContent = `Leave now · ${time}`;
  $("boardLeaveNowBtn").onclick = () => startNav(rec, time, arrive, data.options.find((o) => o.id !== rec.id));
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
        ${o.label || o.mode} · ${Math.round(o.totalTimeSeconds / 60)}m
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
      <span class="mode-why"><span>${selected.transfers > 0 ? `${selected.transfers} transfer${selected.transfers > 1 ? "s" : ""}` : "Direct"} · ${totalMin} min</span></span>
    </div>
    <span class="mode-eta">
      <span class="mode-eta-time">${arrive}</span>
      <span class="mode-eta-label">Arrive</span>
    </span>`;

  $("boardLegStrip").innerHTML = (selected.legs || []).map((leg, i, arr) => legCard(leg, i === arr.length - 1)).join("") || `<div class="hint-text">No route legs available.</div>`;
  plotLegs(boardMap, boardLayer, selected.legs);
  $("boardLeaveLater").hidden = true;
  $("boardLeaveNowBtn").textContent = `Leave now · ${time}`;
  $("boardLeaveNowBtn").onclick = () =>
    startNav({ legs: selected.legs, mode: route.destination.name, totalTimeSeconds: selected.totalTimeSeconds }, time, arrive, options.find((o) => o.id !== selected.id));
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
let navAlternative = null; // { mode, legs } — the other option, offered as a swap if something disrupts the current one
let navCurrentLegs = [];
let navDisruptionShown = false;
let navDisruptionPoll = null;

function optionTotalMinutes(option) {
  if (option.totalTimeSeconds != null) return Math.round(option.totalTimeSeconds / 60);
  if (option.etaMinutes != null) return Math.round(option.etaMinutes);
  return Math.round((option.legs || []).reduce((sum, l) => sum + (l.durationSeconds || 0), 0) / 60);
}

function startNav(option, leaveTime, arriveTime, alternative) {
  const legs = option.legs || [];
  navCurrentLegs = legs;
  const current = legs[0];
  const next = legs[1];
  $("navModeIcon").querySelector("path").setAttribute("d", MODE_ICON[current?.mode] || ICON.walk);
  $("navInstruction").textContent = current
    ? `${current.mode === "CYCLE" ? "Cycle" : current.mode === "WALK" ? "Walk" : current.mode === "BUS" ? "Take bus" + (current.route ? " " + current.route : "") : "Take " + (current.route || "the train")}${current.to ? " to " + current.to : ""}`
    : "Head to your first stop";
  $("navInstructionSub").textContent = `Leave ${leaveTime} · ${optionTotalMinutes(option)} min total`;
  $("navNextLabel").textContent = next
    ? `Change to ${legModeLabel(next)}${current?.to ? " at " + current.to : ""}`
    : "Last leg of the trip";
  $("navArrive").textContent = arriveTime;

  navAlternative = alternative || null;
  navDisruptionShown = false;
  $("navRainCard").hidden = true;

  plotLegs(navMap, navLayer, legs);
  showScreen("nav");
  startNavDisruptionPoll();
}

function stopNavDisruptionPoll() {
  clearInterval(navDisruptionPoll);
  navDisruptionPoll = null;
}

// Finds a live LTA traffic incident (accident, breakdown, roadworks) that
// falls within ~300m of any point on a BUS leg's path.
function incidentOnRoute(legs, incidents) {
  const busLegs = legs.filter((l) => l.mode === "BUS" && l.coordinates?.length);
  for (const incident of incidents) {
    for (const leg of busLegs) {
      if (leg.coordinates.some(([lat, lng]) => haversineMeters(lat, lng, incident.latitude, incident.longitude) < 300)) {
        return incident;
      }
    }
  }
  return null;
}

// Finds a live LTA train-service alert for whichever rail line a RAIL/SUBWAY
// leg of this trip actually rides.
function disruptedAlertForRoute(legs, alerts) {
  for (const leg of legs) {
    if (leg.mode !== "RAIL" && leg.mode !== "SUBWAY") continue;
    const code = LINE_ALERT_CODE[leg.route];
    if (!code) continue;
    const alert = alerts.find((a) => a.line === code);
    if (alert) return alert;
  }
  return null;
}

function startNavDisruptionPoll() {
  stopNavDisruptionPoll();
  if (!navAlternative) return;
  const check = async () => {
    if (navDisruptionShown || !navAlternative) return;
    try {
      // Rain only matters if this trip is actually exposed to it (cycling),
      // and only worth a swap if the alternative isn't cycling too.
      if (navCurrentLegs.some((l) => l.mode === "CYCLE") && !(navAlternative.legs || []).some((l) => l.mode === "CYCLE")) {
        const weather = await (await fetch(`${API}/api/weather`)).json();
        if (weather.isRainingNow) {
          return showDisruptionCard("It's raining", `${weather.nowcast} at your location. Swap to ${navAlternative.mode} to stay dry — arrives around the same time.`);
        }
      }
      if (navCurrentLegs.some((l) => (l.mode === "RAIL" || l.mode === "SUBWAY") && LINE_ALERT_CODE[l.route])) {
        const { alerts } = await (await fetch(`${API}/api/alerts`)).json();
        const alert = disruptedAlertForRoute(navCurrentLegs, alerts);
        if (alert) {
          return showDisruptionCard(`${alert.lineName} disrupted`, `${alert.message} Swap to ${navAlternative.mode} instead — arrives around the same time.`, ICON.train);
        }
      }
      if (navCurrentLegs.some((l) => l.mode === "BUS")) {
        const { incidents } = await (await fetch(`${API}/api/incidents`)).json();
        const incident = incidentOnRoute(navCurrentLegs, incidents);
        if (incident) {
          return showDisruptionCard("Accident on your route", `${incident.message} Swap to ${navAlternative.mode} to avoid it — arrives around the same time.`, ICON.warning);
        }
      }
    } catch {
      // silently skip this poll — try again next interval
    }
  };
  check();
  navDisruptionPoll = setInterval(check, 60000);
}

function showDisruptionCard(title, body, icon = ICON.rain) {
  navDisruptionShown = true;
  $("navRainCardIconPath").setAttribute("d", icon);
  $("navRainCardTitle").textContent = title;
  $("navRainCardBody").textContent = body;
  $("navSwapBtn").textContent = `Swap to ${navAlternative.mode}`;
  $("navRainCard").hidden = false;
}

$("navSwapBtn").onclick = () => {
  const alt = navAlternative;
  $("navRainCard").hidden = true;
  startNav(alt, nowClock(), $("navArrive").textContent);
};
$("navKeepGoingBtn").onclick = () => {
  $("navRainCard").hidden = true;
};

$("navPlanBtn").onclick = () => {
  stopNavDisruptionPoll();
  showScreen("board");
};
$("navEndBtn").onclick = () => {
  stopNavDisruptionPoll();
  showScreen("board");
};

// ============================= Where to? =============================
// Set only when the person picks a suggestion (real OneMap/station coords),
// cleared as soon as they type again — typing invalidates the pick, so a
// stale lat/lng never gets silently reused for edited text.
let selectedDest = null;

$("planFindBtn").onclick = () => findDestination($("planToInput").value.trim());
$("planToInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { hideSuggestions(); findDestination($("planToInput").value.trim()); }
  if (e.key === "Escape") hideSuggestions();
});
document.querySelectorAll(".recent-row").forEach((row) => {
  row.onclick = () => {
    const dest = row.dataset.recent;
    $("planToInput").value = dest;
    findDestination(dest);
  };
});

let suggestDebounce = null;
$("planToInput").addEventListener("input", () => {
  selectedDest = null;
  const q = $("planToInput").value.trim();
  clearTimeout(suggestDebounce);
  if (q.length < 2) { hideSuggestions(); return; }
  suggestDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API}/api/geocode-suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      renderSuggestions(data.suggestions || []);
    } catch {
      hideSuggestions();
    }
  }, 300);
});
// Clicks inside the list fire before this, so a plain blur-hide is safe.
$("planToInput").addEventListener("blur", () => setTimeout(hideSuggestions, 150));

function hideSuggestions() {
  $("planSuggest").hidden = true;
  $("planSuggest").innerHTML = "";
}

function renderSuggestions(suggestions) {
  if (!suggestions.length) return hideSuggestions();
  $("planSuggest").innerHTML = suggestions
    .map(
      (s, i) => `<button type="button" class="suggest-item" data-idx="${i}">
        ${s.name}<span class="suggest-item-sub">${s.address}</span>
      </button>`
    )
    .join("");
  $("planSuggest").hidden = false;
  suggestions.forEach((s, i) => {
    $("planSuggest").querySelector(`[data-idx="${i}"]`).onclick = () => {
      $("planToInput").value = s.name;
      selectedDest = s;
      hideSuggestions();
      findDestination(s.name);
    };
  });
}

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
        const toParams = selectedDest ? `&toLat=${selectedDest.lat}&toLng=${selectedDest.lng}` : "";
        const res = await fetch(
          `${API}/api/plan-route?lat=${coords.latitude}&lng=${coords.longitude}&to=${encodeURIComponent(dest)}&time=${time}${toParams}`
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
    },
    { timeout: 8000, maximumAge: 30000 }
  );
}

function directionsToStop(stop) {
  if (!navigator.geolocation) {
    alert("Geolocation isn't supported by this browser.");
    return;
  }
  const btn = $("nearDirectionsBtn");
  const label = btn.querySelector("span");
  label.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      label.textContent = "Finding…";
      try {
        const time = nowClock();
        const res = await fetch(
          `${API}/api/plan-route?lat=${coords.latitude}&lng=${coords.longitude}&to=${encodeURIComponent(stop.description)}&toLat=${stop.latitude}&toLng=${stop.longitude}&time=${time}`
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
        alert("Couldn't find directions: " + err.message);
      } finally {
        label.textContent = "Directions";
      }
    },
    (err) => {
      alert("Couldn't get your location: " + err.message);
      label.textContent = "Directions";
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

$("nearStopSheetHandle").onclick = () => $("nearStopSheet").classList.toggle("expanded");

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
            <span class="stop-row-sub">${s.distanceKm.toFixed(2)} km · ${s.services.length ? `${s.services.length} bus${s.services.length === 1 ? "" : "es"}` : "no live arrivals"}</span>
          </span>
          <span class="stop-row-eta">
            <span class="stop-row-eta-mins">${s.services[0]?.nextArrivalMins != null ? `${s.services[0].nextArrivalMins}m` : "–"}</span>
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
  $("nearDirectionsBtn").onclick = () => directionsToStop(stop);

  $("nearBusRows").innerHTML = stop.services
    .map(
      (svc) => `<button class="bus-row" data-service="${svc.serviceNo}">
        <span class="bus-badge-no">${svc.serviceNo}</span>
        <span class="bus-row-text">
          <span class="bus-row-dest">${svc.nextArrivalMins != null ? `Next in ${svc.nextArrivalMins} min` : "No live estimate"}</span>
          <span class="bus-row-meta"><span class="crowd-dot" style="background:${LOAD_COLOR[svc.load] || "#6f7378"}"></span><span>${LOAD_LABEL[svc.load] || "Unknown load"}${svc.nextArrival2Mins != null ? ` · then ${svc.nextArrival2Mins}m` : ""}</span></span>
        </span>
        <span class="bus-row-eta">${svc.nextArrivalMins != null ? `${svc.nextArrivalMins}m` : "–"}</span>
      </button>`
    )
    .join("") || `<div class="hint-text">No live arrivals at this stop.</div>`;

  document.querySelectorAll("#nearBusRows .bus-row").forEach((row) => {
    row.onclick = () => {
      document.querySelectorAll("#nearBusRows .bus-row").forEach((r) => r.classList.toggle("active", r === row));
      showScreen("route");
      loadBusRoute(row.dataset.service);
    };
  });
}

let routeDirection = null;
let routeAvailableDirections = [];

async function loadBusRoute(serviceNo, direction = null) {
  document.querySelectorAll("#nearBusRows .bus-row").forEach((r) => r.classList.toggle("active", r.dataset.service === serviceNo));
  $("nearRouteLabel").textContent = `Bus ${serviceNo}`;
  $("routeDirectionBtn").hidden = true;
  $("nearStopSeq").innerHTML = `<div class="hint-text">Loading route…</div>`;
  try {
    const url = `${API}/api/bus-route/${encodeURIComponent(serviceNo)}${direction != null ? `?direction=${direction}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    routeDirection = data.direction;
    routeAvailableDirections = data.availableDirections || [];
    $("routeDirectionBtn").hidden = routeAvailableDirections.length < 2;
    $("routeDirectionBtn").onclick = () => {
      const other = routeAvailableDirections.find((d) => d !== routeDirection);
      loadBusRoute(serviceNo, other);
    };

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
      stops.forEach((s, i) => {
        if (s.latitude == null || s.longitude == null) return;
        const isEnd = i === 0 || i === stops.length - 1;
        L.circleMarker([s.latitude, s.longitude], {
          radius: isEnd ? 6 : 4,
          color: "#0e1114",
          weight: 1.5,
          fillColor: "#f2f0ec",
          fillOpacity: 1,
        }).addTo(nearRouteLayer);
      });
      nearRouteMap.fitBounds(coords, { padding: [16, 16] });
    }
  } catch (err) {
    $("nearStopSeq").innerHTML = `<div class="hint-text">Couldn't load route: ${err.message}</div>`;
  }
}

$("routeBackBtn").onclick = () => showScreen("near");
$("routeStopSheetHandle").onclick = () => $("routeStopSheet").classList.toggle("expanded");

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
