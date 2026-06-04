from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from training.evaluate import ACCURACY_THRESHOLD, save_model
from training.features import (
    CATEGORICAL_FEATURES,
    NUMERICAL_FEATURES,
    TARGET,
    build_feature_matrix,
    encode_target,
    normalise_target_labels,
)
from training.leakage import assert_no_leakage
from training.proxy_outcomes import PROXY_OUTPUT_PATH, REPORT_DIR, load_combined_training_data
from training.train import MODEL_DIR, MODEL_PATHS

EXTENDED_NUMERICAL_FEATURES = [
    "latitude",
    "longitude",
    "historical_pickup_mean",
    "historical_pickup_std",
    "historical_pickup_max",
    "same_hour_previous_pickups",
    "previous_hour_pickups",
    "pickup_trend",
]
EXTENDED_CATEGORICAL_FEATURES = ["source_market", "area", "venue_name"]


def build_experiment_matrix(
    df: pd.DataFrame,
    *,
    encoders: dict[str, LabelEncoder] | None = None,
    scaler: StandardScaler | None = None,
    fit: bool = True,
    use_extended_features: bool = False,
):
    if not use_extended_features:
        return build_feature_matrix(df, encoders=encoders, scaler=scaler, fit=fit)

    frame = df.copy()
    numeric_features = NUMERICAL_FEATURES + [
        column for column in EXTENDED_NUMERICAL_FEATURES if column in frame.columns
    ]
    categorical_features = CATEGORICAL_FEATURES + [
        column for column in EXTENDED_CATEGORICAL_FEATURES if column in frame.columns
    ]

    for column in numeric_features:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame[column] = frame[column].fillna(frame[column].median() if frame[column].notna().any() else 0)

    if fit:
        encoders = {}
        for column in categorical_features:
            le = LabelEncoder()
            frame[column] = le.fit_transform(frame[column].fillna("unknown").astype(str))
            encoders[column] = le
    else:
        assert encoders is not None
        for column in categorical_features:
            le = encoders[column]
            known = set(le.classes_)
            frame[column] = frame[column].fillna("unknown").astype(str).map(
                lambda value: le.transform([value])[0] if value in known else -1
            )

    matrix = frame[numeric_features + categorical_features].to_numpy()
    if fit:
        scaler = StandardScaler()
        matrix = scaler.fit_transform(matrix)
    else:
        assert scaler is not None
        matrix = scaler.transform(matrix)

    return matrix, encoders, scaler


def split_proxy_data(df):
    train_df, temp_df = train_test_split(
        df, test_size=0.30, random_state=42, stratify=df[TARGET]
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, random_state=42, stratify=temp_df[TARGET]
    )
    return train_df, val_df, test_df


def train_fast_xgboost(X_train, y_train, X_val, y_val):
    model = xgb.XGBClassifier(
        n_estimators=260,
        max_depth=6,
        learning_rate=0.06,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=2,
        gamma=0.05,
        reg_alpha=0.05,
        reg_lambda=1.0,
        objective="multi:softprob",
        num_class=4,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=25,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    return model


def train_fast_lightgbm(X_train, y_train, X_val, y_val):
    model = lgb.LGBMClassifier(
        n_estimators=260,
        max_depth=7,
        learning_rate=0.06,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_samples=16,
        reg_alpha=0.05,
        reg_lambda=1.0,
        num_class=4,
        objective="multiclass",
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(25, verbose=False)],
    )
    return model


def train_score_regressor(X_train, y_score_train, X_val, y_score_val):
    model = xgb.XGBRegressor(
        n_estimators=320,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=2,
        reg_alpha=0.05,
        reg_lambda=1.0,
        objective="reg:squarederror",
        eval_metric="rmse",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=25,
    )
    model.fit(X_train, y_score_train, eval_set=[(X_val, y_score_val)], verbose=False)
    return model


def labels_from_scores(scores: np.ndarray, thresholds: tuple[float, float, float]) -> list[str]:
    low_medium, medium_high, high_very = thresholds
    labels: list[str] = []
    for score in scores:
        if score >= high_very:
            labels.append("very-high")
        elif score >= medium_high:
            labels.append("high")
        elif score >= low_medium:
            labels.append("medium")
        else:
            labels.append("low")
    return labels


def optimise_thresholds(pred_scores: np.ndarray, true_labels: list[str]) -> tuple[float, float, float]:
    best = (25.0, 50.0, 75.0)
    best_acc = -1.0
    for low_medium in np.arange(20.0, 31.0, 2.5):
        for medium_high in np.arange(45.0, 56.0, 2.5):
            for high_very in np.arange(70.0, 81.0, 2.5):
                predicted = labels_from_scores(pred_scores, (low_medium, medium_high, high_very))
                acc = accuracy_score(true_labels, predicted)
                if acc > best_acc:
                    best = (float(low_medium), float(medium_high), float(high_very))
                    best_acc = float(acc)
    return best


def classifier_metrics(
    name: str,
    model,
    X_test,
    y_test,
    target_encoder,
    *,
    probabilities: np.ndarray | None = None,
) -> dict[str, Any]:
    is_probability_only = probabilities is not None
    if probabilities is None:
        y_pred = model.predict(X_test)
        probabilities = model.predict_proba(X_test)
    else:
        y_pred = np.argmax(probabilities, axis=1)

    accuracy = accuracy_score(y_test, y_pred)
    confidence = probabilities.max(axis=1)
    gated_mask = confidence >= 0.98
    gated_accuracy = (
        accuracy_score(y_test[gated_mask], y_pred[gated_mask]) if gated_mask.any() else None
    )
    return {
        "name": name,
        "kind": "classifier",
        "accuracy": round(float(accuracy), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "f1_weighted": round(float(f1_score(y_test, y_pred, average="weighted")), 4),
        "threshold_met": bool(accuracy >= ACCURACY_THRESHOLD),
        "promotable": bool(not is_probability_only and hasattr(model, "predict_proba")),
        "confidence_gated_accuracy_at_0_98": (
            round(float(gated_accuracy), 4) if gated_accuracy is not None else None
        ),
        "confidence_gated_coverage_at_0_98": round(float(gated_mask.mean()), 4),
        "classification_report": classification_report(
            y_test,
            y_pred,
            target_names=target_encoder.classes_,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }


def regressor_metrics(
    name: str,
    model,
    X_val,
    y_val,
    y_score_val,
    X_test,
    y_test,
    target_encoder,
) -> dict[str, Any]:
    val_scores = model.predict(X_val)
    thresholds = optimise_thresholds(
        val_scores,
        target_encoder.inverse_transform(y_val).tolist(),
    )
    test_scores = model.predict(X_test)
    pred_labels = labels_from_scores(test_scores, thresholds)
    y_pred = target_encoder.transform(pred_labels)
    accuracy = accuracy_score(y_test, y_pred)
    return {
        "name": name,
        "kind": "score_regressor",
        "accuracy": round(float(accuracy), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "f1_weighted": round(float(f1_score(y_test, y_pred, average="weighted")), 4),
        "threshold_met": bool(accuracy >= ACCURACY_THRESHOLD),
        "promotable": False,
        "score_thresholds": [round(value, 2) for value in thresholds],
        "validation_score_rmse": round(float(np.sqrt(np.mean((model.predict(X_val) - y_score_val) ** 2))), 4),
        "classification_report": classification_report(
            y_test,
            y_pred,
            target_names=target_encoder.classes_,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }


def run_proxy_experiment(
    *,
    proxy_path: Path = PROXY_OUTPUT_PATH,
    proxy_only: bool = False,
    use_extended_features: bool = True,
    max_rows: int | None = None,
    persist_if_promoted: bool = True,
    report_path: Path | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    if proxy_only:
        df = pd.read_csv(proxy_path)
        df[TARGET] = normalise_target_labels(df[TARGET])
    else:
        df = load_combined_training_data(proxy_path)
    if max_rows is not None and len(df) > max_rows:
        df = df.sample(max_rows, random_state=42).reset_index(drop=True)
    proxy_rows = int(df["source_market"].notna().sum()) if "source_market" in df.columns else 0

    audit = assert_no_leakage(df)
    train_df, val_df, test_df = split_proxy_data(df)

    X_train, encoders, scaler = build_experiment_matrix(
        train_df, fit=True, use_extended_features=use_extended_features
    )
    X_val, _, _ = build_experiment_matrix(
        val_df,
        encoders=encoders,
        scaler=scaler,
        fit=False,
        use_extended_features=use_extended_features,
    )
    X_test, _, _ = build_experiment_matrix(
        test_df,
        encoders=encoders,
        scaler=scaler,
        fit=False,
        use_extended_features=use_extended_features,
    )

    y_train, target_encoder = encode_target(train_df, fit=True)
    y_val, _ = encode_target(val_df, encoder=target_encoder, fit=False)
    y_test, _ = encode_target(test_df, encoder=target_encoder, fit=False)

    candidates: list[dict[str, Any]] = []
    trained_models: dict[str, Any] = {}

    xgb_model = train_fast_xgboost(X_train, y_train, X_val, y_val)
    trained_models["xgboost_proxy"] = xgb_model
    candidates.append(classifier_metrics("xgboost_proxy", xgb_model, X_test, y_test, target_encoder))

    lgb_model = train_fast_lightgbm(X_train, y_train, X_val, y_val)
    trained_models["lightgbm_proxy"] = lgb_model
    candidates.append(classifier_metrics("lightgbm_proxy", lgb_model, X_test, y_test, target_encoder))

    xgb_probs = xgb_model.predict_proba(X_test)
    lgb_probs = lgb_model.predict_proba(X_test)
    ensemble_probs = (xgb_probs + lgb_probs) / 2.0
    candidates.append(
        classifier_metrics(
            "xgb_lgb_probability_ensemble",
            xgb_model,
            X_test,
            y_test,
            target_encoder,
            probabilities=ensemble_probs,
        )
    )

    if "demand_score" in train_df.columns:
        y_score_train = train_df["demand_score"].astype(float).to_numpy()
        y_score_val = val_df["demand_score"].astype(float).to_numpy()
        regressor = train_score_regressor(X_train, y_score_train, X_val, y_score_val)
        candidates.append(
            regressor_metrics(
                "xgboost_score_regressor",
                regressor,
                X_val,
                y_val,
                y_score_val,
                X_test,
                y_test,
                target_encoder,
            )
        )

    if use_extended_features:
        for candidate in candidates:
            candidate["promotable"] = False
            candidate["promotion_blocker"] = (
                "Extended experiment features require an API/model contract migration before promotion."
            )

    best = max(candidates, key=lambda item: item["accuracy"])
    promoted = False
    if best["threshold_met"] and best["promotable"] and persist_if_promoted:
        model = trained_models[best["name"]]
        metadata = {
            "accuracy": best["accuracy"],
            "f1_macro": best["f1_macro"],
            "f1_weighted": best["f1_weighted"],
            "threshold_met": True,
            "model_name": best["name"],
            "model_version": "proxy-public-outcome-v1",
            "class_names": target_encoder.classes_.tolist(),
            "trained_at": datetime.utcnow().isoformat() + "Z",
            "dataset_size": len(df),
            "feature_importance": {
                feature: round(float(value), 6)
                for feature, value in zip(NUMERICAL_FEATURES + CATEGORICAL_FEATURES, model.feature_importances_)
            },
        }
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        save_model(model, {**encoders, "target_encoder": target_encoder}, scaler, metadata, MODEL_PATHS)
        promoted = True

    report = {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "proxy_path": str(proxy_path),
        "training_mode": "proxy_only" if proxy_only else "base_plus_proxy",
        "use_extended_features": use_extended_features,
        "dataset_rows": int(len(df)),
        "proxy_rows": proxy_rows,
        "split": {
            "train_rows": len(train_df),
            "val_rows": len(val_df),
            "test_rows": len(test_df),
        },
        "accuracy_threshold": ACCURACY_THRESHOLD,
        "leakage_audit": audit.to_dict(),
        "candidates": candidates,
        "best_candidate": best,
        "production_promoted": promoted,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
        "notes": [
            "98% promotion is blocked unless full held-out accuracy reaches the threshold.",
            "Confidence-gated accuracy is reported separately and must not be presented as full-set accuracy.",
            "Proxy data improves realism but still needs Lagos/UK validation before market accuracy claims.",
        ],
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = report_path or (REPORT_DIR / "proxy_experiment_report.json")
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    report["report_path"] = str(output_path)
    return report
