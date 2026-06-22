ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;

ALTER TABLE events
  ADD CONSTRAINT events_source_check
  CHECK (source IN ('ticketmaster', 'eventbrite', 'event_aggregator', 'manual', 'google_places'));
