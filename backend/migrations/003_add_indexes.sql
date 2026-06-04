-- 003_add_indexes.sql
CREATE INDEX IF NOT EXISTS idx_driver_locations_geo ON driver_locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_events_location ON events USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_hotspots_location ON hotspots USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_hotspots_active ON hotspots(is_active, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspots_event_id_unique
  ON hotspots(event_id)
  WHERE event_id IS NOT NULL;
