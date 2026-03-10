import { NextResponse } from "next/server";
import {
  deleteLeads,
  getAllLeads,
  updateLeadStatus,
} from "@/lib/db/queries/leads";
import { isLeadStatus } from "@/lib/leads/status";

interface BulkLeadBody {
  action?: string;
  lead_ids?: number[];
  status?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as BulkLeadBody;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const leadIds = Array.isArray(body.lead_ids)
      ? [...new Set(body.lead_ids.filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "No lead IDs were provided" },
        { status: 400 }
      );
    }

    const existingLeadIds = new Set(getAllLeads().map((lead) => lead.id));
    const validLeadIds = leadIds.filter((leadId) => existingLeadIds.has(leadId));

    if (validLeadIds.length === 0) {
      return NextResponse.json(
        { error: "No matching leads were found" },
        { status: 404 }
      );
    }

    if (action === "delete") {
      deleteLeads(validLeadIds);
      return NextResponse.json({ ok: true, affected: validLeadIds.length });
    }

    const nextStatus =
      action === "ignore"
        ? "ignored"
        : action === "disqualify"
          ? "disqualified"
          : typeof body.status === "string"
            ? body.status.trim()
            : "";

    if (!isLeadStatus(nextStatus)) {
      return NextResponse.json(
        { error: "Invalid bulk lead action" },
        { status: 400 }
      );
    }

    for (const leadId of validLeadIds) {
      updateLeadStatus(leadId, nextStatus);
    }

    return NextResponse.json({
      ok: true,
      affected: validLeadIds.length,
      status: nextStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/leads/bulk]", error);
    return NextResponse.json(
      { error: "Failed to update leads", detail: message },
      { status: 500 }
    );
  }
}
