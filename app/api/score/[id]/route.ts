import { NextRequest, NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getLeadById, updateLeadStatus } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { resolveLeadStatusAfterAnalysis, scoreLead } from "@/lib/leads/pipeline";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let runTracker: AgentRunTracker | null = null;

  try {
    const { id } = await params;
    const leadId = parseInt(id, 10);

    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: "Invalid lead ID" },
        { status: 400 }
      );
    }

    const lead = getLeadById(leadId);

    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    const company = getCompanyProfile();

    if (!company) {
      return NextResponse.json(
        { error: "Company profile is required before scoring. Run /api/profile first." },
        { status: 422 }
      );
    }

    const enrichment = getEnrichment(leadId);

    if (!enrichment) {
      return NextResponse.json(
        { error: "Lead enrichment is required before scoring. Run /api/enrich first." },
        { status: 422 }
      );
    }

    runTracker = startAgentRun({
      kind: "score",
      title: `Score ${lead.name}`,
      leadId,
      summary: "Preparing scoring job",
      metadata: {
        leadName: lead.name,
      },
    });
    runTracker.info("Loaded enrichment for scoring", {
      stage: "setup",
      detail: enrichment.model_used || "Saved enrichment data",
    });

    const score = await scoreLead(leadId, enrichment, company, runTracker);
    updateLeadStatus(
      leadId,
      resolveLeadStatusAfterAnalysis(lead.status, "scored")
    );
    runTracker.complete(`Scoring complete for ${lead.name}`);

    return NextResponse.json({
      runId: runTracker.runId,
      lead_id: leadId,
      score,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    runTracker?.fail(error, `Scoring failed: ${message}`);
    console.error("[POST /api/score/[id]]", error);
    return NextResponse.json(
      { error: "Scoring failed", detail: message },
      { status: 500 }
    );
  }
}
