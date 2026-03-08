import { NextRequest, NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getLeadById } from "@/lib/db/queries/leads";
import { mergeLeadContact } from "@/lib/db/queries/lead-contacts";
import { deepFindLeadContacts } from "@/lib/contacts/research";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let runTracker: AgentRunTracker | null = null;

  try {
    const { id } = await params;
    const leadId = Number.parseInt(id, 10);

    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    const lead = getLeadById(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    runTracker = startAgentRun({
      kind: "contact_research",
      title: `Deep find contacts for ${lead.name}`,
      leadId,
      summary: "Collecting plant-level contact evidence",
      metadata: {
        leadName: lead.name,
        website: lead.website,
        city: lead.city,
        province: lead.province,
      },
    });

    runTracker.info("Loaded lead for contact research", {
      stage: "setup",
      detail: [lead.city, lead.province].filter(Boolean).join(", ") || lead.website,
      url: lead.website,
    });

    const researchedContacts = await deepFindLeadContacts(lead, runTracker);
    const savedContacts = researchedContacts.map((contact) =>
      mergeLeadContact(leadId, {
        ...contact,
        source_type: "research",
        status: "suggested",
      })
    );

    runTracker.complete(
      savedContacts.length > 0
        ? `Saved ${savedContacts.length} contact suggestion${savedContacts.length === 1 ? "" : "s"}`
        : "No strong facility-level contacts found"
    );

    return NextResponse.json({
      contacts_found: researchedContacts.length,
      contacts_saved: savedContacts.length,
      contacts: savedContacts,
      run_id: runTracker.runId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    runTracker?.fail(error, `Contact research failed: ${message}`);
    console.error("[POST /api/leads/[id]/contacts/deep-find]", error);
    return NextResponse.json(
      { error: "Deep contact research failed", detail: message },
      { status: 500 }
    );
  }
}
