import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import {
  deleteLeadContact,
  getLeadContactById,
  updateLeadContact,
  type LeadContactStatus,
} from "@/lib/db/queries/lead-contacts";

interface UpdateLeadContactPayload {
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
  status?: unknown;
  is_primary?: boolean;
}

function normalizeStatus(value: unknown): LeadContactStatus | undefined {
  return value === "active" || value === "suggested" || value === "archived"
    ? value
    : undefined;
}

async function loadContact(params: Promise<{ id: string; contactId: string }>) {
  const { id, contactId } = await params;
  const leadId = Number.parseInt(id, 10);
  const parsedContactId = Number.parseInt(contactId, 10);

  if (!Number.isFinite(leadId) || !Number.isFinite(parsedContactId)) {
    return {
      error: NextResponse.json(
        { error: "Invalid lead or contact ID" },
        { status: 400 }
      ),
    };
  }

  const lead = getLeadById(leadId);
  if (!lead) {
    return {
      error: NextResponse.json({ error: "Lead not found" }, { status: 404 }),
    };
  }

  const contact = getLeadContactById(parsedContactId);
  if (!contact || contact.lead_id !== leadId) {
    return {
      error: NextResponse.json({ error: "Contact not found" }, { status: 404 }),
    };
  }

  return {
    leadId,
    contactId: parsedContactId,
    contact,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const loaded = await loadContact(params);
    if ("error" in loaded) {
      return loaded.error;
    }

    const body = (await request.json()) as UpdateLeadContactPayload;
    const contact = updateLeadContact(loaded.contactId, {
      name: body.name,
      title: body.title,
      email: body.email,
      phone: body.phone,
      linkedin_url: body.linkedin_url,
      facility_name: body.facility_name,
      notes: body.notes,
      source_label: body.source_label,
      source_url: body.source_url,
      confidence:
        typeof body.confidence === "number" ? body.confidence : undefined,
      status: normalizeStatus(body.status),
      is_primary:
        typeof body.is_primary === "boolean" ? body.is_primary : undefined,
    });

    return NextResponse.json({ contact });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[PATCH /api/leads/[id]/contacts/[contactId]]", error);
    return NextResponse.json(
      { error: "Failed to update contact", detail: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const loaded = await loadContact(params);
    if ("error" in loaded) {
      return loaded.error;
    }

    deleteLeadContact(loaded.contactId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[DELETE /api/leads/[id]/contacts/[contactId]]", error);
    return NextResponse.json(
      { error: "Failed to delete contact", detail: message },
      { status: 500 }
    );
  }
}
