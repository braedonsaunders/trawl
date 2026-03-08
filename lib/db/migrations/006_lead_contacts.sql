CREATE TABLE IF NOT EXISTS lead_contacts (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  facility_name TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual', 'research', 'enrichment')),
  source_label TEXT,
  source_url TEXT,
  notes TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suggested', 'archived')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead_id
  ON lead_contacts(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_status
  ON lead_contacts(status);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_email
  ON lead_contacts(email);
