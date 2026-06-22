from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import lightgbm as lgb
import xgboost as xgb
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from training.evaluate import (  # noqa: E402
    diagnose_low_accuracy,
    evaluate_model,
    save_model,
)
from training.features import (  # noqa: E402
    CATEGORICAL_FEATURES,
    DATASET_PATH,
    NUMERICAL_FEATURES,
    TARGET,
    build_feature_matrix,
    encode_target,
    load_dataset,
    normalise_target_labels,
    validate_feature_contract,
)

MODEL_DIR = ROOT / "models"
MODEL_PATHS = {
    "model": MODEL_DIR / "ridespot_model.pkl",
    "encoders": MODEL_DIR / "ridespot_encoder.pkl",
    "scaler": MODEL_DIR / "ridespot_scaler.pkl",
    "metadata": MODEL_DIR / "model_metadata.json",
}


def split_data(df):
    train_df, temp_df = train_test_split(
        df, test_size=0.30, random_state=42, stratify=df[TARGET]
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, random_state=42, stratify=temp_df[TARGET]
    )
    print(f"Train: {len(train_df):,} | Val: {len(val_df):,} | Test: {len(test_df):,}")
    return train_df, val_df, test_df


def train_xgboost(X_train, y_train, X_val, y_val):
    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=7,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        objective="multi:softprob",
        num_class=4,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=30,
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        verbose=50,
    )

    return model


def train_lightgbm(X_train, y_train, X_val, y_val):
    model = lgb.LGBMClassifier(
        n_estimators=500,
        max_depth=7,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_samples=20,
        reg_alpha=0.1,
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
        callbacks=[lgb.early_stopping(30), lgb.log_evaluation(50)],
    )

    return model


def pick_best_model(xgb_model, lgb_model, X_val, y_val):
    xgb_acc = accuracy_score(y_val, xgb_model.predict(X_val))
    lgb_acc = accuracy_score(y_val, lgb_model.predict(X_val))
    print(f"XGBoost validation accuracy: {xgb_acc:.4f}")
    print(f"LightGBM validation accuracy: {lgb_acc:.4f}")
    if xgb_acc >= lgb_acc:
        print("Using XGBoost")
        return xgb_model, "xgboost", xgb_acc

    print("Using LightGBM")
    return lgb_model, "lightgbm", lgb_acc


def run_training_pipeline(
    df=None,
    *,
    persist: bool = True,
    summary_label: str = "Step 3 summary",
) -> dict[str, Any]:
    if df is None:
        df = load_dataset(DATASET_PATH)
    else:
        df = df.copy()
        df[TARGET] = normalise_target_labels(df[TARGET])

    summary = validate_feature_contract(df)

    print("\nFeature contract summary:")
    print(json.dumps(summary, indent=2))
    print(f"\nCategorical feature count: {len(CATEGORICAL_FEATURES)}")
    print(f"Numerical feature count:   {len(NUMERICAL_FEATURES)}")
    print(f"Target column:             {TARGET}")

    if summary["missing_required_columns"] or summary["forbidden_columns_in_features"]:
        return {
            "success": False,
            "summary": summary,
            "metadata": {
                "accuracy": 0.0,
                "threshold_met": False,
            },
        }

    train_df, val_df, test_df = split_data(df)

    X_train, encoders, scaler = build_feature_matrix(train_df, fit=True)
    X_val, _, _ = build_feature_matrix(val_df, encoders=encoders, scaler=scaler, fit=False)
    X_test, _, _ = build_feature_matrix(test_df, encoders=encoders, scaler=scaler, fit=False)

    y_train, target_encoder = encode_target(train_df, fit=True)
    y_val, _ = encode_target(val_df, encoder=target_encoder, fit=False)
    y_test, _ = encode_target(test_df, encoder=target_encoder, fit=False)

    print("\nTraining XGBoost...")
    xgb_model = train_xgboost(X_train, y_train, X_val, y_val)

    print("\nTraining LightGBM...")
    lgb_model = train_lightgbm(X_train, y_train, X_val, y_val)

    winner, winner_name, winner_val_acc = pick_best_model(xgb_model, lgb_model, X_val, y_val)
    feature_names = NUMERICAL_FEATURES + CATEGORICAL_FEATURES
    metadata = evaluate_model(
        winner,
        X_test,
        y_test,
        target_encoder,
        winner_name,
        feature_names,
        dataset_size=len(df),
    )

    summary_payload = {
        "train_rows": len(train_df),
        "val_rows": len(val_df),
        "test_rows": len(test_df),
        "x_train_shape": list(X_train.shape),
        "x_val_shape": list(X_val.shape),
        "x_test_shape": list(X_test.shape),
        "winner": winner_name,
        "winner_validation_accuracy": round(float(winner_val_acc), 4),
        "winner_test_accuracy": metadata["accuracy"],
        "class_labels": target_encoder.classes_.tolist(),
    }

    print(f"\n{summary_label}:")
    print(json.dumps(summary_payload, indent=2))

    persisted_encoders = {**encoders, "target_encoder": target_encoder}
    if not metadata["threshold_met"]:
        diagnose_low_accuracy(winner, X_train, y_train, X_val, y_val, X_test, y_test)
    elif persist:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        save_model(
            winner,
            persisted_encoders,
            scaler,
            metadata,
            MODEL_PATHS,
        )

    return {
        "success": bool(metadata["threshold_met"]),
        "model": winner,
        "metadata": metadata,
        "encoders": persisted_encoders,
        "scaler": scaler,
        "summary": summary_payload,
    }


def main() -> int:
    result = run_training_pipeline(persist=True, summary_label="Step 3 summary")

    return 0 if result["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
