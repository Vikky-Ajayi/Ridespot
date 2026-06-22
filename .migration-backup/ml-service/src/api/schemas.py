from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    event_type: str
    event_category: str
    city: str
    country: str
    venue_capacity: int = Field(gt=0)
    expected_attendance: int = Field(ge=0)
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=0, le=23)
    duration_hours: float = Field(gt=0)
    is_weekend: int = Field(ge=0, le=1)
    is_public_holiday: int = Field(ge=0, le=1)
    is_detty_december: int = Field(ge=0, le=1)

    weather_condition: str = "Clear"
    social_buzz_score: float = Field(default=50.0, ge=0, le=100)
    nearby_competing_events: int = Field(default=0, ge=0)
    driver_supply_index: float = Field(default=0.5, ge=0, le=1)
    fuel_availability_index: float = Field(default=1.0, ge=0, le=1)
    road_congestion_index: float = Field(default=1.0, ge=0, le=1)
    security_index: float = Field(default=1.0, ge=0, le=1)
    power_reliability_index: float = Field(default=1.0, ge=0, le=1)
    public_transport_disruption: int = Field(default=0, ge=0, le=1)
    tube_strike_active: int = Field(default=0, ge=0, le=1)

    venue_transport_score: int = Field(default=7, ge=1, le=10)
    venue_nearby_bars: int = Field(default=10, ge=0)
    venue_parking_spaces: int = Field(default=500, ge=0)
    avg_taxi_wait_pre_event_mins: int = Field(default=10, ge=0)
    venue_historical_perf_index: float = Field(default=1.0)
    pre_book_ride_rate: float = Field(default=0.12, ge=0)
    base_ride_seeking_rate: float = Field(default=0.35, ge=0)
    day_of_week_num: int = Field(default=4, ge=0, le=6)
    month: int = Field(default=6, ge=1, le=12)
    day_of_week: str = "Friday"


class PredictionResponse(BaseModel):
    demand_level: Literal["very-high", "high", "medium", "low"]
    demand_score: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[str, float]
    prediction_mode: Literal["ml-certified", "conservative-fallback"]
    is_high_confidence: bool
    operating_confidence_threshold: float = Field(ge=0, le=1)
    operating_accuracy_target: float = Field(ge=0, le=1)
    fallback_reason: str | None = None
    drivers_needed: int = Field(ge=1)
    optimal_radius_meters: int = Field(ge=50)
    peak_booking_window_mins: int = Field(ge=1)
    insight_text: str
    model_version: str


class ModelMetadataResponse(BaseModel):
    accuracy: float
    f1_macro: float
    f1_weighted: float
    model_name: str
    model_version: str
    trained_at: str
    threshold_met: bool
    dataset_size: int
    class_names: list[str]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    accuracy: float | None = None
    operating_accuracy_target: float | None = None
    operating_confidence_threshold: float | None = None
