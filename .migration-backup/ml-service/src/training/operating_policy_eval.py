from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from training.features import DATASET_PATH, TARGET, build_feature_matrix, encode_target, load_dataset
from training.proxy_outcomes import REPORT_DIR
from utils.operating_policy import OPERATING_ACCURACY_TARGET
from utils.operating_policy import OPERATING_CONFIDENCE_THRESHOLD

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODEL_DIR / "ridespot_model.pkl"
ENCODER_PATH = MODEL_DIR / "ridespot_encoder.pkl"
SCALER_PATH = MODEL_DIR / "ridespot_scaler.pkl"


def evaluate_threshold(
    probabilities: np.ndarray,
    y_true: np.ndarray,
    threshold: float,
) -> dict[str, Any]:
    confidence = probabilities.max(axis=1)
    predicted = probabilities.argmax(axis=1)
    mask = confidence >= threshold
    if not mask.any():
        return {
            "threshold": round(float(threshold), 4),
            "accuracy": None,
            "coverage": 0.0,
            "predictions_served": 0,
        }

    return {
        "threshold": round(float(threshold), 4),
        "accuracy": round(float(accuracy_score(y_true[mask], predicted[mask])), 4),
        "coverage": round(float(mask.mean()), 4),
        "predictions_served": int(mask.sum()),
    }


def select_threshold(
    val_probabilities: np.ndarray,
    y_val: np.ndarray,
    *,
    target_accuracy: float = OPERATING_ACCURACY_TARGET,
    min_predictions: int = 50,
) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for threshold in np.arange(0.5, 0.995, 0.005):
        result = evaluate_threshold(val_probabilities, y_val, float(threshold))
        if (
            result["accuracy"] is not None
            and result["accuracy"] >= target_accuracy
            and result["predictions_served"] >= min_predictions
        ):
            candidates.append(result)

    if not candidates:
        raise ValueError("No confidence threshold met the operating accuracy target.")

    return max(candidates, key=lambda item: (item["coverage"], item["accuracy"]))


def run_operating_policy_evaluation(
    *,
    output_path: Path | None = None,
    target_accuracy: float = OPERATING_ACCURACY_TARGET,
    fixed_threshold: float = OPERATING_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    df = load_dataset(DATASET_PATH)
    _, temp_df = train_test_split(df, test_size=0.30, random_state=42, stratify=df[TARGET])
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, random_state=42, stratify=temp_df[TARGET]
    )

    model = joblib.load(MODEL_PATH)
    encoders = joblib.load(ENCODER_PATH)
    scaler = joblib.load(SCALER_PATH)
    target_encoder = encoders["target_encoder"]

    X_val, _, _ = build_feature_matrix(val_df, encoders=encoders, scaler=scaler, fit=False)
    X_test, _, _ = build_feature_matrix(test_df, encoders=encoders, scaler=scaler, fit=False)
    y_val, _ = encode_target(val_df, encoder=target_encoder, fit=False)
    y_test, _ = encode_target(test_df, encoder=target_encoder, fit=False)

    val_probabilities = model.predict_proba(X_val)
    test_probabilities = model.predict_proba(X_test)
    selected = evaluate_threshold(val_probabilities, y_val, fixed_threshold)
    if selected["accuracy"] is None or selected["accuracy"] < target_accuracy:
        selected = select_threshold(
            val_probabilities,
            y_val,
            target_accuracy=target_accuracy,
        )
    test_result = evaluate_threshold(test_probabilities, y_test, selected["threshold"])

    confidence = test_probabilities.max(axis=1)
    predicted = test_probabilities.argmax(axis=1)
    mask = confidence >= selected["threshold"]

    report = {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "policy": "confidence-gated-v1",
        "target_accuracy": target_accuracy,
        "selected_on_validation": selected,
        "held_out_test": test_result,
        "full_set_baseline_accuracy": round(float(accuracy_score(y_test, predicted)), 4),
        "fallback_coverage": round(float((~mask).mean()), 4),
        "fallback_predictions": int((~mask).sum()),
        "test_rows": int(len(y_test)),
        "class_names": target_encoder.classes_.tolist(),
        "high_confidence_classification_report": (
            classification_report(
                y_test[mask],
                predicted[mask],
                target_names=target_encoder.classes_,
                output_dict=True,
                zero_division=0,
            )
            if mask.any()
            else {}
        ),
        "high_confidence_confusion_matrix": (
            confusion_matrix(y_test[mask], predicted[mask]).tolist() if mask.any() else []
        ),
        "claim_boundary": (
            "98%+ applies only to high-confidence predictions at or above the selected "
            "confidence threshold. Remaining predictions use conservative fallback and "
            "must not be counted in the certified accuracy claim."
        ),
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    destination = output_path or (REPORT_DIR / "operating_policy_report.json")
    with destination.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    report["report_path"] = str(destination)
    return report
