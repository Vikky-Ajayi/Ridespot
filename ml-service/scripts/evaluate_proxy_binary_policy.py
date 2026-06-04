from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
SRC_ROOT = SERVICE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from training.proxy_experiment import build_experiment_matrix
from training.proxy_outcomes import REPORT_DIR


def evaluate_gate(probabilities, predictions, truth, threshold: float) -> dict[str, object]:
    confidence = probabilities.max(axis=1)
    mask = confidence >= threshold
    return {
        "threshold": threshold,
        "coverage": round(float(mask.mean()), 4),
        "accuracy": round(float(accuracy_score(truth[mask], predictions[mask])), 4) if mask.any() else None,
        "predictions_served": int(mask.sum()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate binary go/no-go proxy demand accuracy.")
    parser.add_argument("--proxy-path", type=Path, required=True)
    parser.add_argument("--target-accuracy", type=float, default=0.98)
    parser.add_argument("--report", type=Path, default=REPORT_DIR / "proxy_binary_policy_report.json")
    args = parser.parse_args()

    df = pd.read_csv(args.proxy_path)
    df["binary_target"] = df["demand_level"].isin(["high", "very-high"]).astype(int)
    train_df, temp_df = train_test_split(
        df, test_size=0.30, random_state=42, stratify=df["binary_target"]
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, random_state=42, stratify=temp_df["binary_target"]
    )

    X_train, encoders, scaler = build_experiment_matrix(
        train_df, fit=True, use_extended_features=True
    )
    X_val, _, _ = build_experiment_matrix(
        val_df,
        encoders=encoders,
        scaler=scaler,
        fit=False,
        use_extended_features=True,
    )
    X_test, _, _ = build_experiment_matrix(
        test_df,
        encoders=encoders,
        scaler=scaler,
        fit=False,
        use_extended_features=True,
    )
    y_train = train_df["binary_target"].to_numpy()
    y_val = val_df["binary_target"].to_numpy()
    y_test = test_df["binary_target"].to_numpy()

    models = {
        "xgb_binary": XGBClassifier(
            n_estimators=350,
            max_depth=7,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
            early_stopping_rounds=25,
        ),
        "lgb_binary": LGBMClassifier(
            n_estimators=350,
            max_depth=8,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        ),
    }

    reports: list[dict[str, object]] = []
    for name, model in models.items():
        if name.startswith("xgb"):
            model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        else:
            model.fit(X_train, y_train, eval_set=[(X_val, y_val)])

        val_probabilities = model.predict_proba(X_val)
        val_predictions = model.predict(X_val)
        test_probabilities = model.predict_proba(X_test)
        test_predictions = model.predict(X_test)
        gates = [
            evaluate_gate(test_probabilities, test_predictions, y_test, threshold)
            for threshold in [0.80, 0.85, 0.90, 0.95, 0.98]
        ]
        passing = [gate for gate in gates if gate["accuracy"] and gate["accuracy"] >= args.target_accuracy]
        reports.append(
            {
                "name": name,
                "full_coverage_accuracy": round(float(accuracy_score(y_test, test_predictions)), 4),
                "validation_accuracy": round(float(accuracy_score(y_val, val_predictions)), 4),
                "confusion_matrix": confusion_matrix(y_test, test_predictions).tolist(),
                "gates": gates,
                "best_passing_gate": max(passing, key=lambda gate: gate["coverage"]) if passing else None,
            }
        )

    best = max(
        reports,
        key=lambda report: (
            report["best_passing_gate"]["coverage"] if report["best_passing_gate"] else -1,
            report["full_coverage_accuracy"],
        ),
    )
    output = {
        "proxy_path": str(args.proxy_path),
        "target": "binary_high_or_very_high_vs_low_or_medium",
        "dataset_rows": len(df),
        "test_rows": len(test_df),
        "target_accuracy": args.target_accuracy,
        "models": reports,
        "best_model": best,
        "claim_boundary": (
            "This is a binary go/no-go demand policy over public NYC proxy outcomes, "
            "not a 4-class Lagos/UK production accuracy claim."
        ),
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", encoding="utf-8") as handle:
        json.dump(output, handle, indent=2)

    summary = {
        "dataset_rows": output["dataset_rows"],
        "best_model": best["name"],
        "full_coverage_accuracy": best["full_coverage_accuracy"],
        "best_passing_gate": best["best_passing_gate"],
        "report": str(args.report),
    }
    print(json.dumps(summary, indent=2))
    return 0 if best["best_passing_gate"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
