import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import {
  createLeadContact,
  listLeadContactsByLeadId,
  type LeadContactStatus,
} from "@/lib/db/queries/lead-contacts";

interface LeadContactPayload {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facility_name?: string | null;
  notes?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  confidence?: number | null;
  is_primary?: boolean;
}

function normalizeStatus(value: unknown): LeadContactStatus | undefined {
  return value === "active" || value === "suggested" || value === "archived"
    ? value
    : undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = Number.parseInt(id, 10);

    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    return NextResponse.json({
      contacts: listLeadContactsByLeadId(leadId, { includeArchived: true }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/leads/[id]/contacts]", error);
    return NextResponse.json(
      { error: "Failed to load contacts", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await request.json()) as LeadContactPayload & { status?: unknown };
    const { id } = await params;
    const leadId = Number.parseInt(id, 10);

    if (!Number.isFinite(leadId)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    const lead = getLeadById(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (
      !body ||
      (typeof body.name !== "string" || body.name.trim().length === 0) &&
        (typeof body.title !== "string" || body.title.trim().length === 0) &&
        (typeof body.email !== "string" || body.email.trim().length === 0) &&
        (typeof body.phone !== "string" || body.phone.trim().length === 0) &&
        (typeof body.linkedin_url !== "string" ||
          body.linkedin_url.trim().length === 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Add at least one contact field such as name, title, email, phone, or LinkedIn URL.",
        },
        { status: 422 }
      );
    }

    const contact = createLeadContact({
      lead_id: leadId,
      name: body.name,
      title: body.title,
      email: body.email,
      phone: body.phone,
      linkedin_url: body.linkedin_url,
      facility_name: body.facility_name,
      notes: body.notes,
      source_label: body.source_label ?? "Manual entry",
      source_url: body.source_url,
      confidence:
        typeof body.confidence === "number" ? body.confidence : undefined,
      is_primary: body.is_primary === true,
      status: normalizeStatus(body.status) ?? "active",
      source_type: "manual",
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/leads/[id]/contacts]", error);
    return NextResponse.json(
      { error: "Failed to create contact", detail: message },
      { status: 500 }
    );
  }
}
