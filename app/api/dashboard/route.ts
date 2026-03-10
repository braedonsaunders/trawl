import { NextResponse } from "next/server";
import { getLeadCounts, getAllLeads } from "@/lib/db/queries/leads";
import { getEmailDraftCount, getOpenedToday } from "@/lib/db/queries/emails";

export async function GET() {
  try {
    const rawPipeline = getLeadCounts();
    const pipeline = {
      discovered: rawPipeline["discovered"] || 0,
      enriched: rawPipeline["enriched"] || 0,
      scored: rawPipeline["scored"] || 0,
      contacted: rawPipeline["contacted"] || 0,
    };
    const draftCount = getEmailDraftCount();
    const openedToday = getOpenedToday();

    // Get recent leads for activity feed
    const recentLeads = getAllLeads({ sortBy: "updated_at", sortOrder: "desc" });
    const recentActivity = recentLeads.slice(0, 20).map((lead) => ({
      lead_name: lead.name,
      lead_id: lead.id,
      action: `Status: ${lead.status}`,
      timestamp: lead.updated_at,
    }));

    // Count totals
    const totalLeads = Object.values(pipeline).reduce((sum, count) => sum + count, 0);
    const hotLeads = pipeline["scored"] || 0; // Approximation - scored leads that may be hot

    return NextResponse.json({
      totalLeads,
      hotLeads,
      draftCount,
      openedToday,
      contacted: pipeline.contacted,
      pipeline,
      recentActivity,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data", detail: message },
      { status: 500 }
    );
  }
}
