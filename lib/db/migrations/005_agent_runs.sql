CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  lead_id INTEGER REFERENCES leads(id),
  search_job_id INTEGER REFERENCES search_jobs(id),
  summary TEXT,
  metadata TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_kind ON agent_runs(kind);
CREATE INDEX IF NOT EXISTS idx_agent_runs_lead_id ON agent_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_search_job_id ON agent_runs(search_job_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_updated_at ON agent_runs(updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_events (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'info',
  stage TEXT,
  message TEXT NOT NULL,
  detail TEXT,
  url TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id ON agent_run_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_created_at ON agent_run_events(created_at DESC);
