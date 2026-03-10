"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Radar,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RunEvent {
  id: number;
  status: "info" | "progress" | "success" | "warning" | "error";
  stage: string | null;
  message: string;
  detail: string | null;
  url: string | null;
  createdAt: string;
}

interface Run {
  id: number;
  kind: string;
  title: string;
  status: "running" | "completed" | "failed";
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  latestEvent: RunEvent | null;
  events: RunEvent[];
}

interface LiveRunMonitorResponse {
  runs: Run[];
}

interface LiveRunMonitorProps {
  title?: string;
  description?: string;
  className?: string;
  kind?: string;
  leadId?: number;
  status?: "running" | "completed" | "failed";
  limit?: number;
  eventLimit?: number;
  emptyMessage?: string;
  linkHref?: string;
  linkLabel?: string;
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatKind(kind: string): string {
  return kind
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusBadgeClassName(status: Run["status"] | RunEvent["status"]): string {
  switch (status) {
    case "running":
    case "progress":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "completed":
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
    case "error":
      return "border-red-200 bg-red-50 text-red-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function eventIcon(event: RunEvent) {
  if (event.status === "success") return CheckCircle2;
  if (event.status === "warning" || event.status === "error") return AlertTriangle;
  if (event.stage === "crawl" || event.stage === "details") return Globe;
  if (event.stage === "search" || event.stage === "plan") return Search;
  if (event.stage === "shortlist") return Radar;
  if (event.stage === "score") return Target;
  if (event.stage === "enrichment" || event.stage === "firmographics") return Sparkles;
  return Bot;
}

export function LiveRunMonitor({
  title = "Activity",
  description = "Watch discovery, enrichment, scoring, and crawl steps as they happen.",
  className,
  kind,
  leadId,
  status,
  limit = 8,
  eventLimit = 6,
  emptyMessage = "No runs yet.",
  linkHref,
  linkLabel = "Open full monitor",
}: LiveRunMonitorProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRunning = runs.some((run) => run.status === "running");
  const activeRunCount = runs.filter((run) => run.status === "running").length;

  useEffect(() => {
    let cancelled = false;

    async function fetchRuns(silent: boolean) {
      if (!silent) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          limit: String(limit),
          events: String(eventLimit),
        });

        if (kind) {
          params.set("kind", kind);
        }

        if (leadId !== undefined) {
          params.set("leadId", String(leadId));
        }

        if (status) {
          params.set("status", status);
        }

        const response = await fetch(`/api/agent/runs?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
            throw new Error("Failed to load activity");
        }

        const payload = (await response.json()) as LiveRunMonitorResponse;
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setRuns(payload.runs ?? []);
          setError(null);
        });
      } catch (fetchError) {
        if (cancelled) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load activity";
        startTransition(() => {
          setError(message);
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchRuns(false);

    const intervalMs = hasRunning ? 1500 : 4000;
    const timer = window.setInterval(() => {
      void fetchRuns(true);
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventLimit, hasRunning, kind, leadId, limit, status]);

  return (
    <Card className={className}>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardDescription>{description}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5" />
              {title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                hasRunning
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              )}
            >
              {activeRunCount} active
            </Badge>
            {linkHref ? (
              <Link
                href={linkHref}
                className="text-sm font-medium text-primary hover:underline"
              >
                {linkLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {loading && runs.length === 0 ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!loading && runs.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed bg-muted/10 px-5 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          {runs.map((run) => (
            <section
              key={run.id}
              className="rounded-2xl border bg-background/80 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {run.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn("capitalize", statusBadgeClassName(run.status))}
                    >
                      {run.status}
                    </Badge>
                    <Badge variant="secondary">{formatKind(run.kind)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {run.summary ||
                      run.latestEvent?.message ||
                      "No status detail yet."}
                  </p>
                </div>

                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>{formatRelativeTime(run.updatedAt)}</p>
                  <p>
                    Started {formatRelativeTime(run.startedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {run.events.map((event) => {
                  const Icon = eventIcon(event);

                  return (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-3"
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                          statusBadgeClassName(event.status)
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {event.message}
                          </p>
                          {event.stage ? (
                            <Badge variant="outline" className="capitalize">
                              {event.stage}
                            </Badge>
                          ) : null}
                        </div>

                        {event.detail ? (
                          <p className="text-sm text-muted-foreground">
                            {event.detail}
                          </p>
                        ) : null}

                        {event.url ? (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {event.url}
                          </a>
                        ) : null}
                      </div>

                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
