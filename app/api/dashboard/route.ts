import { NextResponse } from "next/server";
import { getLeadCounts, getAllLeads } from "@/lib/db/queries/leads";
import { getSetting } from "@/lib/db/queries/settings";
import { getSentToday } from "@/lib/db/queries/emails";

export async function GET() {
  try {
    const pipeline = getLeadCounts();
    const sentToday = getSentToday();
    const dailyCap = parseInt(getSetting("daily_send_cap") || "50", 10);

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
      emailsSentToday: sentToday,
      dailySendCap: dailyCap,
      replies: pipeline["replied"] || 0,
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
