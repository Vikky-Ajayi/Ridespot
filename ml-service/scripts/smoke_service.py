import sys
from pathlib import Path

from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from main import app


payload = {
    "event_type": "Concert",
    "event_category": "Entertainment",
    "city": "London",
    "country": "UK",
    "venue_capacity": 90000,
    "expected_attendance": 70000,
    "start_hour": 20,
    "end_hour": 23,
    "duration_hours": 3,
    "is_weekend": 1,
    "is_public_holiday": 0,
    "is_detty_december": 0,
}


with TestClient(app) as client:
    health = client.get("/health")
    prediction = client.post("/predict", json=payload)

    health.raise_for_status()
    prediction.raise_for_status()

    health_payload = health.json()
    prediction_payload = prediction.json()

    assert health_payload["model_loaded"] is True
    assert health_payload["accuracy"] >= 0.85
    assert prediction_payload["demand_level"] in {"very-high", "high", "medium", "low"}
    assert 0 <= prediction_payload["demand_score"] <= 100
    assert prediction_payload["drivers_needed"] >= 1
    assert prediction_payload["prediction_mode"] in {"ml-certified", "conservative-fallback"}
    assert prediction_payload["operating_confidence_threshold"] == 0.96
    assert prediction_payload["operating_accuracy_target"] == 0.98

    print(
        {
            "passed": True,
            "health": health_payload,
            "prediction": {
                "demand_level": prediction_payload["demand_level"],
                "demand_score": prediction_payload["demand_score"],
                "confidence": prediction_payload["confidence"],
                "prediction_mode": prediction_payload["prediction_mode"],
                "is_high_confidence": prediction_payload["is_high_confidence"],
                "drivers_needed": prediction_payload["drivers_needed"],
                "model_version": prediction_payload["model_version"],
            },
        }
    )
