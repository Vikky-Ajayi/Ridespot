-- 004_add_hotspot_prediction_fields.sql
ALTER TABLE hotspots
  ADD COLUMN IF NOT EXISTS drivers_needed INTEGER NOT NULL DEFAULT 1;

