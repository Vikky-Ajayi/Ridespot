from __future__ import annotations

from dataclasses import asdict, dataclass


OPERATING_CONFIDENCE_THRESHOLD = 0.96
OPERATING_ACCURACY_TARGET = 0.98
OPERATING_POLICY_VERSION = "confidence-gated-v1"


@dataclass(frozen=True)
class OperatingPolicyResult:
    prediction_mode: str
    is_high_confidence: bool
    operating_confidence_threshold: float
    operating_accuracy_target: float
    fallback_reason: str | None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def classify_prediction(confidence: float) -> OperatingPolicyResult:
    is_high_confidence = confidence >= OPERATING_CONFIDENCE_THRESHOLD
    if is_high_confidence:
        return OperatingPolicyResult(
            prediction_mode="ml-certified",
            is_high_confidence=True,
            operating_confidence_threshold=OPERATING_CONFIDENCE_THRESHOLD,
            operating_accuracy_target=OPERATING_ACCURACY_TARGET,
            fallback_reason=None,
        )

    return OperatingPolicyResult(
        prediction_mode="conservative-fallback",
        is_high_confidence=False,
        operating_confidence_threshold=OPERATING_CONFIDENCE_THRESHOLD,
        operating_accuracy_target=OPERATING_ACCURACY_TARGET,
        fallback_reason="Model confidence below certified operating threshold.",
    )
