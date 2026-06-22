CREATE TABLE IF NOT EXISTS navigation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  origin GEOGRAPHY(POINT, 4326) NOT NULL,
  destination GEOGRAPHY(POINT, 4326) NOT NULL,
  encoded_polyline TEXT NOT NULL,
  distance_meters INTEGER NOT NULL DEFAULT 0,
  distance_text VARCHAR(50) NOT NULL DEFAULT '0 KM',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  duration_text VARCHAR(50) NOT NULL DEFAULT '0 min',
  arrival_time TIMESTAMPTZ NOT NULL,
  provider VARCHAR(40) NOT NULL CHECK (provider IN ('google-routes', 'fallback')),
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  raw_provider_response JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_navigation_sessions_driver_status
  ON navigation_sessions(driver_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_navigation_sessions_hotspot
  ON navigation_sessions(hotspot_id);
