import { getDb } from "../client";

export interface Email {
  id: number;
  lead_id: number;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  status: string;
  sent_at: string | null;
  replied_at: string | null;
  thread_id: string | null;
  model_used: string | null;
  created_at: string;
}

export interface CreateEmailDraftData {
  to_email?: string | null;
  to_name?: string | null;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  model_used?: string | null;
}

export interface UpdateEmailFields {
  sent_at?: string | null;
  replied_at?: string | null;
  thread_id?: string | null;
  to_email?: string | null;
  to_name?: string | null;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
}

export function getEmailsByLeadId(leadId: number): Email[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM outreach_emails WHERE lead_id = ? ORDER BY created_at DESC")
    .all(leadId) as Email[];
}

export function getEmailById(id: number): Email | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM outreach_emails WHERE id = ?").get(id);
  return (row as Email) ?? null;
}

export function createEmailDraft(leadId: number, data: CreateEmailDraftData): Email {
  const db = getDb();

  return db.prepare(`
    INSERT INTO outreach_emails (lead_id, to_email, to_name, subject, body_html, body_text, status, model_used)
    VALUES (@lead_id, @to_email, @to_name, @subject, @body_html, @body_text, 'draft', @model_used)
    RETURNING *
  `).get({
    lead_id: leadId,
    to_email: data.to_email ?? null,
    to_name: data.to_name ?? null,
    subject: data.subject ?? null,
    body_html: data.body_html ?? null,
    body_text: data.body_text ?? null,
    model_used: data.model_used ?? null,
  }) as Email;
}

export function updateEmailStatus(
  id: number,
  status: string,
  extraFields?: UpdateEmailFields
): void {
  const db = getDb();

  if (!extraFields) {
    db.prepare("UPDATE outreach_emails SET status = ? WHERE id = ?").run(status, id);
    return;
  }

  const setClauses = ["status = @status"];
  const params: Record<string, unknown> = { id, status };

  for (const [key, value] of Object.entries(extraFields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  db.prepare(`UPDATE outreach_emails SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
}

export function getEmailDrafts(): Email[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM outreach_emails WHERE status = 'draft' ORDER BY created_at DESC")
    .all() as Email[];
}

export function getSentToday(): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM outreach_emails WHERE status = 'sent' AND date(sent_at) = date('now')"
    )
    .get() as { count: number };
  return row.count;
}
