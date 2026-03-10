import { getDb } from "../client";

export interface Company {
  id: number;
  name: string;
  website: string;
  description: string | null;
  services: string | null;
  industries_served: string | null;
  geographies: string | null;
  differentiators: string | null;
  ideal_customer_summary: string | null;
  buyer_search_queries: string | null;
  buyer_target_signals: string | null;
  buyer_exclusion_signals: string | null;
  screenshots: string | null;
  raw_content: string | null;
  last_profiled_at: string | null;
  created_at: string;
}

export interface UpsertCompanyData {
  name: string;
  website: string;
  description?: string | null;
  services?: string | null;
  industries_served?: string | null;
  geographies?: string | null;
  differentiators?: string | null;
  ideal_customer_summary?: string | null;
  buyer_search_queries?: string | null;
  buyer_target_signals?: string | null;
  buyer_exclusion_signals?: string | null;
  screenshots?: string | null;
  raw_content?: string | null;
  last_profiled_at?: string | null;
}

export function getCompanyProfile(): Company | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  return (row as Company) ?? null;
}

export function upsertCompanyProfile(data: UpsertCompanyData): Company {
  const db = getDb();

  const existing = getCompanyProfile();

  if (existing) {
    db.prepare(`
      UPDATE companies SET
        name = @name,
        website = @website,
        description = @description,
        services = @services,
        industries_served = @industries_served,
        geographies = @geographies,
        differentiators = @differentiators,
        ideal_customer_summary = @ideal_customer_summary,
        buyer_search_queries = @buyer_search_queries,
        buyer_target_signals = @buyer_target_signals,
        buyer_exclusion_signals = @buyer_exclusion_signals,
        screenshots = @screenshots,
        raw_content = @raw_content,
        last_profiled_at = @last_profiled_at
      WHERE id = @id
    `).run({
      id: existing.id,
      name: data.name,
      website: data.website,
      description: data.description ?? null,
      services: data.services ?? null,
      industries_served: data.industries_served ?? null,
      geographies: data.geographies ?? null,
      differentiators: data.differentiators ?? null,
      ideal_customer_summary: data.ideal_customer_summary ?? null,
      buyer_search_queries: data.buyer_search_queries ?? null,
      buyer_target_signals: data.buyer_target_signals ?? null,
      buyer_exclusion_signals: data.buyer_exclusion_signals ?? null,
      screenshots: data.screenshots ?? null,
      raw_content: data.raw_content ?? null,
      last_profiled_at: data.last_profiled_at ?? null,
    });

    return getCompanyProfile()!;
  }

  const stmt = db.prepare(`
    INSERT INTO companies (
      name,
      website,
      description,
      services,
      industries_served,
      geographies,
      differentiators,
      ideal_customer_summary,
      buyer_search_queries,
      buyer_target_signals,
      buyer_exclusion_signals,
      screenshots,
      raw_content,
      last_profiled_at
    )
    VALUES (
      @name,
      @website,
      @description,
      @services,
      @industries_served,
      @geographies,
      @differentiators,
      @ideal_customer_summary,
      @buyer_search_queries,
      @buyer_target_signals,
      @buyer_exclusion_signals,
      @screenshots,
      @raw_content,
      @last_profiled_at
    )
    RETURNING *
  `);

  return stmt.get({
    name: data.name,
    website: data.website,
    description: data.description ?? null,
    services: data.services ?? null,
    industries_served: data.industries_served ?? null,
    geographies: data.geographies ?? null,
    differentiators: data.differentiators ?? null,
    ideal_customer_summary: data.ideal_customer_summary ?? null,
    buyer_search_queries: data.buyer_search_queries ?? null,
    buyer_target_signals: data.buyer_target_signals ?? null,
    buyer_exclusion_signals: data.buyer_exclusion_signals ?? null,
    screenshots: data.screenshots ?? null,
    raw_content: data.raw_content ?? null,
    last_profiled_at: data.last_profiled_at ?? null,
  }) as Company;
}
