-- 010_add_area_refreshes.sql
-- Tracks cached location-based provider refreshes for 15km hotspot discovery.
CREATE TABLE IF NOT EXISTS area_refreshes (
  area_key VARCHAR(120) PRIMARY KEY,
  lat DECIMAL(9, 6) NOT NULL,
  lng DECIMAL(9, 6) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 15000,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  ticketmaster_events INTEGER NOT NULL DEFAULT 0,
  eventbrite_events INTEGER NOT NULL DEFAULT 0,
  rejected_events INTEGER NOT NULL DEFAULT 0,
  generated_hotspots INTEGER NOT NULL DEFAULT 0,
  ml_fallback_hotspots INTEGER NOT NULL DEFAULT 0,
  here_traffic_available BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  provider_diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_area_refreshes_completed
  ON area_refreshes(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_area_refreshes_location
  ON area_refreshes USING GIST ((ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography));
