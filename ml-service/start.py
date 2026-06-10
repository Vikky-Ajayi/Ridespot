from __future__ import annotations

import json
import os
import sys

import uvicorn


def _read_port() -> int:
    raw_port = os.getenv("PORT", "8080").strip()
    try:
        port = int(raw_port)
    except ValueError:
        print(
            json.dumps(
                {
                    "event": "ml_startup_failed",
                    "reason": "PORT must be an integer",
                    "raw_port": raw_port,
                }
            ),
            flush=True,
        )
        raise SystemExit(1)

    if port < 1 or port > 65535:
        print(
            json.dumps(
                {
                    "event": "ml_startup_failed",
                    "reason": "PORT is outside the valid TCP range",
                    "port": port,
                }
            ),
            flush=True,
        )
        raise SystemExit(1)

    return port


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = _read_port()
    log_level = os.getenv("LOG_LEVEL", "info").lower()

    print(
        json.dumps(
            {
                "event": "ml_startup",
                "app": "main:app",
                "host": host,
                "port": port,
                "raw_port": os.getenv("PORT"),
                "log_level": log_level,
                "python": sys.version.split()[0],
            }
        ),
        flush=True,
    )

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        log_level=log_level,
    )


if __name__ == "__main__":
    main()
