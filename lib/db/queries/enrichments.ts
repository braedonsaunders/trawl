import { getDb } from "../client";

export interface Enrichment {
  id: number;
  lead_id: number;
  website_summary: string | null;
  industry: string | null;
  company_size: string | null;
  services_needed: string | null;
  decision_maker_signals: string | null;
  pain_points: string | null;
  tech_stack: string | null;
  social_links: string | null;
  screenshots: string | null;
  raw_content: string | null;
  enriched_at: string | null;
  model_used: string | null;
}

export interface UpsertEnrichmentData {
  website_summary?: string | null;
  industry?: string | null;
  company_size?: string | null;
  services_needed?: string | null;
  decision_maker_signals?: string | null;
  pain_points?: string | null;
  tech_stack?: string | null;
  social_links?: string | null;
  screenshots?: string | null;
  raw_content?: string | null;
  enriched_at?: string | null;
  model_used?: string | null;
}

export function getEnrichment(leadId: number): Enrichment | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM lead_enrichments WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
    .get(leadId);
  return (row as Enrichment) ?? null;
}

export function upsertEnrichment(leadId: number, data: UpsertEnrichmentData): Enrichment {
  const db = getDb();

  const existing = getEnrichment(leadId);

  const params = {
    lead_id: leadId,
    website_summary: data.website_summary ?? null,
    industry: data.industry ?? null,
    company_size: data.company_size ?? null,
    services_needed: data.services_needed ?? null,
    decision_maker_signals: data.decision_maker_signals ?? null,
    pain_points: data.pain_points ?? null,
    tech_stack: data.tech_stack ?? null,
    social_links: data.social_links ?? null,
    screenshots: data.screenshots ?? null,
    raw_content: data.raw_content ?? null,
    enriched_at: data.enriched_at ?? new Date().toISOString(),
    model_used: data.model_used ?? null,
  };

  if (existing) {
    db.prepare(`
      UPDATE lead_enrichments SET
        website_summary = @website_summary,
        industry = @industry,
        company_size = @company_size,
        services_needed = @services_needed,
        decision_maker_signals = @decision_maker_signals,
        pain_points = @pain_points,
        tech_stack = @tech_stack,
        social_links = @social_links,
        screenshots = @screenshots,
        raw_content = @raw_content,
        enriched_at = @enriched_at,
        model_used = @model_used
      WHERE id = @id
    `).run({ ...params, id: existing.id });

    return getEnrichment(leadId)!;
  }

  return db.prepare(`
    INSERT INTO lead_enrichments (lead_id, website_summary, industry, company_size, services_needed, decision_maker_signals, pain_points, tech_stack, social_links, screenshots, raw_content, enriched_at, model_used)
    VALUES (@lead_id, @website_summary, @industry, @company_size, @services_needed, @decision_maker_signals, @pain_points, @tech_stack, @social_links, @screenshots, @raw_content, @enriched_at, @model_used)
    RETURNING *
  `).get(params) as Enrichment;
}
