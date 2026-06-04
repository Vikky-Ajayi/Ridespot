from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable

import pandas as pd

from training.features import CATEGORICAL_FEATURES, FORBIDDEN_FEATURES, NUMERICAL_FEATURES, TARGET


@dataclass(frozen=True)
class LeakageAuditResult:
    passed: bool
    feature_count: int
    forbidden_features_used: list[str]
    missing_features: list[str]
    label_columns_present: list[str]
    message: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


DEFAULT_LABEL_COLUMNS = {
    "actual_ride_requests",
    "demand_score",
    "demand_level",
    "driver_feedback_score",
    "driver_acted_on_prediction",
}


def audit_training_frame(
    df: pd.DataFrame,
    *,
    feature_columns: Iterable[str] | None = None,
    label_columns: Iterable[str] = DEFAULT_LABEL_COLUMNS,
) -> LeakageAuditResult:
    """Verify that target/outcome fields are not used as prediction-time features."""
    features = list(feature_columns or (NUMERICAL_FEATURES + CATEGORICAL_FEATURES))
    feature_set = set(features)
    forbidden = sorted((FORBIDDEN_FEATURES | set(label_columns)) & feature_set)
    missing = sorted(set(features + [TARGET]) - set(df.columns))
    labels_present = sorted(set(label_columns) & set(df.columns))
    passed = not forbidden and not missing

    if forbidden:
        message = f"Leakage audit failed: forbidden columns used as features: {forbidden}"
    elif missing:
        message = f"Leakage audit failed: missing required columns: {missing}"
    else:
        message = "Leakage audit passed: outcome/target fields are labels only."

    return LeakageAuditResult(
        passed=passed,
        feature_count=len(features),
        forbidden_features_used=forbidden,
        missing_features=missing,
        label_columns_present=labels_present,
        message=message,
    )


def assert_no_leakage(df: pd.DataFrame) -> LeakageAuditResult:
    result = audit_training_frame(df)
    if not result.passed:
        raise ValueError(result.message)
    return result
