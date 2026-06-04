CREATE TABLE IF NOT EXISTS payment_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('flutterwave', 'sumup')),
  country VARCHAR(100) NOT NULL CHECK (country IN ('Nigeria', 'UK')),
  plan_tier VARCHAR(20) NOT NULL CHECK (plan_tier IN ('pro', 'fleet')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'failed')),
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  checkout_reference VARCHAR(120) UNIQUE NOT NULL,
  checkout_url TEXT,
  provider_checkout_id VARCHAR(255),
  provider_payment_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_subscriptions_driver_status
  ON payment_subscriptions(driver_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_subscriptions_provider_checkout
  ON payment_subscriptions(provider, provider_checkout_id);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('flutterwave', 'sumup')),
  provider_event_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_event_id)
);
