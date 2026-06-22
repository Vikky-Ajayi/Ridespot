from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)

ACCURACY_THRESHOLD = 0.98
MODEL_VERSION = "1.0.0"


def evaluate_model(
    model,
    X_test,
    y_test,
    label_encoder,
    model_name: str,
    feature_names: list[str],
    dataset_size: int,
):
    y_pred = model.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro")
    f1_weighted = f1_score(y_test, y_pred, average="weighted")
    class_names = label_encoder.classes_

    print("\n" + "=" * 60)
    print(f"  MODEL EVALUATION - {model_name.upper()}")
    print("=" * 60)
    print(f"  Test Accuracy:     {accuracy:.4f} ({accuracy * 100:.2f}%)")
    print(f"  F1 Macro:          {f1_macro:.4f}")
    print(f"  F1 Weighted:       {f1_weighted:.4f}")
    print(f"  Target threshold:  {ACCURACY_THRESHOLD:.2f} (98%)")

    threshold_met = accuracy >= ACCURACY_THRESHOLD
    if threshold_met:
        print("  THRESHOLD MET - Model approved for production")
    else:
        print(
            f"  THRESHOLD NOT MET - Accuracy is {accuracy * 100:.2f}%, need 98%"
        )
        print("  Do NOT save this model. Investigate features and retune hyperparameters.")

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=class_names))

    cm = confusion_matrix(y_test, y_pred)
    print("Confusion Matrix:")
    print(cm)

    feature_importance: dict[str, float] = {}
    if hasattr(model, "feature_importances_"):
        feature_importance = {
            feature: round(float(importance), 6)
            for feature, importance in zip(feature_names, model.feature_importances_)
        }
        top_features = sorted(feature_importance.items(), key=lambda item: -item[1])[:15]
        print("\nTop 15 Most Important Features:")
        for feat, imp in top_features:
            # Keep the visual bar ASCII-safe for Windows terminals using cp1252.
            bar = "#" * max(1, int(imp * 200)) if imp > 0 else ""
            print(f"  {feat:<40} {imp:.4f}  {bar}")

    return {
        "accuracy": round(float(accuracy), 4),
        "f1_macro": round(float(f1_macro), 4),
        "f1_weighted": round(float(f1_weighted), 4),
        "threshold_met": bool(threshold_met),
        "model_name": model_name,
        "model_version": MODEL_VERSION,
        "class_names": class_names.tolist(),
        "trained_at": datetime.now(UTC).isoformat(),
        "dataset_size": dataset_size,
        "feature_importance": feature_importance,
    }


def diagnose_low_accuracy(model, X_train, y_train, X_val, y_val, X_test, y_test):
    train_acc = accuracy_score(y_train, model.predict(X_train))
    val_acc = accuracy_score(y_val, model.predict(X_val))
    test_acc = accuracy_score(y_test, model.predict(X_test))

    print("\nDIAGNOSIS:")
    print(f"  Train accuracy: {train_acc:.4f}")
    print(f"  Val accuracy:   {val_acc:.4f}")
    print(f"  Test accuracy:  {test_acc:.4f}")

    if train_acc > 0.95 and val_acc < 0.80:
        print("  -> OVERFITTING detected. Increase regularisation:")
        print("    - Increase min_child_weight, gamma, reg_lambda")
        print("    - Decrease max_depth (try 5 or 6)")
        print("    - Decrease n_estimators")
    elif train_acc < 0.75:
        print("  -> UNDERFITTING detected. Model is too weak:")
        print("    - Increase n_estimators")
        print("    - Increase max_depth (try 8 or 9)")
        print("    - Decrease learning_rate and increase n_estimators")
        print("    - Check if demand_level is correctly encoded")
    else:
        print("  -> FEATURE ISSUE - model is learning but not enough signal:")
        print("    - Review engineered interaction features")
        print("    - Check for class imbalance in test set")
        print("    - Consider adding polynomial features for key predictors")


def save_model(
    model,
    encoders: dict[str, Any],
    scaler,
    metadata: dict[str, Any],
    paths: dict[str, Path],
):
    if not metadata["threshold_met"]:
        raise ValueError(
            f"Cannot save model - accuracy {metadata['accuracy'] * 100:.2f}% "
            "is below 98% threshold. Retune and retrain."
        )

    joblib.dump(model, paths["model"])
    joblib.dump(encoders, paths["encoders"])
    joblib.dump(scaler, paths["scaler"])
    with paths["metadata"].open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print("\nModel saved successfully")
    print(f"  Accuracy: {metadata['accuracy'] * 100:.2f}%")
    print(f"  Model:    {paths['model']}")
    print(f"  Encoders: {paths['encoders']}")
    print(f"  Scaler:   {paths['scaler']}")
    print(f"  Metadata: {paths['metadata']}")
