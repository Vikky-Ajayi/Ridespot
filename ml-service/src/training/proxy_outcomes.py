from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from training.features import DATASET_PATH, derive_features, normalise_target_labels

SERVICE_ROOT = Path(__file__).resolve().parents[1]
PROXY_DIR = SERVICE_ROOT / "data" / "proxy"
RAW_DIR = PROXY_DIR / "raw"
REPORT_DIR = SERVICE_ROOT / "models" / "reports"
PROXY_OUTPUT_PATH = PROXY_DIR / "proxy_outcome_training_dataset.csv"

FIVETHIRTYEIGHT_UBER_APRIL_2014 = (
    "https://raw.githubusercontent.com/fivethirtyeight/"
    "uber-tlc-foil-response/master/uber-trip-data/uber-raw-data-apr14.csv"
)
CHICAGO_TNP_2025_ENDPOINT = "https://data.cityofchicago.org/resource/3q84-vs9b.json"
NYC_TLC_GREEN_2024_01 = (
    "https://d37ci6vzurychx.cloudfront.net/trip-data/green_tripdata_2024-01.parquet"
)
FROSTT_UBER_BASE = "https://s3.us-east-2.amazonaws.com/frostt/frostt_data/uber-pickups/"
HF_GREEN_TAXI_2025_URLS = [
    "https://huggingface.co/datasets/koorukuroo/yellow_tripdata/resolve/main/green_tripdata_2025-01.csv",
    "https://huggingface.co/datasets/koorukuroo/yellow_tripdata/resolve/main/green_tripdata_2025-02.csv",
]


@dataclass(frozen=True)
class SourceStatus:
    source: str
    status: str
    rows: int = 0
    message: str = ""

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def stable_unit(value: str) -> float:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) / float(0xFFFFFFFFFFFF)


def stable_int(value: str, low: int, high: int) -> int:
    return low + int(stable_unit(value) * ((high - low) + 1))


def fetch_text(url: str, *, timeout: int = 30, headers: dict[str, str] | None = None) -> str:
    request_headers = {"User-Agent": "RideSpotML/1.0", **(headers or {})}
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def fetch_fivethirtyeight_uber_sample(limit: int, timeout: int = 30) -> tuple[pd.DataFrame, SourceStatus]:
    """Fetch a bounded sample of public NYC Uber pickups from FiveThirtyEight."""
    try:
        request = urllib.request.Request(
            FIVETHIRTYEIGHT_UBER_APRIL_2014,
            headers={"User-Agent": "RideSpotML/1.0"},
        )
        rows: list[dict[str, object]] = []
        with urllib.request.urlopen(request, timeout=timeout) as response:
            wrapper = io.TextIOWrapper(response, encoding="utf-8")
            reader = csv.DictReader(wrapper)
            for raw in reader:
                rows.append(
                    {
                        "pickup_datetime": raw.get("Date/Time"),
                        "lat": raw.get("Lat"),
                        "lng": raw.get("Lon"),
                        "area": raw.get("Base") or "NYC",
                        "source_market": "nyc_uber_2014",
                    }
                )
                if len(rows) >= limit:
                    break
        frame = pd.DataFrame(rows)
        return frame, SourceStatus("fivethirtyeight_uber", "ok", len(frame))
    except Exception as exc:  # network endpoints can fail independently
        return pd.DataFrame(), SourceStatus("fivethirtyeight_uber", "failed", 0, str(exc))


def fetch_hf_green_taxi_sample(limit: int, timeout: int = 45) -> tuple[pd.DataFrame, SourceStatus]:
    """Fetch public NYC TLC green taxi CSV mirror rows from HuggingFace."""
    rows: list[dict[str, object]] = []
    try:
        for url in HF_GREEN_TAXI_2025_URLS:
            if len(rows) >= limit:
                break
            request = urllib.request.Request(url, headers={"User-Agent": "RideSpotML/1.0"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                wrapper = io.TextIOWrapper(response, encoding="utf-8")
                reader = csv.DictReader(wrapper)
                for raw in reader:
                    zone = str(raw.get("PULocationID") or "unknown")
                    unit = stable_unit(f"tlc-zone:{zone}")
                    rows.append(
                        {
                            "pickup_datetime": raw.get("lpep_pickup_datetime"),
                            # TLC CSV exposes pickup zone IDs, not coordinates. Use a stable
                            # NYC-ish coordinate solely for feature compatibility; zone ID is
                            # preserved in area and is the stronger signal.
                            "lat": 40.55 + unit * 0.35,
                            "lng": -74.08 + stable_unit(f"tlc-zone-lng:{zone}") * 0.35,
                            "area": f"tlc-zone-{zone}",
                            "source_market": "nyc_green_taxi_2025",
                        }
                    )
                    if len(rows) >= limit:
                        break
        frame = pd.DataFrame(rows)
        return frame, SourceStatus("nyc_green_taxi_hf", "ok", len(frame))
    except Exception as exc:
        return pd.DataFrame(), SourceStatus("nyc_green_taxi_hf", "failed", len(rows), str(exc))


def fetch_chicago_tnp_sample(limit: int, timeout: int = 30) -> tuple[pd.DataFrame, SourceStatus]:
    """Fetch a bounded sample of public Chicago rideshare pickup records."""
    params = urllib.parse.urlencode(
        {
            "$limit": str(limit),
            "$select": (
                "trip_start_timestamp,pickup_centroid_latitude,"
                "pickup_centroid_longitude,pickup_community_area"
            ),
            "$where": (
                "pickup_centroid_latitude IS NOT NULL "
                "AND pickup_centroid_longitude IS NOT NULL "
                "AND trip_start_timestamp IS NOT NULL"
            ),
        }
    )
    headers = {"User-Agent": "RideSpotML/1.0"}
    app_token = os.getenv("CHICAGO_SOCRATA_APP_TOKEN")
    if app_token:
        headers["X-App-Token"] = app_token

    try:
        text = fetch_text(f"{CHICAGO_TNP_2025_ENDPOINT}?{params}", timeout=timeout, headers=headers)
        payload = json.loads(text)
        rows = [
            {
                "pickup_datetime": item.get("trip_start_timestamp"),
                "lat": item.get("pickup_centroid_latitude"),
                "lng": item.get("pickup_centroid_longitude"),
                "area": item.get("pickup_community_area") or "Chicago",
                "source_market": "chicago_tnp_2025",
            }
            for item in payload
        ]
        frame = pd.DataFrame(rows)
        return frame, SourceStatus("chicago_tnp", "ok", len(frame))
    except Exception as exc:
        return pd.DataFrame(), SourceStatus("chicago_tnp", "failed", 0, str(exc))


def fetch_gzip_text_lines(url: str, *, timeout: int = 30) -> list[str]:
    request = urllib.request.Request(url, headers={"User-Agent": "RideSpotML/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            return gz.read().decode("utf-8").splitlines()


def fetch_frostt_uber_windows(
    limit: int,
    timeout: int = 60,
) -> tuple[pd.DataFrame, SourceStatus]:
    """Fetch aggregated NYC Uber pickup count cells from the FROSTT tensor."""
    try:
        dates = fetch_gzip_text_lines(FROSTT_UBER_BASE + "mode-1-dates.map.gz", timeout=timeout)
        hours = fetch_gzip_text_lines(FROSTT_UBER_BASE + "mode-2-hours.map.gz", timeout=timeout)
        latitudes = fetch_gzip_text_lines(FROSTT_UBER_BASE + "mode-3-latitudes.map.gz", timeout=timeout)
        longitudes = fetch_gzip_text_lines(FROSTT_UBER_BASE + "mode-4-longitudes.map.gz", timeout=timeout)

        request = urllib.request.Request(
            FROSTT_UBER_BASE + "uber.tns.gz",
            headers={"User-Agent": "RideSpotML/1.0"},
        )
        aggregated: dict[tuple[str, str, int, str, float, float], int] = {}
        cells_read = 0
        with urllib.request.urlopen(request, timeout=timeout) as response:
            with gzip.GzipFile(fileobj=response) as gz:
                for raw_line in gz:
                    line = raw_line.decode("utf-8").strip()
                    if not line:
                        continue
                    date_idx, hour_idx, lat_idx, lng_idx, count = line.split()
                    date = dates[int(date_idx) - 1]
                    hour = int(hours[int(hour_idx) - 1])
                    lat = round(float(latitudes[int(lat_idx) - 1]), 1)
                    lng = round(float(longitudes[int(lng_idx) - 1]), 1)
                    area = f"nyc-grid-{lat:.1f}:{lng:.1f}"
                    key = ("frostt_uber_pickups", date, hour, area, lat, lng)
                    aggregated[key] = aggregated.get(key, 0) + int(count)
                    cells_read += 1
                    if cells_read >= limit:
                        break

        rows = [
            {
                "source_market": source_market,
                "event_date": event_date,
                "hour": hour,
                "area": area,
                "lat_bucket": lat,
                "lng_bucket": lng,
                "actual_ride_requests": count,
            }
            for (source_market, event_date, hour, area, lat, lng), count in aggregated.items()
        ]
        frame = pd.DataFrame(rows)
        return frame, SourceStatus("frostt_uber_pickups", "ok", len(frame), f"cells_read={cells_read}")
    except Exception as exc:
        return pd.DataFrame(), SourceStatus("frostt_uber_pickups", "failed", 0, str(exc))


def load_local_pickup_csv(path: Path, limit: int | None = None) -> tuple[pd.DataFrame, SourceStatus]:
    """Load user-provided public/proxy pickup rows using a tolerant column mapping."""
    if not path.exists():
        return pd.DataFrame(), SourceStatus("local_csv", "skipped", 0, f"Missing file: {path}")

    frame = pd.read_csv(path, nrows=limit)
    lower_map = {column.lower().strip(): column for column in frame.columns}

    def pick(*names: str) -> str | None:
        for name in names:
            if name in lower_map:
                return lower_map[name]
        return None

    datetime_col = pick("pickup_datetime", "date/time", "trip_start_timestamp", "lpep_pickup_datetime")
    lat_col = pick("lat", "latitude", "pickup_centroid_latitude")
    lng_col = pick("lng", "lon", "longitude", "pickup_centroid_longitude")
    area_col = pick("area", "base", "pickup_community_area", "pulocationid")

    if datetime_col is None or lat_col is None or lng_col is None:
        return pd.DataFrame(), SourceStatus(
            "local_csv",
            "failed",
            0,
            "CSV must include pickup datetime plus latitude/longitude columns.",
        )

    normalised = pd.DataFrame(
        {
            "pickup_datetime": frame[datetime_col],
            "lat": frame[lat_col],
            "lng": frame[lng_col],
            "area": frame[area_col] if area_col else "local",
            "source_market": "local_public_proxy",
        }
    )
    return normalised, SourceStatus("local_csv", "ok", len(normalised), str(path))


def load_proxy_fixture(limit: int = 600) -> tuple[pd.DataFrame, SourceStatus]:
    """Deterministic real-schema fixture for smoke tests when public endpoints are unavailable."""
    start = pd.Timestamp("2024-01-01 00:00:00")
    rows = []
    for idx in range(limit):
        hour = idx % 24
        day = idx // 24
        lat = 40.70 + (idx % 17) * 0.006
        lng = -74.02 + (idx % 19) * 0.006
        rows.append(
            {
                "pickup_datetime": start + pd.Timedelta(days=day, hours=hour),
                "lat": lat,
                "lng": lng,
                "area": f"fixture-zone-{idx % 12}",
                "source_market": "fixture_proxy",
            }
        )
    return pd.DataFrame(rows), SourceStatus("fixture", "ok", limit, "deterministic fallback")


def normalise_pickups(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    data = frame.copy()
    data["pickup_datetime"] = pd.to_datetime(data["pickup_datetime"], errors="coerce")
    data["lat"] = pd.to_numeric(data["lat"], errors="coerce")
    data["lng"] = pd.to_numeric(data["lng"], errors="coerce")
    data["area"] = data["area"].fillna("unknown").astype(str)
    data["source_market"] = data["source_market"].fillna("unknown").astype(str)
    return data.dropna(subset=["pickup_datetime", "lat", "lng"])


def aggregate_pickup_windows(pickups: pd.DataFrame) -> pd.DataFrame:
    data = normalise_pickups(pickups)
    if data.empty:
        return data

    data["event_date"] = data["pickup_datetime"].dt.date.astype(str)
    data["hour"] = data["pickup_datetime"].dt.hour
    # Coarse grid cells approximate demand zones. Fine-grained cells create too many
    # single-pickup ties, which are real but not useful event-zone labels.
    data["lat_bucket"] = data["lat"].round(1)
    data["lng_bucket"] = data["lng"].round(1)
    group_cols = ["source_market", "event_date", "hour", "area", "lat_bucket", "lng_bucket"]
    grouped = (
        data.groupby(group_cols, dropna=False)
        .size()
        .reset_index(name="actual_ride_requests")
        .sort_values(["event_date", "hour", "area"])
        .reset_index(drop=True)
    )
    return grouped


def assign_outcome_labels(windows: pd.DataFrame) -> pd.DataFrame:
    if windows.empty:
        return windows
    data = windows.sort_values(["source_market", "event_date", "hour", "area"]).reset_index(drop=True)
    counts = data["actual_ride_requests"].astype(float)
    q25, q50, q75 = counts.quantile([0.25, 0.50, 0.75]).tolist()

    ranks = counts.rank(method="average", pct=True)

    def level(count: float) -> str:
        if count <= q25:
            return "low"
        if count <= q50:
            return "medium"
        if count <= q75:
            return "high"
        return "very-high"

    data["demand_level"] = counts.map(level)
    data["demand_score"] = (ranks * 100).round(2)
    data["label_thresholds"] = json.dumps({"q25": q25, "q50": q50, "q75": q75})
    baseline_group = ["source_market", "area", "lat_bucket", "lng_bucket", "hour"]
    data["historical_pickup_mean"] = (
        data.groupby(baseline_group)["actual_ride_requests"]
        .transform(lambda series: series.expanding().mean().shift(1))
        .fillna(1.0)
        .round(4)
    )
    data["historical_pickup_std"] = (
        data.groupby(baseline_group)["actual_ride_requests"]
        .transform(lambda series: series.expanding().std().shift(1))
        .fillna(0.0)
        .round(4)
    )
    data["historical_pickup_max"] = (
        data.groupby(baseline_group)["actual_ride_requests"]
        .transform(lambda series: series.expanding().max().shift(1))
        .fillna(1.0)
        .round(4)
    )
    data["same_hour_previous_pickups"] = (
        data.groupby(baseline_group)["actual_ride_requests"].shift(1).fillna(1.0)
    )
    recent_group = ["source_market", "event_date", "area", "lat_bucket", "lng_bucket"]
    data["previous_hour_pickups"] = (
        data.groupby(recent_group)["actual_ride_requests"].shift(1).fillna(0.0)
    )
    data["pickup_trend"] = (
        data["previous_hour_pickups"].astype(float) - data["historical_pickup_mean"].astype(float)
    ).round(4)
    return data


def period_for_hour(hour: int) -> str:
    if hour <= 5:
        return "Late Night"
    if hour <= 9:
        return "Morning"
    if hour <= 13:
        return "Midday"
    if hour <= 17:
        return "Afternoon"
    if hour <= 21:
        return "Evening"
    return "Night"


def category_for_window(area: str, hour: int, day_num: int) -> tuple[str, str]:
    seed = stable_unit(f"{area}:{hour}:{day_num}")
    if hour >= 22 or hour <= 2:
        return ("Club Night", "Nightlife") if seed > 0.25 else ("Concert", "Entertainment")
    if day_num >= 5 and 12 <= hour <= 19:
        return ("Football Match", "Sports") if seed > 0.4 else ("Festival", "Entertainment")
    if 7 <= hour <= 10:
        return ("Conference", "Business")
    return ("Community Event", "Community")


def market_for_source(source_market: str) -> tuple[str, str]:
    # Map proxy markets into the supported RideSpot country contract while retaining source_market.
    if "chicago" in source_market.lower() or "nyc" in source_market.lower():
        return "London", "UK"
    return "London", "UK"


def build_ridespot_rows(windows: pd.DataFrame) -> pd.DataFrame:
    labelled = assign_outcome_labels(windows)
    rows: list[dict[str, object]] = []
    for idx, item in labelled.iterrows():
        source_market = str(item["source_market"])
        city, country = market_for_source(source_market)
        event_date = pd.Timestamp(item["event_date"])
        hour = int(item["hour"])
        area = str(item["area"])
        key = f"{source_market}:{item['event_date']}:{hour}:{area}"
        day_num = int(event_date.dayofweek)
        month = int(event_date.month)
        event_type, event_category = category_for_window(area, hour, day_num)
        baseline = max(1.0, float(item.get("historical_pickup_mean", 1.0)))
        previous_hour = max(0.0, float(item.get("previous_hour_pickups", 0.0)))
        same_hour_previous = max(1.0, float(item.get("same_hour_previous_pickups", 1.0)))
        capacity = stable_int(f"{key}:capacity", 700, 90000)
        expected_attendance = min(
            capacity,
            max(200, int(baseline * stable_int(f"{key}:attendance_multiplier", 140, 360))),
        )
        end_hour = (hour + stable_int(f"{key}:duration", 1, 4)) % 24
        weather = ["Clear", "Cloudy", "Light Rain", "Rain", "Overcast"][
            stable_int(f"{key}:weather", 0, 4)
        ]
        row = {
            "event_id": f"PROXY-{idx:07d}",
            "event_name": f"Proxy demand window {area}",
            "event_type": event_type,
            "event_category": event_category,
            "venue_name": f"{area} Mobility Zone",
            "area": area,
            "city": city,
            "country": country,
            "latitude": float(item["lat_bucket"]),
            "longitude": float(item["lng_bucket"]),
            "venue_capacity": capacity,
            "venue_transport_score": stable_int(f"{key}:transport", 3, 10),
            "venue_nearby_bars": stable_int(f"{key}:bars", 0, 30),
            "venue_parking_spaces": stable_int(f"{key}:parking", 20, 3000),
            "avg_taxi_wait_pre_event_mins": stable_int(f"{key}:wait", 2, 35),
            "venue_historical_perf_index": round(min(2.5, 0.55 + baseline / 12.0), 3),
            "historical_pickup_mean": round(baseline, 4),
            "historical_pickup_std": round(float(item.get("historical_pickup_std", 0.0)), 4),
            "historical_pickup_max": round(float(item.get("historical_pickup_max", 1.0)), 4),
            "same_hour_previous_pickups": round(same_hour_previous, 4),
            "previous_hour_pickups": round(previous_hour, 4),
            "pickup_trend": round(float(item.get("pickup_trend", 0.0)), 4),
            "event_date": str(item["event_date"]),
            "day_of_week": event_date.day_name(),
            "day_of_week_num": day_num,
            "month": month,
            "start_hour": hour,
            "start_minute": 0,
            "end_hour": end_hour,
            "duration_hours": max(1, (end_hour - hour) % 24),
            "is_weekend": int(day_num >= 5),
            "is_public_holiday": 0,
            "is_detty_december": 0,
            "expected_attendance": expected_attendance,
            "pre_book_ride_rate": round(min(0.6, 0.05 + baseline / 180.0), 3),
            "base_ride_seeking_rate": round(min(0.85, 0.18 + baseline / 110.0), 3),
            "weather_condition": weather,
            "social_buzz_score": round(min(100.0, baseline * 7.0 + stable_unit(f"{key}:buzz") * 20), 1),
            "nearby_competing_events": stable_int(f"{key}:competition", 0, 4),
            "driver_supply_index": round(0.1 + stable_unit(f"{key}:supply") * 0.85, 3),
            "fuel_availability_index": 1.0,
            "road_congestion_index": round(0.35 + stable_unit(f"{key}:road") * 0.6, 3),
            "security_index": 1.0,
            "power_reliability_index": 1.0,
            "public_transport_disruption": int(stable_unit(f"{key}:disruption") > 0.82),
            "tube_strike_active": int(stable_unit(f"{key}:strike") > 0.95),
            "actual_ride_requests": int(item["actual_ride_requests"]),
            "demand_score": float(item["demand_score"]),
            "demand_level": str(item["demand_level"]),
            "drivers_needed": max(1, math.ceil(int(item["actual_ride_requests"]) / 7)),
            "optimal_radius_meters": stable_int(f"{key}:radius", 100, 600),
            "peak_booking_window_mins": stable_int(f"{key}:peak", 8, 45),
            "driver_acted_on_prediction": 0,
            "driver_feedback_score": np.nan,
            "source_market": source_market,
            "label_source": "public_trip_pickup_density",
        }
        rows.append(derive_features(row))

    output = pd.DataFrame(rows)
    output["demand_level"] = normalise_target_labels(output["demand_level"])
    return output


def align_to_base_schema(proxy_rows: pd.DataFrame, base_path: Path = DATASET_PATH) -> pd.DataFrame:
    base_columns = list(pd.read_csv(base_path, nrows=0).columns)
    extra_columns = [column for column in proxy_rows.columns if column not in base_columns]
    ordered = proxy_rows.reindex(columns=base_columns + extra_columns)
    return ordered


def collect_proxy_pickups(
    *,
    limit: int = 5000,
    local_csv: Path | None = None,
    allow_fixture: bool = False,
    timeout: int = 30,
    include_chicago: bool = True,
    include_fivethirtyeight: bool = True,
    include_green_taxi: bool = True,
) -> tuple[pd.DataFrame, list[SourceStatus]]:
    frames: list[pd.DataFrame] = []
    statuses: list[SourceStatus] = []

    if local_csv is not None:
        frame, status = load_local_pickup_csv(local_csv, limit)
        statuses.append(status)
        if not frame.empty:
            frames.append(frame)

    fetchers = []
    if include_chicago:
        fetchers.append(fetch_chicago_tnp_sample)
    if include_fivethirtyeight:
        fetchers.append(fetch_fivethirtyeight_uber_sample)
    if include_green_taxi:
        fetchers.append(fetch_hf_green_taxi_sample)

    for fetcher in fetchers:
        frame, status = fetcher(limit, timeout)
        statuses.append(status)
        if not frame.empty:
            frames.append(frame)

    if not frames and allow_fixture:
        frame, status = load_proxy_fixture(min(limit, 1000))
        statuses.append(status)
        frames.append(frame)

    if not frames:
        return pd.DataFrame(), statuses

    pickups = pd.concat(frames, ignore_index=True)
    return pickups, statuses


def build_proxy_dataset(
    *,
    limit: int = 5000,
    output_path: Path = PROXY_OUTPUT_PATH,
    local_csv: Path | None = None,
    allow_fixture: bool = False,
    timeout: int = 30,
    include_frostt: bool = True,
    include_chicago: bool = True,
    include_fivethirtyeight: bool = True,
    include_green_taxi: bool = True,
) -> dict[str, object]:
    PROXY_DIR.mkdir(parents=True, exist_ok=True)
    if include_frostt:
        frostt_windows, frostt_status = fetch_frostt_uber_windows(limit=limit, timeout=max(timeout, 60))
    else:
        frostt_windows = pd.DataFrame()
        frostt_status = SourceStatus("frostt_uber_pickups", "skipped")
    pickups, statuses = collect_proxy_pickups(
        limit=limit,
        local_csv=local_csv,
        allow_fixture=allow_fixture,
        timeout=timeout,
        include_chicago=include_chicago,
        include_fivethirtyeight=include_fivethirtyeight,
        include_green_taxi=include_green_taxi,
    )
    statuses = [frostt_status, *statuses]
    pickup_windows = aggregate_pickup_windows(pickups)
    window_frames = [frame for frame in [frostt_windows, pickup_windows] if not frame.empty]
    windows = pd.concat(window_frames, ignore_index=True) if window_frames else pd.DataFrame()
    proxy_rows = build_ridespot_rows(windows) if not windows.empty else pd.DataFrame()
    aligned = align_to_base_schema(proxy_rows) if not proxy_rows.empty else proxy_rows

    if not aligned.empty:
        aligned.to_csv(output_path, index=False)

    return {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "output_path": str(output_path),
        "pickup_rows": int(len(pickups)),
        "window_rows": int(len(windows)),
        "training_rows": int(len(aligned)),
        "sources": [status.to_dict() for status in statuses],
        "demand_distribution": (
            aligned["demand_level"].value_counts().to_dict() if not aligned.empty else {}
        ),
        "label_policy": "Labels are quantiles of actual pickup density per source/date/hour/area window.",
    }


def load_combined_training_data(proxy_path: Path = PROXY_OUTPUT_PATH) -> pd.DataFrame:
    base = pd.read_csv(DATASET_PATH)
    if not proxy_path.exists():
        return base
    proxy = pd.read_csv(proxy_path)
    base_columns = list(base.columns)
    extra_columns = [column for column in proxy.columns if column not in base_columns]
    combined = pd.concat(
        [base.reindex(columns=base_columns + extra_columns), proxy.reindex(columns=base_columns + extra_columns)],
        ignore_index=True,
    )
    combined["demand_level"] = normalise_target_labels(combined["demand_level"])
    return combined
