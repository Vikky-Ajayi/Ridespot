from __future__ import annotations

import json
import math
import random
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException

from src.api.schemas import (
    HealthResponse,
    ModelMetadataResponse,
    PredictionRequest,
    PredictionResponse,
)
from src.training.features import build_feature_matrix, derive_features
from src.utils.demand_rules import apply_deterministic_rules
from src.utils.logger import get_logger
from src.utils.operating_policy import (
    OPERATING_ACCURACY_TARGET,
    OPERATING_CONFIDENCE_THRESHOLD,
    classify_prediction,
)

logger = get_logger("ridespot.ml.api")
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODEL_DIR / "ridespot_model.pkl"
ENCODER_PATH = MODEL_DIR / "ridespot_encoder.pkl"
SCALER_PATH = MODEL_DIR / "ridespot_scaler.pkl"
METADATA_PATH = MODEL_DIR / "model_metadata.json"


class ModelRegistry:
    def __init__(self) -> None:
        self.model: Any | None = None
        self.encoders: dict[str, Any] | None = None
        self.scaler: Any | None = None
        self.metadata: dict[str, Any] | None = None


registry = ModelRegistry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(title="RideSpot ML Service", version="1.0.0", lifespan=lifespan)


def load_model() -> None:
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r".*If you are loading a serialized model.*",
                category=UserWarning,
                module=r"xgboost\.core",
            )
            registry.model = joblib.load(MODEL_PATH)
        registry.encoders = joblib.load(ENCODER_PATH)
        registry.scaler = joblib.load(SCALER_PATH)
        with METADATA_PATH.open("r", encoding="utf-8") as handle:
            registry.metadata = json.load(handle)
        logger.info(
            json.dumps(
                {
                    "event": "model_loaded",
                    "model_path": str(MODEL_PATH),
                    "accuracy": registry.metadata.get("accuracy"),
                    "model_name": registry.metadata.get("model_name"),
                    "trained_at": registry.metadata.get("trained_at"),
                }
            )
        )
    except FileNotFoundError:
        registry.model = None
        registry.encoders = None
        registry.scaler = None
        registry.metadata = None
        logger.warning(
            json.dumps(
                {
                    "event": "model_missing",
                    "model_path": str(MODEL_PATH),
                    "message": "No trained model found. Run training first.",
                }
            )
        )


def calculate_drivers_needed(attendance: int, demand_level: str, country: str) -> int:
    del country
    ratios = {"very-high": 5, "high": 7, "medium": 10, "low": 15}
    ratio = ratios.get(demand_level, 10)
    return max(1, math.ceil(attendance / ratio))


def calculate_radius(city: str, attendance: int, event_type: str) -> int:
    if city in ["Lagos", "Abuja"]:
        base = 400 if attendance > 5000 else 250
    else:
        base = 200 if attendance > 5000 else 100

    if event_type in ["Club Night", "New Year Party", "Music Festival"]:
        base = int(base * 1.4)

    return max(50, min(base, 1200))


def calculate_peak_window(demand_level: str, end_hour: int) -> int:
    rng = random.Random(f"{demand_level}:{end_hour}")
    if end_hour in [0, 1, 2, 3, 4, 22, 23]:
        return rng.randint(8, 20)
    if demand_level == "very-high":
        return rng.randint(8, 18)
    if demand_level == "high":
        return rng.randint(12, 25)
    if demand_level == "medium":
        return rng.randint(20, 35)
    return rng.randint(30, 50)


def generate_insight(demand_level: str, city: str, score: float) -> str:
    insights = {
        "very-high": (
            f"{city} is experiencing surge demand. {score:.0f}/100 score - "
            "most drivers earning 3x average right now."
        ),
        "high": f"High demand in {city}. Demand score {score:.0f}/100 - good earning opportunity.",
        "medium": f"Moderate demand in {city}. Score {score:.0f}/100. Low driver saturation.",
        "low": f"Low demand currently in {city}. Consider moving to a higher demand zone.",
    }
    return insights.get(demand_level, f"Demand score: {score:.0f}/100")


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ridespot-ml",
        "model_loaded": registry.model is not None,
        "accuracy": registry.metadata.get("accuracy") if registry.metadata else None,
    }


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model_loaded=registry.model is not None,
        accuracy=registry.metadata.get("accuracy") if registry.metadata else None,
        operating_accuracy_target=OPERATING_ACCURACY_TARGET,
        operating_confidence_threshold=OPERATING_CONFIDENCE_THRESHOLD,
    )


@app.get("/model/metadata", response_model=ModelMetadataResponse)
async def get_metadata() -> ModelMetadataResponse:
    if registry.metadata is None:
        raise HTTPException(status_code=404, detail="No model metadata found")
    return ModelMetadataResponse(**registry.metadata)


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest) -> PredictionResponse:
    if registry.model is None or registry.encoders is None or registry.scaler is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run training pipeline first.")

    row = derive_features(request.model_dump())
    X, _, _ = build_feature_matrix(
        pd.DataFrame([row]),
        encoders=registry.encoders,
        scaler=registry.scaler,
        fit=False,
    )

    probabilities = registry.model.predict_proba(X)[0]
    class_idx = int(np.argmax(probabilities))
    confidence = float(probabilities[class_idx])

    target_encoder = registry.encoders.get("target_encoder")
    if target_encoder is None:
        raise HTTPException(status_code=500, detail="Target encoder missing from model artifacts.")

    demand_level = str(target_encoder.classes_[class_idx])
    weights = {"very-high": 100, "high": 75, "medium": 45, "low": 15}
    demand_score = sum(
        float(probabilities[i]) * weights.get(str(target_encoder.classes_[i]), 50)
        for i in range(len(probabilities))
    )
    demand_level, demand_score, rule_applied = apply_deterministic_rules(
        row,
        demand_level,
        demand_score,
        confidence,
    )
    policy = classify_prediction(confidence)

    response = PredictionResponse(
        demand_level=demand_level,
        demand_score=round(float(demand_score), 2),
        confidence=round(confidence, 4),
        probabilities={
            str(target_encoder.classes_[i]): round(float(probabilities[i]), 4)
            for i in range(len(probabilities))
        },
        prediction_mode=policy.prediction_mode,
        is_high_confidence=policy.is_high_confidence,
        operating_confidence_threshold=policy.operating_confidence_threshold,
        operating_accuracy_target=policy.operating_accuracy_target,
        fallback_reason=policy.fallback_reason,
        drivers_needed=calculate_drivers_needed(
            request.expected_attendance, demand_level, request.country
        ),
        optimal_radius_meters=calculate_radius(
            request.city, request.expected_attendance, request.event_type
        ),
        peak_booking_window_mins=calculate_peak_window(demand_level, request.end_hour),
        insight_text=generate_insight(demand_level, request.city, demand_score),
        model_version=str(registry.metadata.get("trained_at", "unknown")),
    )

    logger.info(
        json.dumps(
            {
                "event": "prediction_served",
                "city": request.city,
                "country": request.country,
                "demand_level": response.demand_level,
                "demand_score": response.demand_score,
                "confidence": response.confidence,
                "prediction_mode": response.prediction_mode,
                "is_high_confidence": response.is_high_confidence,
                "rule_applied": rule_applied,
            }
        )
    )
    return response


@app.post("/retrain")
async def trigger_retrain():
    from src.training.retrain import run_retraining

    result = await run_retraining()
    if result.get("status") == "updated":
        load_model()
    return result
