-- 015_add_delivery_category.sql
-- Adds restaurant-cluster delivery hotspots alongside the existing event-driven taxi hotspots.
-- Delivery clusters flow through the same events -> hotspots pipeline as a synthetic,
-- continuously-refreshed "event" (source = 'restaurant_cluster'), distinguished from taxi
-- hotspots by the new `category` column.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;
ALTER TABLE events
  ADD CONSTRAINT events_source_check
  CHECK (source IN ('ticketmaster', 'eventbrite', 'event_aggregator', 'manual', 'google_places', 'restaurant_cluster'));

ALTER TABLE hotspots
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'taxi'
    CHECK (category IN ('taxi', 'delivery'));

ALTER TABLE hotspot_snapshots
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'taxi'
    CHECK (category IN ('taxi', 'delivery'));

-- Re-create the partial index so 'restaurant_cluster' sourced events are still covered
-- (keeps the "live/real sources" fast-path index useful for delivery queries too).
DROP INDEX IF EXISTS idx_events_live_real_sources;
CREATE INDEX IF NOT EXISTS idx_events_live_real_sources
  ON events(source, start_time, end_time)
  WHERE is_active = TRUE
    AND source IN ('ticketmaster', 'eventbrite', 'event_aggregator', 'manual', 'restaurant_cluster');

CREATE INDEX IF NOT EXISTS idx_hotspots_category
  ON hotspots(category)
  WHERE is_active = TRUE;

-- Raw restaurant/food-venue points pulled in bulk from OpenStreetMap (Overpass API).
-- Kept separate from `events` because these are locations, not time-bound happenings.
CREATE TABLE IF NOT EXISTS restaurant_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  osm_type VARCHAR(20) NOT NULL DEFAULT 'node',
  osm_id VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  amenity VARCHAR(50),
  cuisine VARCHAR(255),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100) CHECK (country IN ('Nigeria', 'UK')),
  google_place_id VARCHAR(255),
  google_rating DECIMAL(3, 2),
  google_rating_count INTEGER,
  google_price_level SMALLINT,
  enriched_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (osm_type, osm_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_venues_location
  ON restaurant_venues USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_restaurant_venues_active
  ON restaurant_venues(city, country)
  WHERE is_active = TRUE;

-- Computed clusters of nearby restaurant_venues. One row per delivery hotspot candidate.
-- `event_id` links to the synthetic events row that carries it through the existing
-- hotspot-generation pipeline (see deliveryHotspotGeneration.service.ts).
CREATE TABLE IF NOT EXISTS restaurant_clusters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_key VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 400,
  venue_count INTEGER NOT NULL DEFAULT 0,
  avg_rating DECIMAL(3, 2),
  total_rating_count INTEGER NOT NULL DEFAULT 0,
  city VARCHAR(100),
  country VARCHAR(100) CHECK (country IN ('Nigeria', 'UK')),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_clusters_location
  ON restaurant_clusters USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_restaurant_clusters_active
  ON restaurant_clusters(is_active, venue_count DESC);
