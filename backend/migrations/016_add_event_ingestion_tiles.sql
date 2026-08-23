-- 016_add_event_ingestion_tiles.sql
-- Replaces the hardcoded 5-city SUPPORTED_MARKETS/DEFAULT_EVENT_CITIES arrays with a
-- data-driven coverage grid, so market expansion doesn't require a redeploy.
-- Seeded with a UK-wide town/city grid + Lagos + Abuja by seedEventIngestionTiles()
-- (backend/scripts/seed-event-ingestion-tiles.mjs) -- this migration only creates the table.

CREATE TABLE IF NOT EXISTS event_ingestion_tiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tile_key VARCHAR(80) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  country VARCHAR(20) NOT NULL CHECK (country IN ('Nigeria', 'UK')),
  country_code VARCHAR(2) NOT NULL CHECK (country_code IN ('NG', 'GB')),
  lat DECIMAL(9, 6) NOT NULL,
  lng DECIMAL(9, 6) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 18000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_ingested_at TIMESTAMPTZ,
  last_event_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ingestion_tiles_active
  ON event_ingestion_tiles(is_active, country);

-- Tracks per-cycle discovery volume per source, so achieved throughput toward the
-- ingestion target is measured and reported rather than assumed.
CREATE TABLE IF NOT EXISTS event_ingestion_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tile_key VARCHAR(80),
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  normalised INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ingestion_stats_recorded
  ON event_ingestion_stats(recorded_at DESC);
