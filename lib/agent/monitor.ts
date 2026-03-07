import {
  createAgentRun,
  createAgentRunEvent,
  updateAgentRun,
  type AgentRunEventStatus,
  type AgentRunStatus,
  type UpdateAgentRunData,
} from "@/lib/db/queries/agent-runs";

interface JsonValue {
  [key: string]: unknown;
}

export interface StartAgentRunInput {
  kind: string;
  title: string;
  leadId?: number | null;
  searchJobId?: number | null;
  summary?: string | null;
  metadata?: JsonValue | null;
}

export interface AgentRunLogInput {
  message: string;
  status?: AgentRunEventStatus;
  stage?: string | null;
  detail?: string | null;
  url?: string | null;
  metadata?: JsonValue | null;
}

function toJson(value: JsonValue | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return JSON.stringify(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export interface AgentRunTracker {
  runId: number;
  log(input: AgentRunLogInput): void;
  info(message: string, input?: Omit<AgentRunLogInput, "message" | "status">): void;
  progress(
    message: string,
    input?: Omit<AgentRunLogInput, "message" | "status">
  ): void;
  success(
    message: string,
    input?: Omit<AgentRunLogInput, "message" | "status">
  ): void;
  warning(
    message: string,
    input?: Omit<AgentRunLogInput, "message" | "status">
  ): void;
  error(message: string, input?: Omit<AgentRunLogInput, "message" | "status">): void;
  update(input: UpdateAgentRunInput): void;
  setSummary(summary: string | null): void;
  complete(summary?: string | null): void;
  fail(error: unknown, summary?: string | null): void;
}

export interface UpdateAgentRunInput {
  title?: string;
  status?: AgentRunStatus;
  leadId?: number | null;
  searchJobId?: number | null;
  summary?: string | null;
  metadata?: JsonValue | null;
  startedAt?: string;
  completedAt?: string | null;
}

function normalizeUpdate(input: UpdateAgentRunInput): UpdateAgentRunData {
  return {
    title: input.title,
    status: input.status,
    lead_id: input.leadId,
    search_job_id: input.searchJobId,
    summary: input.summary,
    metadata: input.metadata === undefined ? undefined : toJson(input.metadata),
    started_at: input.startedAt,
    completed_at: input.completedAt,
  };
}

export function startAgentRun(input: StartAgentRunInput): AgentRunTracker {
  const run = createAgentRun({
    kind: input.kind,
    title: input.title,
    lead_id: input.leadId ?? null,
    search_job_id: input.searchJobId ?? null,
    summary: input.summary ?? null,
    metadata: toJson(input.metadata),
  });

  const log = (entry: AgentRunLogInput) => {
    createAgentRunEvent(run.id, {
      status: entry.status ?? "info",
      stage: entry.stage ?? null,
      message: entry.message,
      detail: entry.detail ?? null,
      url: entry.url ?? null,
      metadata: toJson(entry.metadata),
    });
  };

  return {
    runId: run.id,
    log,
    info(message, input) {
      log({ ...input, message, status: "info" });
    },
    progress(message, input) {
      log({ ...input, message, status: "progress" });
    },
    success(message, input) {
      log({ ...input, message, status: "success" });
    },
    warning(message, input) {
      log({ ...input, message, status: "warning" });
    },
    error(message, input) {
      log({ ...input, message, status: "error" });
    },
    update(update) {
      updateAgentRun(run.id, normalizeUpdate(update));
    },
    setSummary(summary) {
      updateAgentRun(run.id, { summary });
    },
    complete(summary) {
      if (summary) {
        log({
          message: "Run complete",
          status: "success",
          stage: "complete",
          detail: summary,
        });
      }
      updateAgentRun(run.id, {
        status: "completed",
        summary: summary ?? null,
        completed_at: new Date().toISOString(),
      });
    },
    fail(error, summary) {
      const detail = toErrorMessage(error);
      log({
        message: "Run failed",
        status: "error",
        detail,
        stage: "error",
      });
      updateAgentRun(run.id, {
        status: "failed",
        summary: summary ?? detail,
        completed_at: new Date().toISOString(),
      });
    },
  };
}
