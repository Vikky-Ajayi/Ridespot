from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

from src.training.evaluate import save_model
from src.training.features import DATASET_PATH
from src.training.train import MODEL_DIR, MODEL_PATHS, run_training_pipeline
from src.utils.logger import get_logger

logger = get_logger("ridespot.ml.retrain")
METADATA_PATH = Path(MODEL_PATHS["metadata"])
MIN_FEEDBACK_ROWS = 100

FEEDBACK_QUERY = """
    SELECT
        COALESCE(h.demand_level, 'medium') AS demand_level,
        COALESCE(e.event_type, 'Concert') AS event_type,
        COALESCE(e.event_category, 'Entertainment') AS event_category,
        COALESCE(e.city, 'Unknown') AS city,
        COALESCE(e.country, 'Nigeria') AS country,
        EXTRACT(MONTH FROM COALESCE(e.start_time, NOW()))::int AS month,
        EXTRACT(DOW FROM COALESCE(e.start_time, NOW()))::int AS day_of_week_num,
        EXTRACT(HOUR FROM COALESCE(e.start_time, NOW()))::int AS start_hour,
        EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW()))::int AS end_hour,
        GREATEST(
            EXTRACT(EPOCH FROM (COALESCE(e.end_time, e.start_time + INTERVAL '2 hours') - COALESCE(e.start_time, NOW()))) / 3600.0,
            0.5
        ) AS duration_hours,
        CASE
            WHEN EXTRACT(DOW FROM COALESCE(e.start_time, NOW())) IN (0, 6) THEN 1
            ELSE 0
        END AS is_weekend,
        0 AS is_public_holiday,
        CASE
            WHEN EXTRACT(MONTH FROM COALESCE(e.start_time, NOW())) = 12 THEN 1
            ELSE 0
        END AS is_detty_december,
        COALESCE(e.expected_attendance, 1000) AS venue_capacity,
        COALESCE(e.expected_attendance, 500) AS expected_attendance,
        LEAST(
            COALESCE(e.expected_attendance, 500)::float / GREATEST(COALESCE(e.expected_attendance, 1000), 1),
            1.5
        ) AS attendance_fill_rate,
        0.12 AS pre_book_ride_rate,
        0.35 AS base_ride_seeking_rate,
        7 AS venue_transport_score,
        10 AS venue_nearby_bars,
        500 AS venue_parking_spaces,
        10 AS avg_taxi_wait_pre_event_mins,
        1.0 AS venue_historical_perf_index,
        1.0 AS weather_ride_uplift,
        1.0 AS weather_att_impact,
        50.0 AS social_buzz_score,
        0 AS nearby_competing_events,
        CASE WHEN pf.acted_on THEN 0.3 ELSE 0.6 END AS driver_supply_index,
        1.0 AS fuel_availability_index,
        1.0 AS road_congestion_index,
        1.0 AS security_index,
        1.0 AS power_reliability_index,
        0 AS public_transport_disruption,
        0 AS tube_strike_active,
        CASE
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) <= 5
              OR EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) >= 22 THEN 1
            ELSE 0
        END AS is_late_night_end,
        CASE
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) BETWEEN 18 AND 21 THEN 1
            ELSE 0
        END AS is_evening_end,
        CASE
            WHEN EXTRACT(DOW FROM COALESCE(e.start_time, NOW())) IN (0, 6)
             AND (
                EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) <= 5
                OR EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) >= 22
             ) THEN 1
            ELSE 0
        END AS weekend_late_night,
        0.0 AS transport_crowd_pressure,
        0.0 AS rain_late_night,
        0.0 AS infrastructure_stress,
        0.0 AS uk_disruption_score,
        0.0 AS buzz_capacity_ratio,
        0.0 AS competition_pressure,
        CASE WHEN pf.acted_on THEN 0.7 ELSE 0.4 END AS driver_supply_gap,
        LN(COALESCE(e.expected_attendance, 500) + 1) AS log_attendance,
        CASE EXTRACT(DOW FROM COALESCE(e.start_time, NOW()))::int
            WHEN 0 THEN 'Sunday'
            WHEN 1 THEN 'Monday'
            WHEN 2 THEN 'Tuesday'
            WHEN 3 THEN 'Wednesday'
            WHEN 4 THEN 'Thursday'
            WHEN 5 THEN 'Friday'
            ELSE 'Saturday'
        END AS day_of_week,
        CASE
            WHEN COALESCE(e.country, 'Nigeria') = 'Nigeria' THEN
                CASE EXTRACT(MONTH FROM COALESCE(e.start_time, NOW()))::int
                    WHEN 1 THEN 'Harmattan'
                    WHEN 2 THEN 'Harmattan'
                    WHEN 3 THEN 'Dry'
                    WHEN 4 THEN 'Dry'
                    WHEN 5 THEN 'Rainy'
                    WHEN 6 THEN 'Rainy'
                    WHEN 7 THEN 'Rainy'
                    WHEN 8 THEN 'Rainy'
                    WHEN 9 THEN 'Rainy'
                    WHEN 10 THEN 'Dry'
                    WHEN 11 THEN 'Dry'
                    ELSE 'Harmattan'
                END
            ELSE
                CASE EXTRACT(MONTH FROM COALESCE(e.start_time, NOW()))::int
                    WHEN 1 THEN 'Winter'
                    WHEN 2 THEN 'Winter'
                    WHEN 3 THEN 'Spring'
                    WHEN 4 THEN 'Spring'
                    WHEN 5 THEN 'Spring'
                    WHEN 6 THEN 'Summer'
                    WHEN 7 THEN 'Summer'
                    WHEN 8 THEN 'Summer'
                    WHEN 9 THEN 'Autumn'
                    WHEN 10 THEN 'Autumn'
                    WHEN 11 THEN 'Autumn'
                    ELSE 'Winter'
                END
        END AS season,
        'Clear' AS weather_condition,
        CASE
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) IN (0, 1, 2, 3, 4, 5) THEN 'Late Night'
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) IN (6, 7, 8, 9) THEN 'Morning'
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) IN (10, 11, 12, 13) THEN 'Midday'
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) IN (14, 15, 16, 17) THEN 'Afternoon'
            WHEN EXTRACT(HOUR FROM COALESCE(e.end_time, e.start_time, NOW())) IN (18, 19, 20, 21) THEN 'Evening'
            ELSE 'Night'
        END AS end_time_period
    FROM prediction_feedback pf
    JOIN hotspots h ON pf.hotspot_id = h.id
    JOIN events e ON h.event_id = e.id
    WHERE
        pf.created_at > NOW() - INTERVAL '7 days'
        AND pf.feedback_score IS NOT NULL
"""


def load_current_metadata() -> dict[str, Any]:
    if not METADATA_PATH.exists():
        return {}
    with METADATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


async def fetch_feedback_rows(database_url: str) -> list[dict[str, Any]]:
    import asyncpg

    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(FEEDBACK_QUERY)
    finally:
        await conn.close()
    return [dict(row) for row in rows]


async def run_retraining():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.info(json.dumps({"event": "retrain_skipped", "reason": "missing_database_url"}))
        return {
            "status": "skipped",
            "reason": "DATABASE_URL is not configured for the ML service.",
        }

    try:
        feedback_rows = await fetch_feedback_rows(database_url)
    except ImportError:
        logger.warning(json.dumps({"event": "retrain_skipped", "reason": "asyncpg_not_installed"}))
        return {
            "status": "skipped",
            "reason": "asyncpg is not installed. Add it from requirements before retraining.",
        }
    except Exception as exc:
        logger.warning(
            json.dumps(
                {"event": "retrain_skipped", "reason": "feedback_query_failed", "error": str(exc)}
            )
        )
        return {
            "status": "skipped",
            "reason": f"Could not fetch feedback data: {exc}",
        }

    if len(feedback_rows) < MIN_FEEDBACK_ROWS:
        logger.info(
            json.dumps(
                {
                    "event": "retrain_skipped",
                    "reason": "insufficient_feedback",
                    "feedback_records": len(feedback_rows),
                }
            )
        )
        return {
            "status": "skipped",
            "reason": f"Only {len(feedback_rows)} feedback records. Need {MIN_FEEDBACK_ROWS}+ to retrain.",
        }

    original_df = pd.read_csv(DATASET_PATH)
    feedback_df = pd.DataFrame(feedback_rows)
    combined_df = pd.concat([original_df, feedback_df], ignore_index=True)

    current_metadata = load_current_metadata()
    old_accuracy = float(current_metadata.get("accuracy", 0.0))

    result = run_training_pipeline(
        combined_df,
        persist=False,
        summary_label="Step 5 retraining summary",
    )
    new_metadata = dict(result["metadata"])
    new_accuracy = float(new_metadata.get("accuracy", 0.0))

    if not result["success"]:
        logger.info(
            json.dumps(
                {
                    "event": "retrain_rejected",
                    "reason": "threshold_not_met",
                    "old_accuracy": old_accuracy,
                    "new_accuracy": new_accuracy,
                }
            )
        )
        return {
            "status": "rejected",
            "reason": "New model did not meet the production threshold.",
            "old_accuracy": old_accuracy,
            "new_accuracy": new_accuracy,
            "feedback_records_used": len(feedback_rows),
        }

    if new_accuracy < old_accuracy:
        logger.info(
            json.dumps(
                {
                    "event": "retrain_rejected",
                    "reason": "accuracy_regressed",
                    "old_accuracy": old_accuracy,
                    "new_accuracy": new_accuracy,
                }
            )
        )
        return {
            "status": "rejected",
            "reason": "New model did not improve accuracy.",
            "old_accuracy": old_accuracy,
            "new_accuracy": new_accuracy,
            "feedback_records_used": len(feedback_rows),
        }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    new_metadata["retraining_feedback_records"] = len(feedback_rows)
    new_metadata["previous_accuracy"] = round(old_accuracy, 4)

    save_model(
        result["model"],
        result["encoders"],
        result["scaler"],
        new_metadata,
        MODEL_PATHS,
    )

    logger.info(
        json.dumps(
            {
                "event": "retrain_updated",
                "old_accuracy": old_accuracy,
                "new_accuracy": new_accuracy,
                "feedback_records_used": len(feedback_rows),
            }
        )
    )
    return {
        "status": "updated",
        "old_accuracy": old_accuracy,
        "new_accuracy": new_accuracy,
        "feedback_records_used": len(feedback_rows),
    }
