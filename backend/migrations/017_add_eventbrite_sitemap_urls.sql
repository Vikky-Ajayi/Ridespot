-- 017_add_eventbrite_sitemap_urls.sql
-- Crawl-frontier table for Eventbrite's public event-page sitemap
-- (https://www.eventbrite.com/sitemap_xml/sitemap_index.xml, declared in robots.txt).
-- The official Discovery Search API is closed to non-partner keys for most accounts, and
-- Eventbrite's sitemap is NOT geo-segmented (one flat global list per shard), so every URL
-- has to be fetched and its JSON-LD checked against our market bounding boxes to know
-- whether it's in scope. This table is the durable "have we crawled this URL, and when"
-- state that lets the crawl be spread over many small, rate-limited batches instead of one
-- giant run.

CREATE TABLE IF NOT EXISTS eventbrite_sitemap_urls (
  url VARCHAR(1000) PRIMARY KEY,
  source_shard VARCHAR(255),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  last_match_region VARCHAR(80),
  last_status VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_eventbrite_sitemap_urls_crawl_order
  ON eventbrite_sitemap_urls(last_crawled_at NULLS FIRST);
