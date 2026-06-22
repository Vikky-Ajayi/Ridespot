from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler

DATASET_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "ridehailing_robust_training_dataset.csv"
)

CATEGORICAL_FEATURES = [
    "event_type",
    "event_category",
    "city",
    "country",
    "day_of_week",
    "season",
    "weather_condition",
    "end_time_period",
]

NUMERICAL_FEATURES = [
    "month",
    "day_of_week_num",
    "start_hour",
    "end_hour",
    "duration_hours",
    "is_weekend",
    "is_public_holiday",
    "is_detty_december",
    "venue_capacity",
    "expected_attendance",
    "attendance_fill_rate",
    "pre_book_ride_rate",
    "base_ride_seeking_rate",
    "venue_transport_score",
    "venue_nearby_bars",
    "venue_parking_spaces",
    "avg_taxi_wait_pre_event_mins",
    "venue_historical_perf_index",
    "weather_ride_uplift",
    "weather_att_impact",
    "social_buzz_score",
    "nearby_competing_events",
    "driver_supply_index",
    "fuel_availability_index",
    "road_congestion_index",
    "security_index",
    "power_reliability_index",
    "public_transport_disruption",
    "tube_strike_active",
    "is_late_night_end",
    "is_evening_end",
    "weekend_late_night",
    "transport_crowd_pressure",
    "rain_late_night",
    "infrastructure_stress",
    "uk_disruption_score",
    "buzz_capacity_ratio",
    "competition_pressure",
    "driver_supply_gap",
    "log_attendance",
]

TARGET = "demand_level"

FORBIDDEN_FEATURES = {
    "demand_score",
    "demand_level",
    "actual_ride_requests",
    "event_id",
    "event_name",
    "driver_feedback_score",
    "driver_acted_on_prediction",
}

WEATHER_RIDE_UPLIFT = {
    "clear": 1.0,
    "cloudy": 1.03,
    "overcast": 1.06,
    "rain": 1.18,
    "light rain": 1.12,
    "heavy rain": 1.26,
    "storm": 1.3,
}

WEATHER_ATTENDANCE_IMPACT = {
    "clear": 1.0,
    "cloudy": 0.99,
    "overcast": 0.98,
    "rain": 0.93,
    "light rain": 0.96,
    "heavy rain": 0.9,
    "storm": 0.84,
}


def normalise_target_labels(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "-", regex=True)
    )


def load_dataset(path: str | Path = DATASET_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    df[TARGET] = normalise_target_labels(df[TARGET])
    print(f"Dataset loaded: {len(df):,} rows, {len(df.columns)} columns")
    print(f"Demand distribution:\n{df[TARGET].value_counts()}")
    missing = df.isnull().sum()
    print(f"Missing values:\n{missing[missing > 0]}")
    return df


def validate_feature_contract(df: pd.DataFrame) -> dict[str, Any]:
    feature_columns = set(NUMERICAL_FEATURES + CATEGORICAL_FEATURES)
    dataset_columns = set(df.columns)

    missing_required = sorted(feature_columns.union({TARGET}) - dataset_columns)
    forbidden_present = sorted(FORBIDDEN_FEATURES & feature_columns)
    unexpected_missing = sorted(col for col in feature_columns if df[col].isnull().all())

    return {
        "required_feature_count": len(feature_columns),
        "missing_required_columns": missing_required,
        "forbidden_columns_in_features": forbidden_present,
        "all_null_feature_columns": unexpected_missing,
    }


def get_weather_uplift(condition: str, country: str) -> float:
    key = str(condition).strip().lower()
    base = WEATHER_RIDE_UPLIFT.get(key, 1.0)
    if str(country).strip().lower() == "uk" and "rain" in key:
        return round(base + 0.04, 4)
    return round(base, 4)


def get_weather_att_impact(condition: str, country: str) -> float:
    key = str(condition).strip().lower()
    base = WEATHER_ATTENDANCE_IMPACT.get(key, 1.0)
    if str(country).strip().lower() == "nigeria" and "storm" in key:
        return round(base - 0.03, 4)
    return round(base, 4)


def derive_features(data: dict[str, Any]) -> dict[str, Any]:
    row = data.copy()

    attendance = float(row["expected_attendance"])
    capacity = float(row["venue_capacity"])

    row["attendance_fill_rate"] = round(attendance / max(capacity, 1.0), 4)
    row["log_attendance"] = round(float(np.log1p(attendance)), 4)

    end_hour = int(row["end_hour"])
    row["is_late_night_end"] = int(end_hour <= 5 or end_hour >= 22)
    row["is_evening_end"] = int(18 <= end_hour < 22)
    row["weekend_late_night"] = int(row["is_weekend"]) * row["is_late_night_end"]

    row["transport_crowd_pressure"] = round(
        (10 - float(row["venue_transport_score"])) * row["attendance_fill_rate"], 4
    )

    weather_ride_uplift = get_weather_uplift(row["weather_condition"], row["country"])
    weather_att_impact = get_weather_att_impact(row["weather_condition"], row["country"])
    row["weather_ride_uplift"] = weather_ride_uplift
    row["weather_att_impact"] = weather_att_impact
    row["rain_late_night"] = round(weather_ride_uplift * row["is_late_night_end"], 4)

    if str(row["country"]).strip().lower() == "nigeria":
        row["infrastructure_stress"] = round(
            (1 - float(row["fuel_availability_index"])) * 0.40
            + (1 - float(row["road_congestion_index"])) * 0.35
            + (1 - float(row["security_index"])) * 0.25,
            4,
        )
        row["uk_disruption_score"] = 0.0
    else:
        row["infrastructure_stress"] = 0.0
        row["uk_disruption_score"] = round(
            int(row["tube_strike_active"]) * 0.60
            + int(row["public_transport_disruption"]) * 0.40,
            4,
        )

    row["buzz_capacity_ratio"] = round(
        float(row["social_buzz_score"]) / (float(np.log1p(capacity)) + 1.0), 4
    )

    competing_events = int(row["nearby_competing_events"])
    row["competition_pressure"] = (
        0.0
        if competing_events == 0
        else 0.12
        if competing_events == 1
        else 0.26
        if competing_events == 2
        else 0.42
        if competing_events == 3
        else 0.60
    )

    row["driver_supply_gap"] = round(1 - float(row["driver_supply_index"]), 4)

    if end_hour in [0, 1, 2, 3, 4, 5]:
        row["end_time_period"] = "Late Night"
    elif end_hour in [6, 7, 8, 9]:
        row["end_time_period"] = "Morning"
    elif end_hour in [10, 11, 12, 13]:
        row["end_time_period"] = "Midday"
    elif end_hour in [14, 15, 16, 17]:
        row["end_time_period"] = "Afternoon"
    elif end_hour in [18, 19, 20, 21]:
        row["end_time_period"] = "Evening"
    else:
        row["end_time_period"] = "Night"

    month = int(row.get("month", 6))
    if str(row["country"]).strip().lower() == "nigeria":
        seasons = {
            1: "Harmattan",
            2: "Harmattan",
            3: "Dry",
            4: "Dry",
            5: "Rainy",
            6: "Rainy",
            7: "Rainy",
            8: "Rainy",
            9: "Rainy",
            10: "Dry",
            11: "Dry",
            12: "Harmattan",
        }
    else:
        seasons = {
            1: "Winter",
            2: "Winter",
            3: "Spring",
            4: "Spring",
            5: "Spring",
            6: "Summer",
            7: "Summer",
            8: "Summer",
            9: "Autumn",
            10: "Autumn",
            11: "Autumn",
            12: "Winter",
        }
    row["season"] = seasons.get(month, "Unknown")

    row.setdefault("pre_book_ride_rate", 0.12)
    row.setdefault("base_ride_seeking_rate", 0.35)
    row.setdefault("day_of_week_num", 4)
    row.setdefault("month", 6)
    row.setdefault("day_of_week", "Friday")

    return row


def build_feature_matrix(
    df: pd.DataFrame,
    encoders: dict[str, LabelEncoder] | None = None,
    scaler: StandardScaler | None = None,
    fit: bool = True,
):
    df = df.copy()

    df["social_buzz_score"] = df["social_buzz_score"].fillna(df["social_buzz_score"].median())
    if "driver_feedback_score" in df.columns:
        df["driver_feedback_score"] = df["driver_feedback_score"].fillna(0)

    if fit:
        encoders = {}
        for col in CATEGORICAL_FEATURES:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
    else:
        assert encoders is not None
        for col in CATEGORICAL_FEATURES:
            le = encoders[col]
            known_classes = set(le.classes_)
            df[col] = df[col].astype(str).map(
                lambda value: le.transform([value])[0] if value in known_classes else -1
            )

    X = df[NUMERICAL_FEATURES + CATEGORICAL_FEATURES].values

    if fit:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)
    else:
        assert scaler is not None
        X = scaler.transform(X)

    return X, encoders, scaler


def encode_target(
    df: pd.DataFrame, encoder: LabelEncoder | None = None, fit: bool = True
):
    if fit:
        encoder = LabelEncoder()
        y = encoder.fit_transform(df[TARGET])
        return y, encoder

    assert encoder is not None
    return encoder.transform(df[TARGET]), encoder
