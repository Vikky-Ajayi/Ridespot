-- 007_add_hotspot_operating_policy.sql
ALTER TABLE hotspots
  ADD COLUMN IF NOT EXISTS ml_confidence DECIMAL(5, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prediction_mode VARCHAR(40) NOT NULL DEFAULT 'conservative-fallback',
  ADD COLUMN IF NOT EXISTS is_high_confidence BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS operating_confidence_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.96,
  ADD COLUMN IF NOT EXISTS operating_accuracy_target DECIMAL(5, 4) NOT NULL DEFAULT 0.98,
  ADD COLUMN IF NOT EXISTS fallback_reason TEXT,
  ADD COLUMN IF NOT EXISTS routing_decision VARCHAR(20) NOT NULL DEFAULT 'watch';

ALTER TABLE hotspots
  DROP CONSTRAINT IF EXISTS hotspots_prediction_mode_check,
  ADD CONSTRAINT hotspots_prediction_mode_check
    CHECK (prediction_mode IN ('ml-certified', 'conservative-fallback'));

ALTER TABLE hotspots
  DROP CONSTRAINT IF EXISTS hotspots_routing_decision_check,
  ADD CONSTRAINT hotspots_routing_decision_check
    CHECK (routing_decision IN ('go', 'watch', 'avoid'));
