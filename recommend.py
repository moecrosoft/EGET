def recommend_for_arjun(train_alerts, punggol_crowd, serangoon_crowd, cycling_ok, bus_services, forecast_level=None):
    options = []

    # Combine crowd at both his key stations — worst of the two matters more
    crowd_priority = {"h": 3, "m": 2, "l": 1, "NA": 2}
    worse_crowd = max(
        [punggol_crowd["level"], serangoon_crowd["level"]],
        key=lambda lvl: crowd_priority.get(lvl, 2)
    )

    # Proactive check: is the forecast worse than right now? If so, warn ahead of time.
    forecast_warning = ""
    if forecast_level and crowd_priority.get(forecast_level, 2) > crowd_priority.get(worse_crowd, 2):
        forecast_warning = f" — heads up: forecast shows it getting busier ('{forecast_level}') soon, consider leaving now"

    # Option 1: cycle + LRT/NEL route
    if cycling_ok:
        options.append({
            "mode": "cycle + LRT",
            "crowd_level": worse_crowd,
            "reason": ("Good weather" + (", low crowd on your route" if worse_crowd == "l" else f", crowd level '{worse_crowd}' at Punggol/Serangoon")) + forecast_warning
        })

    # Option 2: regular LRT/NEL route (no cycling)
    options.append({
        "mode": "LRT (no cycling)",
        "crowd_level": worse_crowd,
        "reason": ("Standard route" if cycling_ok else "Weather not ideal for cycling") + forecast_warning
    })

    # Option 3: bus, if any service is available
    for bus in bus_services:
        if bus["load"] == "LSD":
            reason = "Bus is nearly full — may need to wait for next one"
        elif bus["load"] == "SDA":
            reason = "Standing room only, but boardable"
        elif bus["load"] == "SEA":
            reason = "Seats available — comfortable option"
        else:
            reason = "Bus load unknown"

        options.append({
            "mode": f"Bus {bus['service_no']}",
            "crowd_level": bus["load"],
            "reason": reason
        })

    # Flag disruptions on his rail route
    disrupted_lines = [seg.get("Line") for seg in train_alerts["segments"]]
    if "NEL" in disrupted_lines or "CCL" in disrupted_lines:
        for opt in options:
            if "Bus" not in opt["mode"]:
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