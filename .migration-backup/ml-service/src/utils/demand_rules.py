from __future__ import annotations

from typing import Any

LEVEL_ORDER = ["low", "medium", "high", "very-high"]


def _clamp_score(score: float) -> float:
    return round(max(0.0, min(100.0, score)), 2)


def _promote(level: str, steps: int = 1) -> str:
    index = LEVEL_ORDER.index(level) if level in LEVEL_ORDER else 0
    return LEVEL_ORDER[min(len(LEVEL_ORDER) - 1, index + steps)]


def _demote(level: str, steps: int = 1) -> str:
    index = LEVEL_ORDER.index(level) if level in LEVEL_ORDER else 0
    return LEVEL_ORDER[max(0, index - steps)]


def apply_deterministic_rules(
    features: dict[str, Any],
    demand_level: str,
    demand_score: float,
    confidence: float,
) -> tuple[str, float, bool]:
    """Apply market-safe deterministic overrides using only pre-prediction features."""
    if confidence > 0.50:
        return demand_level, _clamp_score(demand_score), False

    level = demand_level
    score = float(demand_score)
    changed = False

    attendance = float(features.get("expected_attendance") or 0)
    fill_rate = float(features.get("attendance_fill_rate") or 0)
    is_late_night = int(features.get("is_late_night_end") or 0)
    is_weekend = int(features.get("is_weekend") or 0)
    is_detty_december = int(features.get("is_detty_december") or 0)
    driver_gap = float(features.get("driver_supply_gap") or 0)
    uk_disruption = float(features.get("uk_disruption_score") or 0)
    infrastructure_stress = float(features.get("infrastructure_stress") or 0)
    competing_events = int(features.get("nearby_competing_events") or 0)
    social_buzz = float(features.get("social_buzz_score") or 0)

    if attendance >= 8000 and fill_rate >= 0.72 and is_late_night:
        level = _promote(level, 2 if confidence < 0.72 else 1)
        score += 12
        changed = True
    elif attendance >= 3500 and is_weekend and (driver_gap >= 0.45 or social_buzz >= 72):
        level = _promote(level)
        score += 7
        changed = True

    if is_detty_december and str(features.get("country")) == "Nigeria" and is_late_night:
        level = _promote(level)
        score += 8
        changed = True

    if uk_disruption >= 0.4 or infrastructure_stress >= 0.35:
        level = _promote(level)
        score += 6
        changed = True

    if attendance < 350 and social_buzz < 25 and not is_late_night and competing_events == 0:
        level = _demote(level)
        score -= 9
        changed = True

    return level, _clamp_score(score), changed
