from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


PREDICTION_PAYLOAD = {
    "event_type": "Concert",
    "event_category": "Entertainment",
    "city": "Lagos",
    "country": "Nigeria",
    "venue_capacity": 5000,
    "expected_attendance": 3500,
    "start_hour": 19,
    "end_hour": 23,
    "duration_hours": 4,
    "is_weekend": 1,
    "is_public_holiday": 0,
    "is_detty_december": 0,
}


def _base_url(value: str) -> str:
    cleaned = value.strip().rstrip("/")
    if cleaned.lower().endswith("/health"):
        cleaned = cleaned[: -len("/health")].rstrip("/")
    if not cleaned.startswith(("http://", "https://")):
        raise ValueError("URL must start with http:// or https://")
    return cleaned


def _request_json(
    method: str,
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: int = 20,
) -> tuple[int, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read().decode("utf-8")
            return response.status, json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        data = error.read().decode("utf-8", errors="replace")
        try:
            parsed: Any = json.loads(data)
        except json.JSONDecodeError:
            parsed = data
        return error.code, parsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test deployed RideSpot ML service.")
    parser.add_argument("--ml-url", default=os.getenv("ML_SERVICE_URL", ""))
    parser.add_argument("--backend-url", default=os.getenv("BACKEND_PUBLIC_URL", ""))
    parser.add_argument("--admin-token", default=os.getenv("ADMIN_TOKEN", ""))
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    if not args.ml_url:
        print(json.dumps({"passed": False, "error": "ML service URL is required"}))
        return 1

    ml_url = _base_url(args.ml_url)
    result: dict[str, Any] = {"mlUrl": ml_url, "checks": {}}

    health_status, health_payload = _request_json(
        "GET", f"{ml_url}/health", timeout=args.timeout
    )
    result["checks"]["health"] = {"status": health_status, "payload": health_payload}

    predict_status, predict_payload = _request_json(
        "POST",
        f"{ml_url}/predict",
        payload=PREDICTION_PAYLOAD,
        timeout=args.timeout,
    )
    result["checks"]["predict"] = {"status": predict_status, "payload": predict_payload}

    backend_url = args.backend_url.strip().rstrip("/")
    if backend_url and args.admin_token:
        backend_status, backend_payload = _request_json(
            "GET",
            f"{backend_url}/api/admin/ml/status",
            token=args.admin_token,
            timeout=args.timeout,
        )
        result["checks"]["backendAdminStatus"] = {
            "status": backend_status,
            "payload": backend_payload,
        }
    else:
        result["checks"]["backendAdminStatus"] = {
            "skipped": True,
            "reason": "BACKEND_PUBLIC_URL and ADMIN_TOKEN are required for this check",
        }

    health_ok = (
        health_status == 200
        and isinstance(health_payload, dict)
        and health_payload.get("model_loaded") is True
    )
    predict_ok = (
        predict_status == 200
        and isinstance(predict_payload, dict)
        and predict_payload.get("demand_level") in {"very-high", "high", "medium", "low"}
    )
    backend_check = result["checks"]["backendAdminStatus"]
    backend_ok = bool(
        backend_check.get("skipped")
        or (
            backend_check.get("status") == 200
            and isinstance(backend_check.get("payload"), dict)
        )
    )

    result["passed"] = health_ok and predict_ok and backend_ok
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
