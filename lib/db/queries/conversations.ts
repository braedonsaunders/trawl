import { getDb } from "../client";

export interface Conversation {
  id: number;
  lead_id: number;
  email_id: number | null;
  direction: string;
  sender: string | null;
  body: string | null;
  is_ai_response: number;
  handoff_tag: string | null;
  handoff_to_email: string | null;
  received_at: string;
}

export interface CreateConversationData {
  lead_id: number;
  email_id?: number | null;
  direction: string;
  sender?: string | null;
  body?: string | null;
  is_ai_response?: boolean;
  handoff_tag?: string | null;
  handoff_to_email?: string | null;
}

export function getConversationsByLeadId(leadId: number): Conversation[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM conversations WHERE lead_id = ? ORDER BY received_at ASC")
    .all(leadId) as Conversation[];
}

export function createConversation(data: CreateConversationData): Conversation {
  const db = getDb();

  return db.prepare(`
    INSERT INTO conversations (lead_id, email_id, direction, sender, body, is_ai_response, handoff_tag, handoff_to_email)
    VALUES (@lead_id, @email_id, @direction, @sender, @body, @is_ai_response, @handoff_tag, @handoff_to_email)
    RETURNING *
  `).get({
    lead_id: data.lead_id,
    email_id: data.email_id ?? null,
    direction: data.direction,
    sender: data.sender ?? null,
    body: data.body ?? null,
    is_ai_response: data.is_ai_response ? 1 : 0,
    handoff_tag: data.handoff_tag ?? null,
    handoff_to_email: data.handoff_to_email ?? null,
  }) as Conversation;
}
