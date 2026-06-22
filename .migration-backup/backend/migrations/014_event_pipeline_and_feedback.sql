ALTER TABLE prediction_feedback
  ADD COLUMN IF NOT EXISTS navigation_session_id UUID REFERENCES navigation_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worth_it BOOLEAN,
  ADD COLUMN IF NOT EXISTS wait_time_minutes INTEGER CHECK (wait_time_minutes IS NULL OR wait_time_minutes >= 0),
  ADD COLUMN IF NOT EXISTS estimated_earnings DECIMAL(12,2) CHECK (estimated_earnings IS NULL OR estimated_earnings >= 0),
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_prediction_feedback_navigation_session
  ON prediction_feedback(navigation_session_id);

CREATE TABLE IF NOT EXISTS event_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  provider_counts JSONB DEFAULT '{}'::jsonb,
  rejected_missing_venue INTEGER DEFAULT 0,
  enriched_count INTEGER DEFAULT 0,
  generated_hotspots INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_pipeline_runs_job_finished
  ON event_pipeline_runs(job_name, finished_at DESC);
