-- 009_add_hotspot_snapshots.sql
-- Immutable prediction history used for delayed free-plan hotspot visibility.
CREATE TABLE IF NOT EXISTS hotspot_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  postcode VARCHAR(50),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 300,
  demand_level VARCHAR(20) NOT NULL CHECK (demand_level IN ('very-high', 'high', 'medium', 'low')),
  demand_score DECIMAL(5, 2) NOT NULL,
  live_score INTEGER,
  drive_time_text VARCHAR(50),
  distance_text VARCHAR(50),
  driver_saturation VARCHAR(20) DEFAULT 'LOW',
  ml_confidence DECIMAL(5, 4) NOT NULL DEFAULT 0,
  prediction_mode VARCHAR(40) NOT NULL DEFAULT 'conservative-fallback'
    CHECK (prediction_mode IN ('ml-certified', 'conservative-fallback')),
  is_high_confidence BOOLEAN NOT NULL DEFAULT FALSE,
  operating_confidence_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.96,
  operating_accuracy_target DECIMAL(5, 4) NOT NULL DEFAULT 0.98,
  fallback_reason TEXT,
  routing_decision VARCHAR(20) NOT NULL DEFAULT 'watch'
    CHECK (routing_decision IN ('go', 'watch', 'avoid')),
  insight_text TEXT,
  drivers_needed INTEGER NOT NULL DEFAULT 1,
  active_time_start TIMESTAMPTZ,
  active_time_end TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotspot_snapshots_location
  ON hotspot_snapshots USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_hotspot_snapshots_generated
  ON hotspot_snapshots(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotspot_snapshots_hotspot_generated
  ON hotspot_snapshots(hotspot_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotspot_snapshots_event_generated
  ON hotspot_snapshots(event_id, generated_at DESC);
