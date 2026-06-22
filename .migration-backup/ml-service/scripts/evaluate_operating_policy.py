from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
SRC_ROOT = SERVICE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from training.operating_policy_eval import run_operating_policy_evaluation
from training.proxy_outcomes import REPORT_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate RideSpot confidence-gated operating accuracy.")
    parser.add_argument("--target-accuracy", type=float, default=0.98)
    parser.add_argument("--report", type=Path, default=REPORT_DIR / "operating_policy_report.json")
    args = parser.parse_args()

    report = run_operating_policy_evaluation(
        output_path=args.report,
        target_accuracy=args.target_accuracy,
    )
    summary = {
        "policy": report["policy"],
        "selected_threshold": report["selected_on_validation"]["threshold"],
        "validation_accuracy": report["selected_on_validation"]["accuracy"],
        "validation_coverage": report["selected_on_validation"]["coverage"],
        "held_out_test_accuracy": report["held_out_test"]["accuracy"],
        "held_out_test_coverage": report["held_out_test"]["coverage"],
        "fallback_coverage": report["fallback_coverage"],
        "full_set_baseline_accuracy": report["full_set_baseline_accuracy"],
        "target_accuracy": report["target_accuracy"],
        "report_path": report["report_path"],
    }
    print(json.dumps(summary, indent=2))
    return 0 if report["held_out_test"]["accuracy"] >= args.target_accuracy else 1


if __name__ == "__main__":
    raise SystemExit(main())
