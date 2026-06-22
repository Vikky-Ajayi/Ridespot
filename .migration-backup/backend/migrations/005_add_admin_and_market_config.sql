-- 005_add_admin_and_market_config.sql
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'ops' CHECK (role IN ('ops', 'super')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city VARCHAR(100) UNIQUE NOT NULL,
  country VARCHAR(100) NOT NULL,
  notification_radius_meters INTEGER NOT NULL DEFAULT 300,
  driver_per_attendee_ratio INTEGER NOT NULL DEFAULT 10,
  min_drivers_per_zone INTEGER NOT NULL DEFAULT 3,
  alert_radius_meters INTEGER NOT NULL DEFAULT 15000,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admins(id)
);

INSERT INTO market_config (
  city,
  country,
  notification_radius_meters,
  driver_per_attendee_ratio,
  min_drivers_per_zone,
  alert_radius_meters
) VALUES
  ('Lagos', 'Nigeria', 300, 10, 3, 20000),
  ('Abuja', 'Nigeria', 300, 10, 3, 20000),
  ('London', 'UK', 150, 8, 2, 15000),
  ('Manchester', 'UK', 150, 8, 2, 15000),
  ('Birmingham', 'UK', 150, 8, 2, 15000)
ON CONFLICT (city) DO NOTHING;

INSERT INTO admins (email, password_hash, name, role)
VALUES (
  'ops@ridespot.app',
  '$2b$12$olURB2GF.HF.UCaUuGFjPud5UBARqAZfxawJlSlOfsUZCgBGWjR5e',
  'RideSpot Ops',
  'super'
)
ON CONFLICT (email) DO NOTHING;

