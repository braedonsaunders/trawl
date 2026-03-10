import { startAgentRun } from "@/lib/agent/monitor";
import { getLeadById, updateLeadStatus } from "@/lib/db/queries/leads";
import {
  enrichAndScoreLead,
  resolveLeadStatusAfterAnalysis,
} from "@/lib/leads/pipeline";

export function queueLeadAnalysis(
  leadIds: number[],
  source: "discover" | "discover_dedupe"
) {
  if (leadIds.length === 0) {
    return;
  }

  const runTracker = startAgentRun({
    kind: "auto_analysis",
    title:
      source === "discover"
        ? "Auto-enrich discovered leads"
        : "Auto-enrich saved lead",
    summary: `Queued ${leadIds.length} new lead${leadIds.length === 1 ? "" : "s"} for enrichment and scoring`,
    metadata: {
      source,
      total: leadIds.length,
    },
  });

  void (async () => {
    let processed = 0;
    let failed = 0;

    try {
      for (const leadId of leadIds) {
        const lead = getLeadById(leadId);

        if (!lead) {
          failed += 1;
          runTracker.warning(`Skipped lead ${leadId}`, {
            stage: "lead",
            detail: "Lead no longer exists",
          });
          continue;
        }

        try {
          runTracker.setSummary(
            `Processing ${processed + failed + 1} of ${leadIds.length}`
          );
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
          processed += 1;

          runTracker.success(`Finished ${lead.name}`, {
            stage: "lead",
            detail: result.score ? "Enriched and scored" : "Enriched",
          });
        } catch (error) {
          failed += 1;
          console.error(`[Auto Analysis] Failed for lead ${leadId}:`, error);
          runTracker.error(`Failed ${lead.name}`, {
            stage: "lead",
            detail: error instanceof Error ? error.message : "Unknown error occurred",
            url: lead.website,
          });
        }
      }

      runTracker.complete(
        `Auto analysis finished: ${processed}/${leadIds.length} processed, ${failed} failed`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      runTracker.fail(error, `Auto analysis failed: ${message}`);
    }
  })();
}
