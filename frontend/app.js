const API = ""; // same-origin
const PROFILE_ID = localStorage.getItem("cc_profile_id") || crypto.randomUUID();
localStorage.setItem("cc_profile_id", PROFILE_ID);

const LINES = ["NSL", "EWL", "CCL", "DTL", "TEL", "NEL", "BPL"];
const LINE_COLORS = {
  NSL: "#d1302b",
  EWL: "#00953b",
  CCL: "#e08600",
  DTL: "#0a5ed1",
  TEL: "#9d5b25",
  NEL: "#9a00aa",
  BPL: "#6b7280",
};
const $ = (id) => document.getElementById(id);

let routeMap, routeLayer;
let journeyMap, journeyLayer;

// Each page that shows a map owns its own Leaflet instance and layer group —
// simpler and more reliable than reparenting one shared map between pages.
function createMap(divId) {
  const m = L.map(divId).setView([1.3521, 103.8198], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(m);
  return m;
}

function initMaps() {
  routeMap = createMap("routeMap");
  routeLayer = L.layerGroup().addTo(routeMap);

  journeyMap = createMap("journeyMap");
  journeyLayer = L.layerGroup().addTo(journeyMap);
}

function plotRouteLegs(legs) {
  routeLayer.clearLayers();
  if (!legs || legs.length === 0) {
    $("routeMap").hidden = true;
    return;
  }
  $("routeMap").hidden = false;
  routeMap.invalidateSize(); // was hidden (display:none) — Leaflet needs a nudge to size correctly

  const bounds = [];
  legs.forEach((leg) => {
    if (!leg.coordinates || leg.coordinates.length < 2) return;
    const style = JOURNEY_MODE_STYLE[leg.mode] || { color: "#8791ab", weight: 3 };
    L.polyline(leg.coordinates, style).bindPopup(`${leg.mode}${leg.route ? " " + leg.route : ""}`).addTo(routeLayer);
    bounds.push(...leg.coordinates);
  });
  if (bounds.length) routeMap.fitBounds(bounds, { padding: [24, 24] });
}

const JOURNEY_MODE_STYLE = {
  CYCLE: { color: "#3fae52", weight: 4 },
  WALK: { color: "#8b9088", weight: 3, dashArray: "2 8" },
  SUBWAY: { color: "#0a5ed1", weight: 5 },
  RAIL: { color: "#0a5ed1", weight: 5 },
  BUS: { color: "#e0a72f", weight: 5 },
};
const JOURNEY_AFFECTED_STYLE = { color: "#ff5c5c", weight: 7, dashArray: "1 10", opacity: 0.9 };

let journeyNowData = null;
let journeyLaterData = null;
let journeyWhen = "now";

function plotJourneyLegs(options) {
  journeyLayer.clearLayers();
  const disruptedMode = options.find((o) => o.id === "cycle-lrt")?.affectedSegments?.length
    ? "SUBWAY"
    : options.find((o) => o.id === "bus-only")?.affectedSegments?.length
      ? "BUS"
      : null;

  const bounds = [];
  options.forEach((opt) => {
    (opt.legs || []).forEach((leg) => {
      if (!leg.coordinates || leg.coordinates.length < 2) return;
      const style = leg.mode === disruptedMode ? JOURNEY_AFFECTED_STYLE : JOURNEY_MODE_STYLE[leg.mode] || { color: "#8791ab", weight: 3 };
      L.polyline(leg.coordinates, style).addTo(journeyLayer);
      bounds.push(...leg.coordinates);
    });
  });
  if (bounds.length) journeyMap.fitBounds(bounds, { padding: [24, 24] });
}

function journeyOptionCard(opt, isRecommended, reason) {
  const chips = [
    `<span class="journey-chip crowd-${opt.crowdLevel}">${{ l: "Low", m: "Moderate", h: "High" }[opt.crowdLevel] || "Unknown"} crowd</span>`,
  ];
  if (opt.bikeAllowed === true) chips.push(`<span class="journey-chip">Bike allowed</span>`);
  if (opt.bikeAllowed === false) chips.push(`<span class="journey-chip warn">Bike restricted</span>`);
  if (opt.affectedSegments?.length) chips.push(`<span class="journey-chip warn">Disruption reported</span>`);

  return `<div class="journey-card${isRecommended ? " recommended" : ""}">
    ${isRecommended ? `<div class="journey-rec-tag">RECOMMENDED</div>` : ""}
    <div class="journey-card-head">
      <div class="journey-card-title">${opt.mode}</div>
      <div class="journey-card-eta">${opt.etaMinutes ?? "?"}<span class="unit"> min</span></div>
    </div>
    <div class="journey-chip-row">${chips.join("")}</div>
    ${isRecommended && reason ? `<div class="journey-reason"><b>Why:</b> ${reason}</div>` : ""}
  </div>`;
}

function renderJourneyOptions(data) {
  if (data.error) {
    $("journeyOptions").innerHTML = `<div class="hint">${data.error}</div>`;
    return;
  }
  const recommendedId = data.recommendation?.optionId;
  const reason = data.recommendation?.reason;
  $("journeyOptions").innerHTML = data.options
    .map((opt) => journeyOptionCard(opt, opt.id === recommendedId, reason))
    .join("");
  plotJourneyLegs(data.options);

  $("journeyLaterBtn").disabled = !data.alternativeTiming && journeyWhen !== "later";
  if (journeyWhen === "now") {
    $("journeyLaterLabel").textContent = data.alternativeTiming?.label || "checking…";
    $("journeyHint").textContent = data.alternativeTiming?.reason || "";
  }
}

async function fetchJourney(time, { isLater = false } = {}) {
  try {
    const res = await fetch(`${API}/api/journey-options?time=${encodeURIComponent(time)}`);
    const data = await res.json();
    if (isLater) journeyLaterData = data;
    else journeyNowData = data;
    return data;
  } catch (err) {
    const errData = { error: "Couldn't load journey options: " + err.message };
    if (isLater) journeyLaterData = errData;
    else journeyNowData = errData;
    return errData;
  }
}

async function refreshJourney() {
  const now = new Date().toTimeString().slice(0, 5);
  $("journeyNowTime").textContent = now;
  const data = await fetchJourney(now);
  if (journeyWhen === "now") renderJourneyOptions(data);
  if (data?.alternativeTiming?.atTime) {
    const later = await fetchJourney(data.alternativeTiming.atTime, { isLater: true });
    if (journeyWhen === "later") renderJourneyOptions(later);
    $("journeyLaterBtn").disabled = false;
  }
}

function setJourneyWhen(when) {
  journeyWhen = when;
  $("journeyNowBtn").classList.toggle("active", when === "now");
  $("journeyLaterBtn").classList.toggle("active", when === "later");
  const data = when === "now" ? journeyNowData : journeyLaterData;
  if (data) renderJourneyOptions(data);
}

function renderLineMap(disruptedLines) {
  const el = $("lineMap");
  el.innerHTML = LINES.map((line) => {
    const isDisrupted = disruptedLines.has(line);
    return `<div class="line-status${isDisrupted ? " disrupted" : ""}" style="background:${LINE_COLORS[line]}">${line}${isDisrupted ? " ⚠" : ""}</div>`;
  }).join("");
}

function renderAlertCount(count) {
  const badge = $("alertCount");
  badge.hidden = count === 0;
  badge.textContent = count;
}

async function refreshAlerts() {
  try {
    const res = await fetch(`${API}/api/alerts`);
    const data = await res.json();
    $("dataSource").textContent =
      data.source === "live" ? "live LTA DataMall" : "mock data (no LTA key set)";

    const alerts = data.alerts || [];
    const disrupted = alerts.filter((a) => a.status === "disrupted");
    renderLineMap(new Set(disrupted.map((a) => a.line)));
    renderAlertCount(disrupted.length);

    const feed = $("alertFeed");
    if (alerts.length === 0) {
      feed.innerHTML = `<div class="alert-card ok"><span class="line-tag">ALL CLEAR</span><div>No active disruptions reported.</div></div>`;
      return;
    }
    feed.innerHTML = alerts
      .map((a) => {
        const cls = a.status === "disrupted" ? "disrupted" : "ok";
        return `<div class="alert-card ${cls}">
          <span class="line-tag">${a.line} — ${a.lineName}</span>
          <div>${a.message}</div>
        </div>`;
      })
      .join("");
  } catch (err) {
    $("alertFeed").textContent = "Couldn't load alerts: " + err.message;
  }
}

// --- Favourites (localStorage; {type: "station"|"stop", id, label, meta}) ---
function getFavourites() {
  return JSON.parse(localStorage.getItem("cc_favourites") || "[]");
}
function isFavourited(type, id) {
  return getFavourites().some((f) => f.type === type && f.id === id);
}
function toggleFavourite(item) {
  const favs = getFavourites();
  const idx = favs.findIndex((f) => f.type === item.type && f.id === item.id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(item);
  localStorage.setItem("cc_favourites", JSON.stringify(favs));
  renderFavourites();
}

async function renderFavourites() {
  const favs = getFavourites();
  const el = $("favouritesList");
  if (favs.length === 0) {
    el.innerHTML = `<p class="hint">Star a station or bus stop on the Nearby tab to pin it here.</p>`;
    return;
  }
  const cards = await Promise.all(
    favs.map(async (f) => {
      if (f.type === "station") {
        return `<div class="nearby-card">
          <div class="nearby-card-main">
            <button class="fav-star active" data-fav-type="station" data-fav-id="${f.id}">★</button>
            <div>
              <div class="nearby-card-title">${f.label}</div>
              <div class="nearby-card-sub">${(f.meta.lines || []).join(", ")}</div>
            </div>
          </div>
        </div>`;
      }
      let badge = "Loading…";
      try {
        const res = await fetch(`${API}/api/arrivals/${f.id}`);
        const data = await res.json();
        badge = (data.services || [])
          .map((s) => `${s.serviceNo} · ${s.nextArrivalMins ?? "?"} min`)
          .join("<br>") || "No live arrivals";
      } catch {
        badge = "Unavailable";
      }
      return `<div class="nearby-card">
        <div class="nearby-card-main">
          <button class="fav-star active" data-fav-type="stop" data-fav-id="${f.id}">★</button>
          <div>
            <div class="nearby-card-title">${f.label}</div>
            <div class="nearby-card-sub">#${f.id}</div>
          </div>
        </div>
        <div class="nearby-card-badge">${badge}</div>
      </div>`;
    })
  );
  el.innerHTML = cards.join("");
}

// Delegated click handling for star buttons rendered inside dynamic HTML.
document.addEventListener("click", (e) => {
  const star = e.target.closest(".fav-star");
  if (!star) return;
  const type = star.dataset.favType;
  const id = star.dataset.favId;
  const item =
    type === "station"
      ? { type, id, label: star.dataset.favLabel, meta: { lines: (star.dataset.favLines || "").split(",").filter(Boolean) } }
      : { type, id, label: star.dataset.favLabel, meta: {} };
  toggleFavourite(item);

  const nowFav = isFavourited(type, id);
  document.querySelectorAll(`.fav-star[data-fav-type="${type}"][data-fav-id="${CSS.escape(id)}"]`).forEach((btn) => {
    btn.classList.toggle("active", nowFav);
    btn.textContent = nowFav ? "★" : "☆";
  });
});

document.addEventListener("click", (e) => {
  const badge = e.target.closest(".bus-badge");
  if (!badge || !badge.dataset.service) return;
  showRouteDetail(badge.dataset.service);
});

// Pull-up sheet effect: unhide immediately, then add .open a frame later so
// the browser registers the translateY(100%) starting position before
// transitioning — toggling straight to .open would skip the animation.
function openSheet(el) {
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("open")));
}
function closeSheet(el) {
  el.classList.remove("open");
  setTimeout(() => (el.hidden = true), 300); // matches .modal-sheet transition duration
}

async function showRouteDetail(serviceNo) {
  $("routeDetailTitle").textContent = `🚌 Bus ${serviceNo}`;
  $("routeDetailBody").innerHTML = `<p class="hint">Loading route…</p>`;
  openSheet($("routeDetailModal"));
  try {
    const res = await fetch(`${API}/api/bus-route/${encodeURIComponent(serviceNo)}`);
    const data = await res.json();
    if (!data.stops || data.stops.length === 0) {
      $("routeDetailBody").innerHTML = `<p class="hint">No route data available (needs a live LTA_ACCOUNT_KEY).</p>`;
      return;
    }
    $("routeDetailBody").innerHTML = `<div class="route-stop-list">${data.stops
      .map(
        (s) => `<div class="route-stop">
          <div class="route-stop-seq">${s.sequence}</div>
          <div class="route-stop-name">${s.description}</div>
        </div>`
      )
      .join("")}</div>`;
  } catch (err) {
    $("routeDetailBody").innerHTML = `<p class="hint">Couldn't load route: ${err.message}</p>`;
  }
}
$("routeDetailClose").onclick = () => closeSheet($("routeDetailModal"));
$("routeDetailModal").onclick = (e) => {
  if (e.target.id === "routeDetailModal") closeSheet($("routeDetailModal"));
};

$("nearbyPullTab").onclick = () => {
  openSheet($("nearbySheet"));
  findNearby();
};
$("nearbySheetClose").onclick = () => closeSheet($("nearbySheet"));
$("nearbySheet").onclick = (e) => {
  if (e.target.id === "nearbySheet") closeSheet($("nearbySheet"));
};

const STEP_ICON = { WALK: "🚶", SUBWAY: "🚇", RAIL: "🚇", BUS: "🚌" };

function routeStepCard(leg) {
  const label = leg.mode === "WALK" ? "Walk" : leg.route ? `${leg.mode === "BUS" ? "Bus" : leg.mode} ${leg.route}` : leg.mode;
  const sub = leg.mode === "WALK" ? `to ${leg.to}` : `${leg.from} &rarr; ${leg.to}`;
  return `<div class="route-step">
    <span class="route-step-icon">${STEP_ICON[leg.mode] || "•"}</span>
    <div>
      <div class="route-step-label">${label}${leg.routeName ? ` <span class="hint">(${leg.routeName})</span>` : ""}</div>
      <div class="route-step-sub">${sub}</div>
    </div>
    <div class="route-step-time">${Math.round(leg.durationSeconds / 60)} min</div>
  </div>`;
}

async function findDestination() {
  const dest = $("destSearchInput").value.trim();
  const result = $("routeResult");
  if (!dest) return;
  if (!navigator.geolocation) {
    result.textContent = "Geolocation isn't supported by this browser.";
    return;
  }
  result.innerHTML = `<div class="hint">Locating you…</div>`;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      result.innerHTML = `<div class="hint">Finding the best route…</div>`;
      try {
        const time = new Date().toTimeString().slice(0, 5);
        const res = await fetch(
          `${API}/api/plan-route?lat=${coords.latitude}&lng=${coords.longitude}&to=${encodeURIComponent(dest)}&time=${time}`
        );
        const data = await res.json();
        if (data.error) {
          result.innerHTML = `<div class="hint">${data.error}</div>`;
          plotRouteLegs([]);
          return;
        }
        const totalMin = Math.round(data.totalTimeSeconds / 60);
        const transferNote = data.transfers > 0 ? ` · ${data.transfers} transfer${data.transfers > 1 ? "s" : ""}` : "";
        result.innerHTML = `<div class="route-summary">To ${data.destination.name} — ${totalMin} min${transferNote}</div>${data.legs
          .map(routeStepCard)
          .join("")}`;
        plotRouteLegs(data.legs);
      } catch (err) {
        result.textContent = "Couldn't find a route: " + err.message;
      }
    },
    (err) => {
      result.textContent = "Couldn't get your location: " + err.message;
    }
  );
}

function findNearby() {
  const status = $("nearbyStatus");
  const btn = $("nearbyPullTab");
  if (!navigator.geolocation) {
    status.textContent = "Geolocation isn't supported by this browser.";
    return;
  }
  btn.classList.add("loading");
  status.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      status.textContent = "Loading nearby stations and buses…";
      try {
        const res = await fetch(`${API}/api/nearby?lat=${coords.latitude}&lng=${coords.longitude}`);
        const data = await res.json();

        $("nearbyStations").innerHTML = (data.stations?.stations || [])
          .map((s) => {
            const fav = isFavourited("station", s.name);
            return `<div class="nearby-card">
              <div class="nearby-card-main">
                <button class="fav-star${fav ? " active" : ""}" data-fav-type="station" data-fav-id="${s.name}" data-fav-label="${s.name}" data-fav-lines="${s.lines.join(",")}">${fav ? "★" : "☆"}</button>
                <div>
                  <div class="nearby-card-title">${s.name}</div>
                  <div class="nearby-card-sub">${s.lines.join(", ")}</div>
                </div>
              </div>
              <div class="nearby-card-badge">${s.distanceKm.toFixed(2)} km</div>
            </div>`;
          })
          .join("") || "No stations found.";

        $("nearbyBusStops").innerHTML = (data.busStops?.busStops || [])
          .map((b) => {
            const services = b.services || [];
            const fav = isFavourited("stop", b.busStopCode);
            const badges = services.length
              ? services
                  .map(
                    (s) =>
                      `<button class="bus-badge" data-service="${s.serviceNo}"><span class="bus-badge-icon">🚌</span>${s.serviceNo}<span class="arrival">${s.nextArrivalMins ?? "?"} min</span></button>`
                  )
                  .join("")
              : `<span class="hint">No live arrivals</span>`;
            return `<div class="nearby-card">
              <div class="nearby-card-main">
                <button class="fav-star${fav ? " active" : ""}" data-fav-type="stop" data-fav-id="${b.busStopCode}" data-fav-label="${b.description}">${fav ? "★" : "☆"}</button>
                <div>
                  <div class="nearby-card-title">${b.description}</div>
                  <div class="nearby-card-sub">#${b.busStopCode} &middot; ${b.distanceKm.toFixed(2)} km</div>
                  <div class="bus-badge-row">${badges}</div>
                </div>
              </div>
            </div>`;
          })
          .join("") || "No bus stops found.";

        status.textContent = data.busStops?.source?.startsWith("mock")
          ? "Showing mock data (no LTA key or quota exceeded)."
          : "";
      } catch (err) {
        status.textContent = "Couldn't load nearby data: " + err.message;
      } finally {
        btn.classList.remove("loading");
      }
    },
    (err) => {
      status.textContent = "Couldn't get your location: " + err.message;
      btn.classList.remove("loading");
    }
  );
}

function appendMsg(role, text) {
  const log = $("chatLog");
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function sendChat() {
  const input = $("chatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  appendMsg("user", message);
  const pending = appendMsg("agent pending", "thinking…");

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, profileId: PROFILE_ID }),
    });
    const data = await res.json();
    pending.classList.remove("pending");
    pending.textContent = data.reply || data.error || "(no response)";
  } catch (err) {
    pending.textContent = "Error: " + err.message;
  }
}

$("sendBtn").onclick = sendChat;
$("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
$("demoNextBtn").onclick = async () => {
  await fetch(`${API}/api/mock/next-scenario`, { method: "POST" });
  refreshAlerts();
};
function setNearbyTab(tab) {
  document.querySelectorAll("#nearbyTabs .time-toggle-btn").forEach((b) => b.classList.toggle("active", b.dataset.nearbyTab === tab));
  $("nearbyBusStops").classList.toggle("active", tab === "stops");
  $("nearbyStations").classList.toggle("active", tab === "stations");
  $("nearbyStopsHint").hidden = tab !== "stops";
}
document.querySelectorAll("#nearbyTabs .time-toggle-btn").forEach((btn) => {
  btn.onclick = () => setNearbyTab(btn.dataset.nearbyTab);
});
$("journeyNowBtn").onclick = () => setJourneyWhen("now");
$("journeyLaterBtn").onclick = () => setJourneyWhen("later");
$("destSearchBtn").onclick = findDestination;
$("destSearchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") findDestination();
});

// Leaflet miscalculates tile layout while its container is display:none —
// invalidateSize() once it's visible again fixes the blank/offset tiles.
const MAPS_BY_TAB = { home: () => [routeMap], journey: () => [journeyMap] };

function showTab(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === name));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  (MAPS_BY_TAB[name]?.() || []).forEach((m) => m && setTimeout(() => m.invalidateSize(), 0));
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.onclick = () => showTab(btn.dataset.tab);
});

initMaps();
renderFavourites();
refreshAlerts();
refreshJourney();
appendMsg(
  "agent",
  "Hi! I'm your commute companion. Ask me anything — e.g. \"is the North South Line okay right now?\""
);

setInterval(refreshAlerts, 60000);
setInterval(refreshJourney, 5 * 60000);
