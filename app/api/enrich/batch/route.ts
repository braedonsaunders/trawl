import { NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getLeadsByStatus, updateLeadStatus } from "@/lib/db/queries/leads";
import {
  enrichAndScoreLead,
  resolveLeadStatusAfterAnalysis,
} from "@/lib/leads/pipeline";

export async function POST() {
  let runTracker: AgentRunTracker | null = null;

  try {
    const leads = getLeadsByStatus("discovered");
    runTracker = startAgentRun({
      kind: "enrich_batch",
      title: "Batch enrich pending leads",
      summary: `Queued ${leads.length} discovered leads`,
      metadata: {
        total: leads.length,
      },
    });
    runTracker.info("Loaded leads for batch enrichment", {
      stage: "setup",
      detail: `${leads.length} discovered leads`,
    });

    let processed = 0;
    let scored = 0;
    let failed = 0;
    let scoreFailed = 0;
    const total = leads.length;

    for (const lead of leads) {
      try {
        runTracker.setSummary(`Processing ${processed + failed + 1} of ${total}`);
        runTracker.progress(`Starting ${lead.name}`, {
          stage: "lead",
          detail: lead.website || "No website saved",
          url: lead.website,
        });

        const result = await enrichAndScoreLead(lead, runTracker);
        updateLeadStatus(
          lead.id,
          resolveLeadStatusAfterAnalysis(lead.status, result.status)
        );
        if (result.score) {
          scored++;
        }
        if (result.scoreError) {
          scoreFailed++;
        }
        processed++;
        runTracker.success(`Finished ${lead.name}`, {
          stage: "lead",
          detail: result.score
            ? "Enriched and scored"
            : result.scoreError || "Enriched",
        });
      } catch (err) {
        console.error(`[Batch Enrich] Failed for lead ${lead.id}:`, err);
        failed++;
        runTracker.error(`Failed ${lead.name}`, {
          stage: "lead",
          detail: err instanceof Error ? err.message : "Unknown error occurred",
          url: lead.website,
        });
      }
    }

    runTracker.complete(
      `Batch enrichment finished: ${processed}/${total} processed, ${failed} failed`
    );

    return NextResponse.json({
      runId: runTracker.runId,
      processed,
      scored,
      failed,
      score_failed: scoreFailed,
      total,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    runTracker?.fail(error, `Batch enrichment failed: ${message}`);
    console.error("[POST /api/enrich/batch]", error);
    return NextResponse.json(
      { error: "Batch enrichment failed", detail: message },
      { status: 500 }
    );
  }
}
