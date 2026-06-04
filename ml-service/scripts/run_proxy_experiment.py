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

from training.proxy_experiment import run_proxy_experiment
from training.proxy_outcomes import PROXY_OUTPUT_PATH, REPORT_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the proxy outcome ML experiment.")
    parser.add_argument("--proxy-path", type=Path, default=PROXY_OUTPUT_PATH)
    parser.add_argument("--proxy-only", action="store_true")
    parser.add_argument("--base-features-only", action="store_true")
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--report", type=Path, default=REPORT_DIR / "proxy_experiment_report.json")
    parser.add_argument(
        "--no-promote",
        action="store_true",
        help="Never write production model artifacts, even if the threshold is met.",
    )
    args = parser.parse_args()

    report = run_proxy_experiment(
        proxy_path=args.proxy_path,
        proxy_only=args.proxy_only,
        use_extended_features=not args.base_features_only,
        max_rows=args.max_rows,
        persist_if_promoted=not args.no_promote,
        report_path=args.report,
    )
    summary = {
        "dataset_rows": report["dataset_rows"],
        "proxy_rows": report["proxy_rows"],
        "best_candidate": {
            "name": report["best_candidate"]["name"],
            "accuracy": report["best_candidate"]["accuracy"],
            "threshold_met": report["best_candidate"]["threshold_met"],
            "promotable": report["best_candidate"]["promotable"],
        },
        "production_promoted": report["production_promoted"],
        "report_path": report["report_path"],
        "elapsed_seconds": report["elapsed_seconds"],
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
