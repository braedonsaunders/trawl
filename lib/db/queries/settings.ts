import { getDb } from "../client";

const DEFAULT_SETTINGS: Record<string, string> = {
  google_maps_api_key: "",
  llm_provider: "openai",
  llm_model: "",
  daily_send_cap: "50",
  send_delay_seconds: "45",
  enrichment_concurrency: "2",
  imap_poll_interval_minutes: "15",
  hot_score_threshold: "70",
  warm_score_threshold: "40",
  max_crawl_pages: "8",
  screenshots_dir: "./data/screenshots",
  sender_name: "",
  sender_title: "Business Development",
  smtp_host: "smtp.gmail.com",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from_name: "",
  imap_host: "imap.gmail.com",
  imap_port: "993",
  imap_user: "",
  imap_pass: "",
  handoff_contacts: "[]",
  handoff_rules: "[]",
};

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run({ key, value });
}

export function setSettings(entries: Record<string, string>): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction((items: Record<string, string>) => {
    for (const [key, value] of Object.entries(items)) {
      stmt.run({ key, value });
    }
  });

  transaction(entries);
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function initDefaultSettings(): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO NOTHING
  `);

  const insertAll = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      stmt.run({ key, value });
    }
  });

  insertAll();
}
