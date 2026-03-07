import { NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getLeadsByStatus, updateLeadStatus } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { resolveLeadStatusAfterAnalysis, scoreLead } from "@/lib/leads/pipeline";

export async function POST() {
  let runTracker: AgentRunTracker | null = null;

  try {
    const company = getCompanyProfile();

    if (!company) {
      return NextResponse.json(
        { error: "Company profile is required before scoring." },
        { status: 422 }
      );
    }

    const leads = getLeadsByStatus("enriched");
    leads.sort((a, b) => (b.google_rating || 0) - (a.google_rating || 0));
    runTracker = startAgentRun({
      kind: "score_batch",
      title: "Batch score enriched leads",
      summary: `Queued ${leads.length} enriched leads`,
      metadata: {
        total: leads.length,
      },
    });
    runTracker.info("Loaded leads for batch scoring", {
      stage: "setup",
      detail: `${leads.length} enriched leads`,
    });

    let processed = 0;
    let failed = 0;
    const total = leads.length;

    for (const lead of leads) {
      try {
        runTracker.setSummary(`Scoring ${processed + failed + 1} of ${total}`);
        const enrichment = getEnrichment(lead.id);
        if (!enrichment) {
          failed++;
          runTracker.warning(`Skipped ${lead.name}`, {
            stage: "lead",
            detail: "No enrichment payload found",
          });
          continue;
        }

        runTracker.progress(`Scoring ${lead.name}`, {
          stage: "lead",
          detail: enrichment.model_used || "Saved enrichment",
        });
        await scoreLead(lead.id, enrichment, company, runTracker);
        updateLeadStatus(
          lead.id,
          resolveLeadStatusAfterAnalysis(lead.status, "scored")
        );
        processed++;
        runTracker.success(`Finished ${lead.name}`, {
          stage: "lead",
          detail: "Score saved",
        });
      } catch (err) {
        console.error(`[Batch Score] Failed for lead ${lead.id}:`, err);
        failed++;
        runTracker.error(`Failed ${lead.name}`, {
          stage: "lead",
          detail: err instanceof Error ? err.message : "Unknown error occurred",
        });
      }
    }

    runTracker.complete(
      `Batch scoring finished: ${processed}/${total} processed, ${failed} failed`
    );

    return NextResponse.json({
      runId: runTracker.runId,
      processed,
      failed,
      total,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    runTracker?.fail(error, `Batch scoring failed: ${message}`);
    console.error("[POST /api/score/batch]", error);
    return NextResponse.json(
      { error: "Batch scoring failed", detail: message },
      { status: 500 }
    );
  }
}
