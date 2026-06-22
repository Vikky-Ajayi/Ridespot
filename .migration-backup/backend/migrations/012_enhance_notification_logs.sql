ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_type_check;
END $$;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check
  CHECK (type IN ('hotspot_alert', 'coverage_sufficient', 'surge_alert', 'system', 'test'));

CREATE INDEX IF NOT EXISTS idx_notification_logs_driver_sent
  ON notification_logs(driver_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_driver_unread
  ON notification_logs(driver_id, read_at)
  WHERE read_at IS NULL;
