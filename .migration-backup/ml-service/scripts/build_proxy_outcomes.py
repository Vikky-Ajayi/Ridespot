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

from training.proxy_outcomes import PROXY_OUTPUT_PATH, build_proxy_dataset


def main() -> int:
    parser = argparse.ArgumentParser(description="Build RideSpot proxy outcome training rows.")
    parser.add_argument("--limit", type=int, default=5000)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--output", type=Path, default=PROXY_OUTPUT_PATH)
    parser.add_argument("--local-csv", type=Path)
    parser.add_argument("--skip-frostt", action="store_true")
    parser.add_argument("--skip-chicago", action="store_true")
    parser.add_argument("--skip-fivethirtyeight", action="store_true")
    parser.add_argument("--skip-green-taxi", action="store_true")
    parser.add_argument(
        "--allow-fixture",
        action="store_true",
        help="Use deterministic fixture rows only when public endpoints/local CSV are unavailable.",
    )
    args = parser.parse_args()

    result = build_proxy_dataset(
        limit=args.limit,
        output_path=args.output,
        local_csv=args.local_csv,
        allow_fixture=args.allow_fixture,
        timeout=args.timeout,
        include_frostt=not args.skip_frostt,
        include_chicago=not args.skip_chicago,
        include_fivethirtyeight=not args.skip_fivethirtyeight,
        include_green_taxi=not args.skip_green_taxi,
    )
    print(json.dumps(result, indent=2))
    return 0 if result["training_rows"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
