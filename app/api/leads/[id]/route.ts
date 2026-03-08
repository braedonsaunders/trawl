import { NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import { getEmailsByLeadId } from "@/lib/db/queries/emails";
import { listLeadContactsByLeadId } from "@/lib/db/queries/lead-contacts";
import {
  formatLeadCategories,
  parseStoredSocialLinks,
  parseStoredStringArray,
} from "@/lib/leads/format";

interface FirmographicFieldResponse {
  value: string;
  source_name: string | null;
  source_url: string | null;
  evidence_url: string | null;
  excerpt: string | null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEmailBody(bodyHtml: string | null, bodyText: string | null): string {
  if (typeof bodyHtml === "string" && bodyHtml.trim().length > 0) {
    return bodyHtml;
  }

  if (typeof bodyText === "string" && bodyText.trim().length > 0) {
    return escapeHtml(bodyText).replace(/\r?\n/g, "<br />");
  }

  return "";
}

function parseFirmographicField(
  value: unknown
): FirmographicFieldResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const parsedValue = toOptionalString(record.value);
  if (!parsedValue) {
    return null;
  }

  return {
    value: parsedValue,
    source_name: toOptionalString(record.source_name),
    source_url: toOptionalString(record.source_url),
    evidence_url: toOptionalString(record.evidence_url),
    excerpt: toOptionalString(record.excerpt),
  };
}

function parseFirmographicsEvidence(value: unknown): {
  employee_count: FirmographicFieldResponse | null;
  annual_revenue: FirmographicFieldResponse | null;
} {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      employee_count: null,
      annual_revenue: null,
    };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      employee_count: parseFirmographicField(parsed.employee_count),
      annual_revenue: parseFirmographicField(parsed.annual_revenue),
    };
  } catch {
    return {
      employee_count: null,
      annual_revenue: null,
    };
  }
}

export async function GET(
  _request: Request,
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
    const contacts = listLeadContactsByLeadId(leadId);
    const enrichment = lead.enrichment;
    const score = lead.score;
    const firmographics = parseFirmographicsEvidence(
      enrichment?.firmographics_evidence
    );

    return NextResponse.json({
      id: lead.id,
      name: lead.name,
      city: lead.city ?? "",
      state: lead.province ?? "",
      phone: lead.phone,
      website: lead.website,
      categories: formatLeadCategories(lead.categories),
      google_rating: lead.google_rating,
      google_review_count: lead.google_review_count,
      status: lead.status,
      llm_summary: toOptionalString(enrichment?.website_summary),
      industry: toOptionalString(enrichment?.industry),
      estimated_size: toOptionalString(enrichment?.company_size),
      employee_count: toOptionalString(enrichment?.employee_count),
      employee_count_estimate: enrichment?.employee_count_estimate ?? null,
      employee_count_source: toOptionalString(enrichment?.employee_count_source),
      employee_count_evidence: firmographics.employee_count,
      annual_revenue: toOptionalString(enrichment?.annual_revenue),
      annual_revenue_evidence: firmographics.annual_revenue,
      decision_maker_signals: toOptionalString(enrichment?.decision_maker_signals),
      pain_points: parseStoredStringArray(enrichment?.pain_points),
      services_needed: parseStoredStringArray(enrichment?.services_needed),
      social_links: parseStoredSocialLinks(enrichment?.social_links),
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: toOptionalString(contact.name),
        title: toOptionalString(contact.title),
        email: toOptionalString(contact.email),
        phone: toOptionalString(contact.phone),
        linkedin_url: toOptionalString(contact.linkedin_url),
        facility_name: toOptionalString(contact.facility_name),
        source_type:
          contact.source_type === "manual" ||
          contact.source_type === "research" ||
          contact.source_type === "enrichment"
            ? contact.source_type
            : "manual",
        source_label: toOptionalString(contact.source_label),
        source_url: toOptionalString(contact.source_url),
        notes: toOptionalString(contact.notes),
        confidence:
          typeof contact.confidence === "number" &&
          Number.isFinite(contact.confidence)
            ? contact.confidence
            : null,
        status:
          contact.status === "active" ||
          contact.status === "suggested" ||
          contact.status === "archived"
            ? contact.status
            : "active",
        is_primary: Boolean(contact.is_primary),
        created_at: contact.created_at,
        updated_at: contact.updated_at,
      })),
      fit_score: score?.fit_score ?? null,
      fit_tier:
        score?.fit_tier === "hot" ||
        score?.fit_tier === "warm" ||
        score?.fit_tier === "cold"
          ? score.fit_tier
          : null,
      score_reasoning: toOptionalString(score?.reasoning),
      strengths: parseStoredStringArray(score?.strengths),
      risks: parseStoredStringArray(score?.risks),
      recommended_angle: toOptionalString(score?.recommended_angle),
      emails: emails.map((email) => ({
        id: email.id,
        to_email: toOptionalString(email.to_email),
        to_name: toOptionalString(email.to_name),
        subject: toOptionalString(email.subject) ?? "Untitled email",
        body: formatEmailBody(email.body_html, email.body_text),
        status: email.status,
        sent_at: email.sent_at,
        created_at: email.created_at,
      })),
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
