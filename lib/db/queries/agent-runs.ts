import { getDb } from "../client";

export type AgentRunStatus = "running" | "completed" | "failed";
export type AgentRunEventStatus =
  | "info"
  | "progress"
  | "success"
  | "warning"
  | "error";

export interface AgentRun {
  id: number;
  kind: string;
  title: string;
  status: AgentRunStatus;
  lead_id: number | null;
  search_job_id: number | null;
  summary: string | null;
  metadata: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunEvent {
  id: number;
  run_id: number;
  status: AgentRunEventStatus;
  stage: string | null;
  message: string;
  detail: string | null;
  url: string | null;
  metadata: string | null;
  created_at: string;
}

export interface CreateAgentRunData {
  kind: string;
  title: string;
  status?: AgentRunStatus;
  lead_id?: number | null;
  search_job_id?: number | null;
  summary?: string | null;
  metadata?: string | null;
  started_at?: string;
}

export interface UpdateAgentRunData {
  title?: string;
  status?: AgentRunStatus;
  lead_id?: number | null;
  search_job_id?: number | null;
  summary?: string | null;
  metadata?: string | null;
  started_at?: string;
  completed_at?: string | null;
}

export interface CreateAgentRunEventData {
  status?: AgentRunEventStatus;
  stage?: string | null;
  message: string;
  detail?: string | null;
  url?: string | null;
  metadata?: string | null;
}

export interface ListAgentRunsFilters {
  limit?: number;
  status?: AgentRunStatus;
  kind?: string;
  leadId?: number;
}

export function createAgentRun(data: CreateAgentRunData): AgentRun {
  const db = getDb();

  return db
    .prepare(`
      INSERT INTO agent_runs (
        kind,
        title,
        status,
        lead_id,
        search_job_id,
        summary,
        metadata,
        started_at
      )
      VALUES (
        @kind,
        @title,
        @status,
        @lead_id,
        @search_job_id,
        @summary,
        @metadata,
        @started_at
      )
      RETURNING *
    `)
    .get({
      kind: data.kind,
      title: data.title,
      status: data.status ?? "running",
      lead_id: data.lead_id ?? null,
      search_job_id: data.search_job_id ?? null,
      summary: data.summary ?? null,
      metadata: data.metadata ?? null,
      started_at: data.started_at ?? new Date().toISOString(),
    }) as AgentRun;
}

export function updateAgentRun(id: number, data: UpdateAgentRunData): void {
  const db = getDb();
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: Record<string, unknown> = { id };

  if (data.title !== undefined) {
    setClauses.push("title = @title");
    params.title = data.title;
  }

  if (data.status !== undefined) {
    setClauses.push("status = @status");
    params.status = data.status;
  }

  if (data.lead_id !== undefined) {
    setClauses.push("lead_id = @lead_id");
    params.lead_id = data.lead_id;
  }

  if (data.search_job_id !== undefined) {
    setClauses.push("search_job_id = @search_job_id");
    params.search_job_id = data.search_job_id;
  }

  if (data.summary !== undefined) {
    setClauses.push("summary = @summary");
    params.summary = data.summary;
  }

  if (data.metadata !== undefined) {
    setClauses.push("metadata = @metadata");
    params.metadata = data.metadata;
  }

  if (data.started_at !== undefined) {
    setClauses.push("started_at = @started_at");
    params.started_at = data.started_at;
  }

  if (data.completed_at !== undefined) {
    setClauses.push("completed_at = @completed_at");
    params.completed_at = data.completed_at;
  }

  db.prepare(`UPDATE agent_runs SET ${setClauses.join(", ")} WHERE id = @id`).run(
    params
  );
}

export function createAgentRunEvent(
  runId: number,
  data: CreateAgentRunEventData
): AgentRunEvent {
  const db = getDb();
  const event = db
    .prepare(`
      INSERT INTO agent_run_events (
        run_id,
        status,
        stage,
        message,
        detail,
        url,
        metadata
      )
      VALUES (
        @run_id,
        @status,
        @stage,
        @message,
        @detail,
        @url,
        @metadata
      )
      RETURNING *
    `)
    .get({
      run_id: runId,
      status: data.status ?? "info",
      stage: data.stage ?? null,
      message: data.message,
      detail: data.detail ?? null,
      url: data.url ?? null,
      metadata: data.metadata ?? null,
    }) as AgentRunEvent;

  db.prepare("UPDATE agent_runs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    runId
  );

  return event;
}

export function listAgentRuns(filters: ListAgentRunsFilters = {}): AgentRun[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters.kind) {
    conditions.push("kind = ?");
    params.push(filters.kind);
  }

  if (filters.leadId !== undefined) {
    conditions.push("lead_id = ?");
    params.push(filters.leadId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(filters.limit ?? 10, 50));

  return db
    .prepare(
      `
        SELECT *
        FROM agent_runs
        ${whereClause}
        ORDER BY
          CASE status
            WHEN 'running' THEN 0
            WHEN 'failed' THEN 1
            ELSE 2
          END,
          updated_at DESC,
          id DESC
        LIMIT ?
      `
    )
    .all(...params, limit) as AgentRun[];
}

export function listAgentRunEvents(runIds: number[]): AgentRunEvent[] {
  if (runIds.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = runIds.map(() => "?").join(", ");

  return db
    .prepare(
      `
        SELECT *
        FROM agent_run_events
        WHERE run_id IN (${placeholders})
        ORDER BY created_at DESC, id DESC
      `
    )
    .all(...runIds) as AgentRunEvent[];
}
