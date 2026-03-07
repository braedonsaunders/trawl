import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import { getEmailsByLeadId } from "@/lib/db/queries/emails";
import { getConversationsByLeadId } from "@/lib/db/queries/conversations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const emails = getEmailsByLeadId(leadId);
    const conversations = getConversationsByLeadId(leadId);

    return NextResponse.json({
      ...lead,
      emails,
      conversations,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/leads/[id]]", error);
    return NextResponse.json(
      { error: "Failed to fetch lead", detail: message },
      { status: 500 }
    );
  }
}
