import { getDb } from "../client";

export interface SearchJob {
  id: number;
  query: string;
  location: string;
  radius_km: number | null;
  results_count: number;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CreateSearchJobData {
  query: string;
  location: string;
  radius_km?: number | null;
}

export interface UpdateSearchJobData {
  results_count?: number;
  status?: string;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export function createSearchJob(data: CreateSearchJobData): SearchJob {
  const db = getDb();

  return db.prepare(`
    INSERT INTO search_jobs (query, location, radius_km)
    VALUES (@query, @location, @radius_km)
    RETURNING *
  `).get({
    query: data.query,
    location: data.location,
    radius_km: data.radius_km ?? null,
  }) as SearchJob;
}

export function updateSearchJob(id: number, data: UpdateSearchJobData): void {
  const db = getDb();

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  if (setClauses.length === 0) return;

  db.prepare(`UPDATE search_jobs SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
}

export function getRecentSearchJobs(limit: number = 20): SearchJob[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM search_jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as SearchJob[];
}
