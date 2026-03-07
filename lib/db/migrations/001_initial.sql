CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  description TEXT,
  services TEXT,
  industries_served TEXT,
  geographies TEXT,
  differentiators TEXT,
  screenshots TEXT,
  raw_content TEXT,
  last_profiled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  google_place_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  province TEXT,
  phone TEXT,
  website TEXT,
  google_rating REAL,
  google_review_count INTEGER,
  categories TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);

CREATE TABLE IF NOT EXISTS lead_enrichments (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  website_summary TEXT,
  industry TEXT,
  company_size TEXT,
  services_needed TEXT,
  decision_maker_signals TEXT,
  pain_points TEXT,
  tech_stack TEXT,
  social_links TEXT,
  screenshots TEXT,
  raw_content TEXT,
  enriched_at DATETIME,
  model_used TEXT
);

CREATE TABLE IF NOT EXISTS lead_scores (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  fit_score INTEGER NOT NULL,
  fit_tier TEXT NOT NULL,
  reasoning TEXT,
  strengths TEXT,
  risks TEXT,
  recommended_angle TEXT,
  scored_at DATETIME,
  model_used TEXT
);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  to_email TEXT,
  to_name TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at DATETIME,
  replied_at DATETIME,
  thread_id TEXT,
  model_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  email_id INTEGER REFERENCES outreach_emails(id),
  direction TEXT NOT NULL,
  sender TEXT,
  body TEXT,
  is_ai_response INTEGER DEFAULT 0,
  handoff_tag TEXT,
  handoff_to_email TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_jobs (
  id INTEGER PRIMARY KEY,
  query TEXT NOT NULL,
  location TEXT NOT NULL,
  radius_km INTEGER,
  results_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
