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

export interface EmailWithLead extends Email {
  lead_name: string;
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

export function getEmailDraftsWithLead(): EmailWithLead[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.*, l.name AS lead_name
       FROM outreach_emails e
       INNER JOIN leads l ON l.id = e.lead_id
       WHERE e.status = 'draft'
       ORDER BY e.created_at DESC`
    )
    .all() as EmailWithLead[];
}

export function getEmailHistoryWithLead(limit = 100): EmailWithLead[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.*, l.name AS lead_name
       FROM outreach_emails e
       INNER JOIN leads l ON l.id = e.lead_id
       WHERE e.status <> 'draft'
       ORDER BY COALESCE(e.sent_at, e.replied_at, e.created_at) DESC
       LIMIT ?`
    )
    .all(limit) as EmailWithLead[];
}

export function getEmailsByIds(ids: number[]): Email[] {
  if (ids.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(`SELECT * FROM outreach_emails WHERE id IN (${placeholders}) ORDER BY created_at DESC`)
    .all(...ids) as Email[];
}

export function deleteEmailById(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM outreach_emails WHERE id = ?").run(id);
}

function getCount(query: string): number {
  const db = getDb();
  const row = db.prepare(query).get() as { count: number };
  return row.count;
}

export function getEmailDraftCount(): number {
  return getCount("SELECT COUNT(*) as count FROM outreach_emails WHERE status = 'draft'");
}

export function getOpenedToday(): number {
  return getCount(
    "SELECT COUNT(*) as count FROM outreach_emails WHERE status = 'opened' AND date(sent_at) = date('now')"
  );
}
