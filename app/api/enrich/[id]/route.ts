import { NextRequest, NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getLeadById, updateLeadStatus } from "@/lib/db/queries/leads";
import {
  enrichAndScoreLead,
  resolveLeadStatusAfterAnalysis,
} from "@/lib/leads/pipeline";

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

    runTracker = startAgentRun({
      kind: "enrich",
      title: `Enrich ${lead.name}`,
      leadId,
      summary: "Preparing lead enrichment",
      metadata: {
        leadName: lead.name,
        website: lead.website,
      },
    });
    runTracker.info("Loaded lead for enrichment", {
      stage: "setup",
      detail: lead.website || "No website saved for this lead",
      url: lead.website,
    });

    const result = await enrichAndScoreLead(lead, runTracker);
    updateLeadStatus(
      leadId,
      resolveLeadStatusAfterAnalysis(lead.status, result.status)
    );
    runTracker.complete(
      result.score
        ? `Enrichment and scoring complete for ${lead.name}`
        : result.scoreError
          ? `Enrichment complete for ${lead.name}; scoring needs attention`
          : `Enrichment complete for ${lead.name}`
    );

    return NextResponse.json({
      runId: runTracker.runId,
      lead_id: leadId,
      enrichment: result.enrichment,
      score: result.score,
      status: result.status,
      score_error: result.scoreError,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    runTracker?.fail(error, `Enrichment failed: ${message}`);
    console.error("[POST /api/enrich/[id]]", error);
    return NextResponse.json(
      { error: "Enrichment failed", detail: message },
      { status: 500 }
    );
  }
}
