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
      screenshots: data.screenshots ?? null,
      raw_content: data.raw_content ?? null,
      last_profiled_at: data.last_profiled_at ?? null,
    });

    return getCompanyProfile()!;
  }

  const stmt = db.prepare(`
    INSERT INTO companies (name, website, description, services, industries_served, geographies, differentiators, screenshots, raw_content, last_profiled_at)
    VALUES (@name, @website, @description, @services, @industries_served, @geographies, @differentiators, @screenshots, @raw_content, @last_profiled_at)
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
    screenshots: data.screenshots ?? null,
    raw_content: data.raw_content ?? null,
    last_profiled_at: data.last_profiled_at ?? null,
  }) as Company;
}
