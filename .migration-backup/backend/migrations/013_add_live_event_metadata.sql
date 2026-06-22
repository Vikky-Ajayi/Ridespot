ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS estimated_end_time BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_events_live_real_sources
  ON events(source, start_time, end_time)
  WHERE is_active = TRUE
    AND source IN ('ticketmaster', 'eventbrite', 'event_aggregator', 'manual');
