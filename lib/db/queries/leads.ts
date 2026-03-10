import { getDb } from "../client";

export interface Lead {
  id: number;
  google_place_id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  website: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  categories: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LeadWithDetails extends Lead {
  enrichment: {
    website_summary: string | null;
    industry: string | null;
    company_size: string | null;
    employee_count_estimate: number | null;
    employee_count_source: string | null;
    employee_count: string | null;
    annual_revenue: string | null;
    firmographics_evidence: string | null;
    services_needed: string | null;
    decision_maker_signals: string | null;
    pain_points: string | null;
    tech_stack: string | null;
    social_links: string | null;
    potential_contacts: string | null;
    screenshots: string | null;
    enriched_at: string | null;
    model_used: string | null;
  } | null;
  score: {
    fit_score: number;
    fit_tier: string;
    reasoning: string | null;
    strengths: string | null;
    risks: string | null;
    recommended_angle: string | null;
    scored_at: string | null;
    model_used: string | null;
  } | null;
}

export interface LeadFilters {
  status?: string;
  city?: string;
  tier?: string;
  sortBy?: "name" | "created_at" | "updated_at" | "google_rating";
  sortOrder?: "asc" | "desc";
}

export interface LeadListFilters {
  status?: string;
  city?: string;
  tier?: string;
  hasWebsite?: boolean;
  sortBy?: "name" | "city" | "industry" | "score" | "status" | "last_activity";
  sortOrder?: "asc" | "desc";
}

export interface LeadListItem {
  id: number;
  name: string;
  city: string;
  industry: string;
  score: number | null;
  tier: "hot" | "warm" | "cold" | null;
  status: string;
  website: string | null;
  last_activity: string | null;
}

export interface UpsertLeadData {
  google_place_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  website?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  categories?: string | null;
  status?: string;
}

export interface LeadCounts {
  [status: string]: number;
}

export function getAllLeads(filters?: LeadFilters): Lead[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push("l.status = ?");
    params.push(filters.status);
  }
  if (filters?.city) {
    conditions.push("l.city = ?");
    params.push(filters.city);
  }
  if (filters?.tier) {
    conditions.push("ls.fit_tier = ?");
    params.push(filters.tier);
  }

  const needsScoreJoin = !!filters?.tier;
  const sortBy = filters?.sortBy ?? "created_at";
  const sortOrder = filters?.sortOrder ?? "desc";

  const allowedSortColumns = ["name", "created_at", "updated_at", "google_rating"];
  const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : "created_at";
  const safeOrder = sortOrder === "asc" ? "ASC" : "DESC";

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = needsScoreJoin
    ? "LEFT JOIN lead_scores ls ON ls.lead_id = l.id"
    : "";

  const sql = `
    SELECT l.*
    FROM leads l
    ${joinClause}
    ${whereClause}
    ORDER BY l.${safeSort} ${safeOrder}
  `;

  return db.prepare(sql).all(...params) as Lead[];
}

export function getLeadList(filters?: LeadListFilters): LeadListItem[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push("l.status = ?");
    params.push(filters.status);
  }

  if (filters?.city) {
    conditions.push("LOWER(COALESCE(l.city, '')) LIKE LOWER(?)");
    params.push(`%${filters.city}%`);
  }

  if (filters?.tier) {
    conditions.push("score.fit_tier = ?");
    params.push(filters.tier);
  }

  if (filters?.hasWebsite) {
    conditions.push("COALESCE(l.website, '') <> ''");
  }

  const sortBy = filters?.sortBy ?? "last_activity";
  const sortOrder = filters?.sortOrder ?? "desc";
  const safeOrder = sortOrder === "asc" ? "ASC" : "DESC";

  const sortColumns: Record<NonNullable<LeadListFilters["sortBy"]>, string> = {
    name: "LOWER(l.name)",
    city: "LOWER(COALESCE(l.city, ''))",
    industry: "LOWER(COALESCE(enrichment.industry, l.categories, ''))",
    score: "score.fit_score",
    status: "LOWER(l.status)",
    last_activity: "last_activity",
  };

  const safeSort = sortColumns[sortBy] ?? sortColumns.last_activity;
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      l.id,
      l.name,
      COALESCE(l.city, '') AS city,
      COALESCE(enrichment.industry, l.categories, '') AS industry,
      score.fit_score AS score,
      CASE
        WHEN score.fit_tier IN ('hot', 'warm', 'cold') THEN score.fit_tier
        ELSE NULL
      END AS tier,
      l.status,
      l.website,
      NULLIF(
        MAX(
          COALESCE(conversation.last_conversation_at, ''),
          COALESCE(email.last_email_at, ''),
          COALESCE(score.scored_at, ''),
          COALESCE(enrichment.enriched_at, ''),
          COALESCE(l.updated_at, ''),
          COALESCE(l.created_at, '')
        ),
        ''
      ) AS last_activity
    FROM leads l
    LEFT JOIN (
      SELECT e.lead_id, e.industry, e.enriched_at
      FROM lead_enrichments e
      INNER JOIN (
        SELECT lead_id, MAX(id) AS max_id
        FROM lead_enrichments
        GROUP BY lead_id
      ) latest_enrichment ON latest_enrichment.max_id = e.id
    ) enrichment ON enrichment.lead_id = l.id
    LEFT JOIN (
      SELECT s.lead_id, s.fit_score, s.fit_tier, s.scored_at
      FROM lead_scores s
      INNER JOIN (
        SELECT lead_id, MAX(id) AS max_id
        FROM lead_scores
        GROUP BY lead_id
      ) latest_score ON latest_score.max_id = s.id
    ) score ON score.lead_id = l.id
    LEFT JOIN (
      SELECT lead_id, MAX(COALESCE(replied_at, sent_at, created_at)) AS last_email_at
      FROM outreach_emails
      GROUP BY lead_id
    ) email ON email.lead_id = l.id
    LEFT JOIN (
      SELECT lead_id, MAX(received_at) AS last_conversation_at
      FROM conversations
      GROUP BY lead_id
    ) conversation ON conversation.lead_id = l.id
    ${whereClause}
    ORDER BY ${safeSort} ${safeOrder}, l.id DESC
  `;

  return db.prepare(sql).all(...params) as LeadListItem[];
}

export function getLeadById(id: number): LeadWithDetails | null {
  const db = getDb();

  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead | undefined;
  if (!lead) return null;

  const enrichment = db
    .prepare("SELECT * FROM lead_enrichments WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
    .get(id) as Record<string, unknown> | undefined;

  const score = db
    .prepare("SELECT * FROM lead_scores WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
    .get(id) as Record<string, unknown> | undefined;

  return {
    ...lead,
    enrichment: enrichment
      ? {
          website_summary: (enrichment.website_summary as string) ?? null,
          industry: (enrichment.industry as string) ?? null,
          company_size: (enrichment.company_size as string) ?? null,
          employee_count_estimate:
            typeof enrichment.employee_count_estimate === "number"
              ? (enrichment.employee_count_estimate as number)
              : null,
          employee_count_source:
            (enrichment.employee_count_source as string) ?? null,
          employee_count: (enrichment.employee_count as string) ?? null,
          annual_revenue: (enrichment.annual_revenue as string) ?? null,
          firmographics_evidence:
            (enrichment.firmographics_evidence as string) ?? null,
          services_needed: (enrichment.services_needed as string) ?? null,
          decision_maker_signals: (enrichment.decision_maker_signals as string) ?? null,
          pain_points: (enrichment.pain_points as string) ?? null,
          tech_stack: (enrichment.tech_stack as string) ?? null,
          social_links: (enrichment.social_links as string) ?? null,
          potential_contacts: (enrichment.potential_contacts as string) ?? null,
          screenshots: (enrichment.screenshots as string) ?? null,
          enriched_at: (enrichment.enriched_at as string) ?? null,
          model_used: (enrichment.model_used as string) ?? null,
        }
      : null,
    score: score
      ? {
          fit_score: score.fit_score as number,
          fit_tier: score.fit_tier as string,
          reasoning: (score.reasoning as string) ?? null,
          strengths: (score.strengths as string) ?? null,
          risks: (score.risks as string) ?? null,
          recommended_angle: (score.recommended_angle as string) ?? null,
          scored_at: (score.scored_at as string) ?? null,
          model_used: (score.model_used as string) ?? null,
        }
      : null,
  };
}

export function getLeadByGooglePlaceId(googlePlaceId: string): Lead | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM leads WHERE google_place_id = ?")
    .get(googlePlaceId) as Lead | undefined;

  return row ?? null;
}

export function upsertLead(data: UpsertLeadData): Lead {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO leads (google_place_id, name, address, city, province, phone, website, google_rating, google_review_count, categories, status)
    VALUES (@google_place_id, @name, @address, @city, @province, @phone, @website, @google_rating, @google_review_count, @categories, @status)
    ON CONFLICT(google_place_id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      phone = excluded.phone,
      website = excluded.website,
      google_rating = excluded.google_rating,
      google_review_count = excluded.google_review_count,
      categories = excluded.categories,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `);

  return stmt.get({
    google_place_id: data.google_place_id,
    name: data.name,
    address: data.address ?? null,
    city: data.city ?? null,
    province: data.province ?? null,
    phone: data.phone ?? null,
    website: data.website ?? null,
    google_rating: data.google_rating ?? null,
    google_review_count: data.google_review_count ?? null,
    categories: data.categories ?? null,
    status: data.status ?? "discovered",
  }) as Lead;
}

export function updateLeadStatus(id: number, status: string): void {
  const db = getDb();
  db.prepare("UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    status,
    id
  );
}

export function deleteLead(id: number): void {
  const db = getDb();
  const removeLead = db.transaction((leadId: number) => {
    db.prepare("DELETE FROM conversations WHERE lead_id = ?").run(leadId);
    db.prepare("DELETE FROM outreach_emails WHERE lead_id = ?").run(leadId);
    db.prepare("DELETE FROM lead_scores WHERE lead_id = ?").run(leadId);
    db.prepare("DELETE FROM lead_enrichments WHERE lead_id = ?").run(leadId);
    db.prepare("UPDATE agent_runs SET lead_id = NULL WHERE lead_id = ?").run(leadId);
    db.prepare("DELETE FROM leads WHERE id = ?").run(leadId);
  });

  removeLead(id);
}

export function deleteLeads(ids: number[]): void {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return;
  }

  const db = getDb();
  const removeLeads = db.transaction((leadIds: number[]) => {
    for (const leadId of leadIds) {
      db.prepare("DELETE FROM conversations WHERE lead_id = ?").run(leadId);
      db.prepare("DELETE FROM outreach_emails WHERE lead_id = ?").run(leadId);
      db.prepare("DELETE FROM lead_scores WHERE lead_id = ?").run(leadId);
      db.prepare("DELETE FROM lead_enrichments WHERE lead_id = ?").run(leadId);
      db.prepare("UPDATE agent_runs SET lead_id = NULL WHERE lead_id = ?").run(leadId);
      db.prepare("DELETE FROM leads WHERE id = ?").run(leadId);
    }
  });

  removeLeads(uniqueIds);
}

export function getLeadsByStatus(status: string): Lead[] {
  const db = getDb();
  return db.prepare("SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC").all(status) as Lead[];
}

export function getLeadCounts(): LeadCounts {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) as count FROM leads GROUP BY status")
    .all() as { status: string; count: number }[];

  const counts: LeadCounts = {};
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
