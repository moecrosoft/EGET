def find_relevant_messages(messages, keywords=("NEL", "North East Line", "CCL", "Circle Line", "Punggol", "Serangoon", "one-north")):
    """
    TrainServiceAlerts.Message is populated daily (unlike AffectedSegments, which
    is empty on a normal day) — this is real, always-available signal, not
    something that needs a simulated/injected scenario to demonstrate. Filters
    to messages that actually mention Arjun's route/lines/stations, since the
    feed carries advisories for the whole network, most of which don't apply to him.
    """
    relevant = []
    for msg in messages:
        content = msg.get("Content", "")
        if any(keyword.lower() in content.lower() for keyword in keywords):
            relevant.append(content)
    return relevant


# Shared crowd ordering used both for picking the worse of two stations and
# for comparing forecast slots — one definition, used everywhere below.
CROWD_PRIORITY = {"l": 1, "m": 2, "h": 3, "NA": 2}

# Single source of truth for the walk-estimate disclaimer, used on every
# option that includes a walk leg — avoids drifting wording between them.
WALK_DISCLAIMER = " [walk time(s) are estimates, pending real routing data]"

# PLACEHOLDER walk-leg estimates — the brief requires door-to-door routing
# ("a route that starts at a station and ends at a station is not a
# commuter's journey"), but computing REAL walking time/distance needs
# OneMap/OSM geospatial routing, which is out of scope for this data layer
# (see WRITEUP.md). These are rough, clearly-labelled assumed minutes so
# every option is structurally door-to-door rather than station-to-station,
# pending the routing/GIS component supplying real figures.
WALK_ESTIMATES_MIN = {
    "home_to_punggol_station": 5,     # ASSUMED — typical HDB-to-LRT distance in Punggol
    "home_to_bus_stop": 4,             # ASSUMED
    "one_north_exit_to_office": 6,      # ASSUMED — typical one-north business park walk
}


def recommend_for_arjun(train_alerts, punggol_crowd, serangoon_crowd, cycling_ok, bus_services, forecast_level=None, delay_suggestion=None, is_atypical_day=False, atypical_reason="", walk_estimates=WALK_ESTIMATES_MIN):
    options = []

    # Combine crowd at both his key stations — worst of the two matters more
    worse_crowd = max(
        [punggol_crowd["level"], serangoon_crowd["level"]],
        key=lambda lvl: CROWD_PRIORITY.get(lvl, 2)
    )

    # Advisory notes from the daily Message stream — relevant to Arjun's route only
    relevant_messages = find_relevant_messages(train_alerts.get("messages", []))
    advisory_note = f" — advisory: {relevant_messages[0][:120]}" if relevant_messages else ""

    # Proactive check: is the forecast worse than right now? If so, warn ahead of time.
    # Suppressed on an atypical day (public holiday or school vacation) — PCDForecast
    # reflects typical weekday demand, which doesn't hold on those days, so the
    # "getting busier soon" nudge would be based on a pattern that doesn't apply today.
    forecast_warning = ""
    if not is_atypical_day and forecast_level and CROWD_PRIORITY.get(forecast_level, 2) > CROWD_PRIORITY.get(worse_crowd, 2):
        forecast_warning = f" — heads up: forecast shows it getting busier ('{forecast_level}') soon, consider leaving now"
    atypical_note = f" ({atypical_reason} — usual crowd forecast may not apply)" if is_atypical_day else ""

    # Built once, reused by both LRT-based options below (previously duplicated)
    shared_notes = forecast_warning + atypical_note + advisory_note

    exit_walk = walk_estimates["one_north_exit_to_office"]

    # Option 1: cycle + LRT/NEL route — no walk to Punggol (he cycles), still
    # walks from the one-north exit to his office at the destination end.
    if cycling_ok:
        options.append({
            "mode": f"cycle + LRT + walk {exit_walk}min (to office)",
            "crowd_level": worse_crowd,
            "reason": ("Good weather" + (", low crowd on your route" if worse_crowd == "l" else f", crowd level '{worse_crowd}' at Punggol/Serangoon")) + shared_notes + WALK_DISCLAIMER
        })

    # Option 2: regular LRT/NEL route (no cycling) — walk legs on both ends
    home_walk = walk_estimates["home_to_punggol_station"]
    options.append({
        "mode": f"walk {home_walk}min + LRT + walk {exit_walk}min",
        "crowd_level": worse_crowd,
        "reason": ("Standard route" if cycling_ok else "Weather not ideal for cycling") + shared_notes + WALK_DISCLAIMER
    })

    # Option 3: bus, if any service is available
    bus_walk = walk_estimates["home_to_bus_stop"]
    for bus in bus_services:
        if bus["load"] == "LSD":
            reason = "Bus is nearly full — may need to wait for next one"
        elif bus["load"] == "SDA":
            reason = "Standing room only, but boardable"
        elif bus["load"] == "SEA":
            reason = "Seats available — comfortable option"
        else:
            reason = "Bus load unknown"

        bus_type_note = {"SD": "single-deck", "DD": "double-deck", "BD": "bendy"}.get(bus.get("bus_type"), "")
        if bus_type_note:
            reason += f" ({bus_type_note})"
        reason += WALK_DISCLAIMER

        options.append({
            "mode": f"walk {bus_walk}min + Bus {bus['service_no']} + walk {exit_walk}min",
            "crowd_level": bus["load"],
            "reason": reason
        })

    # Option 4: delay departure, if the forecast shows a meaningfully better window soon
    # (matches Arjun's persona: "will happily leave twenty minutes later to avoid a crush")
    # Suppressed on an atypical day for the same reason as the forecast warning above.
    if not is_atypical_day and delay_suggestion and delay_suggestion.get("worth_delaying"):
        options.append({
            "mode": f"wait {delay_suggestion['delay_minutes']}min, leave later",
            "crowd_level": delay_suggestion["expected_level"],
            "reason": (
                f"Crowd is expected to drop to '{delay_suggestion['expected_level']}' in "
                f"about {delay_suggestion['delay_minutes']} min (currently "
                f"'{delay_suggestion['current_level']}') — worth waiting if you're not in a rush"
            )
        })

    # Flag disruptions on his rail route
    disrupted_lines = [seg.get("Line") for seg in train_alerts["segments"]]
    if "NEL" in disrupted_lines or "CCL" in disrupted_lines:
        for opt in options:
            if "Bus" not in opt["mode"] and "wait" not in opt["mode"]:
                opt["reason"] += " — disruption on your route, check alternate"

    return options


def score_option(option):
    """Higher score = better option. Works generically off crowd_level, whatever it is."""
    crowd = option["crowd_level"]

    # Unified scoring across rail crowd levels (l/m/h/NA) and bus load (SEA/SDA/LSD)
    crowd_scores = {
        "l": 10, "SEA": 10,
        "m": 5, "SDA": 5,
        "h": 1, "LSD": 1,
        "NA": 5, "": 5
    }
    score = crowd_scores.get(crowd, 5)  # default to neutral if we see something unexpected

    if "disruption" in option["reason"].lower():
        score -= 5

    if "heads up" in option["reason"].lower():
        score -= 2  # smaller penalty than an active disruption, but still nudges ranking

    return score


def rank_options(options):
    def sort_key(pair):
        opt, score = pair
        # Tie-breaker: prefer cycling slightly when scores are equal (matches Arjun's stated preference)
        preference_bonus = 0.5 if "cycle" in opt["mode"].lower() else 0
        return -(score + preference_bonus)

    scored = [(opt, score_option(opt)) for opt in options]
    scored.sort(key=sort_key)
    return scored


def categorize_top_choices(ranked):
    """
    Reduces the full ranked list to three labelled picks, matching the brief's
    "realistic timing, uncertainty made visible" principle — we only label a
    category we can honestly back with real data.

    - "best_overall": the #1 ranked option (already factors crowd, disruption,
      forecast, atypical-day awareness).
    - "most_comfortable": whichever option has the best (lowest) crowd_level,
      which may differ from best_overall if e.g. the top pick was penalised
      for a disruption but still has a genuinely low crowd reading.
    - "fastest": deliberately NOT claimed here. This layer has no real transit
      duration data (walk-leg minutes are placeholder estimates, not ride
      time) — that requires the routing/GIS component's OneMap integration.
      Returned as None with an explanatory note rather than a fabricated pick,
      so the app never shows a confident number it can't back up.
    """
    if not ranked:
        return {"best_overall": None, "most_comfortable": None, "fastest": None,
                "fastest_note": "No options available."}

    crowd_priority = {"l": 1, "SEA": 1, "m": 2, "SDA": 2, "h": 3, "LSD": 3, "NA": 2, "": 2}
    most_comfortable = min(ranked, key=lambda pair: crowd_priority.get(pair[0]["crowd_level"], 2))

    return {
        "best_overall": ranked[0],
        "most_comfortable": most_comfortable,
        "fastest": None,
        "fastest_note": "Not available from this layer — needs real transit duration data from routing/GIS (OneMap), not just crowd/walk estimates."
    }


def find_better_departure_window(forecast_slots, current_time_str, max_delay_minutes=60):
    """
    Matches Arjun's persona trait: 'will happily leave twenty minutes later to
    avoid a crush.' Scans forecast slots ahead of now (up to max_delay_minutes)
    and returns the best (lowest-crowd) slot found, if any slot beats current
    conditions. Returns {"worth_delaying": False} if nothing ahead is better.
    """
    from datetime import datetime

    if not forecast_slots:
        return {"worth_delaying": False}

    current_time = datetime.fromisoformat(current_time_str)

    current_slot = None
    for slot in forecast_slots:
        slot_time = datetime.fromisoformat(slot["start_time"])
        if slot_time <= current_time:
            current_slot = slot
        else:
            break
    current_level = current_slot["level"] if current_slot else "NA"
    best_score = CROWD_PRIORITY.get(current_level, 2)

    best_slot = None
    for slot in forecast_slots:
        slot_time = datetime.fromisoformat(slot["start_time"])
        delay = (slot_time - current_time).total_seconds() / 60
        if 0 < delay <= max_delay_minutes:
            score = CROWD_PRIORITY.get(slot["level"], 2)
            if score < best_score:
                best_score = score
                best_slot = slot

    if best_slot:
        delay_minutes = int((datetime.fromisoformat(best_slot["start_time"]) - current_time).total_seconds() / 60)
        return {
            "worth_delaying": True,
            "delay_minutes": delay_minutes,
            "expected_level": best_slot["level"],
            "current_level": current_level
        }

    return {"worth_delaying": False, "current_level": current_level}