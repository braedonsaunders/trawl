import { NextRequest, NextResponse } from "next/server";
import {
  listAgentRunEvents,
  listAgentRuns,
  type AgentRun,
  type AgentRunEvent,
} from "@/lib/db/queries/agent-runs";

function parseInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function serializeEvent(event: AgentRunEvent) {
  return {
    id: event.id,
    runId: event.run_id,
    status: event.status,
    stage: event.stage,
    message: event.message,
    detail: event.detail,
    url: event.url,
    metadata: parseJson(event.metadata),
    createdAt: event.created_at,
  };
}

function serializeRun(run: AgentRun, events: AgentRunEvent[]) {
  const serializedEvents = events.map(serializeEvent);

  return {
    id: run.id,
    kind: run.kind,
    title: run.title,
    status: run.status,
    leadId: run.lead_id,
    searchJobId: run.search_job_id,
    summary: run.summary,
    metadata: parseJson(run.metadata),
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    latestEvent: serializedEvents[0] ?? null,
    events: serializedEvents,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInteger(searchParams.get("limit"), 10, 1, 50);
  const eventLimit = parseInteger(searchParams.get("events"), 6, 1, 25);
  const status = searchParams.get("status");
  const kind = searchParams.get("kind");
  const leadIdValue = searchParams.get("leadId");
  const leadId = leadIdValue ? parseInt(leadIdValue, 10) : undefined;

  const runs = listAgentRuns({
    limit,
    status:
      status === "running" || status === "completed" || status === "failed"
        ? status
        : undefined,
    kind: kind?.trim() || undefined,
    leadId: Number.isFinite(leadId) ? leadId : undefined,
  });

  const events = listAgentRunEvents(runs.map((run) => run.id));
  const eventsByRun = new Map<number, AgentRunEvent[]>();

  for (const event of events) {
    const bucket = eventsByRun.get(event.run_id) ?? [];
    if (bucket.length < eventLimit) {
      bucket.push(event);
      eventsByRun.set(event.run_id, bucket);
    }
  }

  return NextResponse.json({
    runs: runs.map((run) => serializeRun(run, eventsByRun.get(run.id) ?? [])),
  });
}
