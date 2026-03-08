import { getDb } from "../client";

export type LeadContactSourceType = "manual" | "research" | "enrichment";
export type LeadContactStatus = "active" | "suggested" | "archived";

export interface LeadContact {
  id: number;
  lead_id: number;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  facility_name: string | null;
  source_type: LeadContactSourceType;
  source_label: string | null;
  source_url: string | null;
  notes: string | null;
  confidence: number | null;
  status: LeadContactStatus;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadContactData {
  lead_id: number;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facility_name?: string | null;
  source_type?: LeadContactSourceType;
  source_label?: string | null;
  source_url?: string | null;
  notes?: string | null;
  confidence?: number | null;
  status?: LeadContactStatus;
  is_primary?: boolean;
}

export interface UpdateLeadContactData {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facility_name?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  notes?: string | null;
  confidence?: number | null;
  status?: LeadContactStatus;
  is_primary?: boolean;
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function sameNormalized(left: string | null, right: string | null): boolean {
  return (left || "").trim().toLowerCase() === (right || "").trim().toLowerCase();
}

export function listLeadContactsByLeadId(
  leadId: number,
  options: { includeArchived?: boolean } = {}
): LeadContact[] {
  const db = getDb();
  const conditions = ["lead_id = ?"];
  const params: unknown[] = [leadId];

  if (!options.includeArchived) {
    conditions.push("status <> 'archived'");
  }

  return db
    .prepare(
      `
        SELECT *
        FROM lead_contacts
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          is_primary DESC,
          CASE status
            WHEN 'active' THEN 0
            WHEN 'suggested' THEN 1
            ELSE 2
          END,
          CASE source_type
            WHEN 'manual' THEN 0
            WHEN 'research' THEN 1
            ELSE 2
          END,
          COALESCE(confidence, 0) DESC,
          updated_at DESC,
          id DESC
      `
    )
    .all(...params) as LeadContact[];
}

export function getLeadContactById(id: number): LeadContact | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM lead_contacts WHERE id = ?")
    .get(id) as LeadContact | undefined;

  return row ?? null;
}

export function createLeadContact(data: CreateLeadContactData): LeadContact {
  const db = getDb();
  const insert = db.transaction((input: CreateLeadContactData) => {
    if (input.is_primary) {
      db.prepare("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = ?").run(
        input.lead_id
      );
    }

    return db
      .prepare(
        `
          INSERT INTO lead_contacts (
            lead_id,
            name,
            title,
            email,
            phone,
            linkedin_url,
            facility_name,
            source_type,
            source_label,
            source_url,
            notes,
            confidence,
            status,
            is_primary,
            updated_at
          )
          VALUES (
            @lead_id,
            @name,
            @title,
            @email,
            @phone,
            @linkedin_url,
            @facility_name,
            @source_type,
            @source_label,
            @source_url,
            @notes,
            @confidence,
            @status,
            @is_primary,
            CURRENT_TIMESTAMP
          )
          RETURNING *
        `
      )
      .get({
        lead_id: input.lead_id,
        name: normalizeString(input.name),
        title: normalizeString(input.title),
        email: normalizeString(input.email),
        phone: normalizeString(input.phone),
        linkedin_url: normalizeString(input.linkedin_url),
        facility_name: normalizeString(input.facility_name),
        source_type: input.source_type ?? "manual",
        source_label: normalizeString(input.source_label),
        source_url: normalizeString(input.source_url),
        notes: normalizeString(input.notes),
        confidence: normalizeConfidence(input.confidence),
        status: input.status ?? "active",
        is_primary: input.is_primary ? 1 : 0,
      }) as LeadContact;
  });

  return insert(data);
}

export function updateLeadContact(
  id: number,
  data: UpdateLeadContactData
): LeadContact {
  const db = getDb();
  const current = getLeadContactById(id);

  if (!current) {
    throw new Error("Lead contact not found");
  }

  const next = {
    name: data.name !== undefined ? normalizeString(data.name) : current.name,
    title: data.title !== undefined ? normalizeString(data.title) : current.title,
    email: data.email !== undefined ? normalizeString(data.email) : current.email,
    phone: data.phone !== undefined ? normalizeString(data.phone) : current.phone,
    linkedin_url:
      data.linkedin_url !== undefined
        ? normalizeString(data.linkedin_url)
        : current.linkedin_url,
    facility_name:
      data.facility_name !== undefined
        ? normalizeString(data.facility_name)
        : current.facility_name,
    source_label:
      data.source_label !== undefined
        ? normalizeString(data.source_label)
        : current.source_label,
    source_url:
      data.source_url !== undefined
        ? normalizeString(data.source_url)
        : current.source_url,
    notes: data.notes !== undefined ? normalizeString(data.notes) : current.notes,
    confidence:
      data.confidence !== undefined
        ? normalizeConfidence(data.confidence)
        : current.confidence,
    status: data.status ?? current.status,
    is_primary: data.is_primary ?? Boolean(current.is_primary),
  };

  const update = db.transaction(
    (
      currentContact: LeadContact,
      nextData: typeof next
    ): LeadContact => {
      if (nextData.is_primary) {
        db.prepare("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = ?").run(
          currentContact.lead_id
        );
      }

      db.prepare(
        `
          UPDATE lead_contacts
          SET
            name = @name,
            title = @title,
            email = @email,
            phone = @phone,
            linkedin_url = @linkedin_url,
            facility_name = @facility_name,
            source_label = @source_label,
            source_url = @source_url,
            notes = @notes,
            confidence = @confidence,
            status = @status,
            is_primary = @is_primary,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `
      ).run({
        id: currentContact.id,
        ...nextData,
        is_primary: nextData.is_primary ? 1 : 0,
      });

      return getLeadContactById(currentContact.id)!;
    }
  );

  return update(current, next);
}

export function deleteLeadContact(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM lead_contacts WHERE id = ?").run(id);
}

export function findMatchingLeadContact(
  leadId: number,
  input: {
    name?: string | null;
    title?: string | null;
    email?: string | null;
    linkedin_url?: string | null;
    facility_name?: string | null;
  }
): LeadContact | null {
  const contacts = listLeadContactsByLeadId(leadId, { includeArchived: true });
  const email = normalizeString(input.email);
  const linkedin = normalizeString(input.linkedin_url);
  const name = normalizeString(input.name);
  const title = normalizeString(input.title);
  const facilityName = normalizeString(input.facility_name);

  if (email) {
    const match = contacts.find((contact) => sameNormalized(contact.email, email));
    if (match) {
      return match;
    }
  }

  if (linkedin) {
    const match = contacts.find((contact) =>
      sameNormalized(contact.linkedin_url, linkedin)
    );
    if (match) {
      return match;
    }
  }

  if (name && title) {
    const match = contacts.find((contact) => {
      return (
        sameNormalized(contact.name, name) &&
        sameNormalized(contact.title, title) &&
        sameNormalized(contact.facility_name, facilityName)
      );
    });
    if (match) {
      return match;
    }
  }

  return null;
}

export interface MergeLeadContactData {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facility_name?: string | null;
  source_type?: LeadContactSourceType;
  source_label?: string | null;
  source_url?: string | null;
  notes?: string | null;
  confidence?: number | null;
  status?: LeadContactStatus;
}

export function mergeLeadContact(
  leadId: number,
  data: MergeLeadContactData
): LeadContact {
  const existing = findMatchingLeadContact(leadId, data);

  if (!existing) {
    return createLeadContact({
      lead_id: leadId,
      name: data.name,
      title: data.title,
      email: data.email,
      phone: data.phone,
      linkedin_url: data.linkedin_url,
      facility_name: data.facility_name,
      source_type: data.source_type ?? "research",
      source_label: data.source_label,
      source_url: data.source_url,
      notes: data.notes,
      confidence: data.confidence,
      status: data.status ?? "suggested",
    });
  }

  const keepManual = existing.source_type === "manual";

  return updateLeadContact(existing.id, {
    name: existing.name ?? normalizeString(data.name),
    title: existing.title ?? normalizeString(data.title),
    email: existing.email ?? normalizeString(data.email),
    phone: existing.phone ?? normalizeString(data.phone),
    linkedin_url: existing.linkedin_url ?? normalizeString(data.linkedin_url),
    facility_name:
      existing.facility_name ?? normalizeString(data.facility_name),
    source_label:
      keepManual && existing.source_label
        ? existing.source_label
        : existing.source_label ?? normalizeString(data.source_label),
    source_url:
      keepManual && existing.source_url
        ? existing.source_url
        : existing.source_url ?? normalizeString(data.source_url),
    notes: existing.notes ?? normalizeString(data.notes),
    confidence:
      existing.confidence != null
        ? data.confidence != null
          ? Math.max(existing.confidence, data.confidence)
          : existing.confidence
        : normalizeConfidence(data.confidence),
    status:
      existing.status === "active"
        ? "active"
        : data.status ?? existing.status,
  });
}
