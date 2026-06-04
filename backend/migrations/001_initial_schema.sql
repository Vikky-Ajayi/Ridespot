-- 001_initial_schema.sql
-- Defensive extension creation keeps wildcard psql execution replayable.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  country VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  is_email_verified BOOLEAN DEFAULT FALSE,
  plan_tier VARCHAR(20) DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'fleet')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE driver_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  is_online BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  mail_notifications BOOLEAN DEFAULT TRUE,
  demand_notifications BOOLEAN DEFAULT FALSE,
  night_mode_alerts BOOLEAN DEFAULT FALSE,
  fcm_token VARCHAR(500),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255),
  source VARCHAR(50) NOT NULL CHECK (source IN ('ticketmaster', 'eventbrite', 'manual', 'google_places')),
  name VARCHAR(500) NOT NULL,
  venue_name VARCHAR(255),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  expected_attendance INTEGER,
  event_type VARCHAR(100),
  event_category VARCHAR(100),
  raw_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (external_id, source)
);

CREATE TABLE hotspots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  insight_text TEXT,
  active_time_start TIMESTAMPTZ,
  active_time_end TIMESTAMPTZ,
  event_id UUID REFERENCES events(id),
  is_active BOOLEAN DEFAULT TRUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE driver_coverage (
  hotspot_id UUID REFERENCES hotspots(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hotspot_id, driver_id)
);

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  hotspot_id UUID REFERENCES hotspots(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('hotspot_alert', 'coverage_sufficient', 'surge_alert')),
  title VARCHAR(255),
  body TEXT,
  was_delivered BOOLEAN DEFAULT FALSE,
  was_acted_on BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prediction_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  hotspot_id UUID REFERENCES hotspots(id),
  feedback_score DECIMAL(3, 2),
  acted_on BOOLEAN DEFAULT FALSE,
  trips_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
