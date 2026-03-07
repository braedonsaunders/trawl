"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Target,
  Mail,
  Loader2,
} from "lucide-react";
import { LiveRunMonitor } from "@/components/agent/LiveRunMonitor";
import { LeadDetail } from "@/components/leads/LeadDetail";

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const numericLeadId = Number.parseInt(leadId, 10);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleAction(endpoint: string, actionKey: string) {
    setActionLoading(actionKey);
    try {
      await fetch(endpoint, { method: "POST" });
      setRefreshKey((current) => current + 1);
    } catch {
      // silently handle
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/leads")}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              handleAction(`/api/enrich/${leadId}`, "enrich")
            }
            disabled={actionLoading === "enrich"}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {actionLoading === "enrich" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrich + Score
          </button>

          <button
            onClick={() =>
              handleAction(`/api/score/${leadId}`, "score")
            }
            disabled={actionLoading === "score"}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {actionLoading === "score" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Target className="h-4 w-4" />
            )}
            Re-score
          </button>

          <button
            onClick={() =>
              handleAction(`/api/email/generate/${leadId}`, "email")
            }
            disabled={actionLoading === "email"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {actionLoading === "email" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Generate Email
          </button>
        </div>
      </div>

      <LiveRunMonitor
        title="Lead Run Trace"
        description="Watch this lead’s crawl, enrichment, and scoring steps while they are in flight."
        leadId={Number.isFinite(numericLeadId) ? numericLeadId : undefined}
        limit={4}
        eventLimit={5}
        linkHref="/runs"
        emptyMessage="Run enrichment or scoring to see the live trace for this lead."
      />

      {/* Lead Detail Component */}
      <LeadDetail leadId={leadId} refreshKey={refreshKey} />
    </div>
  );
}
