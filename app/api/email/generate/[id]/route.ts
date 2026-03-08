import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { listLeadContactsByLeadId } from "@/lib/db/queries/lead-contacts";
import { getScore } from "@/lib/db/queries/scores";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { createEmailDraft } from "@/lib/db/queries/emails";
import { callLLM } from "@/lib/llm/client";
import { emailResultSchema } from "@/lib/llm/schemas";
import { buildEmailPrompt } from "@/lib/llm/prompts/email";
import { getSetting } from "@/lib/db/queries/settings";

type ProviderId = "openai" | "anthropic";
interface GenerateDraftRequest {
  to_email?: string;
  to_name?: string;
}

function selectRecipient(
  leadId: number,
  fallbackName: string
): { toEmail: string | null; toName: string | null } {
  const savedContacts = listLeadContactsByLeadId(leadId)
    .filter((contact) => Boolean(contact.email))
    .sort((left, right) => {
      if (left.is_primary !== right.is_primary) {
        return right.is_primary - left.is_primary;
      }

      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }

      const rightConfidence = right.confidence ?? 0;
      const leftConfidence = left.confidence ?? 0;
      return rightConfidence - leftConfidence;
    });

  const savedRecipient = savedContacts[0];
  if (savedRecipient?.email) {
    return {
      toEmail: savedRecipient.email,
      toName: savedRecipient.name || savedRecipient.title || fallbackName,
    };
  }

  return {
    toEmail: null,
    toName: null,
  };
}

function resolveRecipient(
  override: GenerateDraftRequest,
  leadId: number,
  fallbackName: string
): { toEmail: string | null; toName: string | null } {
  const overrideEmail = override.to_email?.trim();
  const overrideName = override.to_name?.trim();

  if (overrideEmail) {
    return {
      toEmail: overrideEmail,
      toName: overrideName || fallbackName,
    };
  }

  return selectRecipient(leadId, fallbackName);
}

function inferProvider(message: string): ProviderId | null {
  const normalized = message.toLowerCase();

  if (normalized.includes("anthropic")) {
    return "anthropic";
  }

  if (normalized.includes("openai")) {
    return "openai";
  }

  return null;
}

function providerLabel(provider: ProviderId | null): string {
  if (provider === "anthropic") {
    return "Anthropic";
  }

  if (provider === "openai") {
    return "OpenAI";
  }

  return "AI provider";
}

function normalizeSubjectVariants(
  subjectVariants: string[],
  fallbackSubject: string
): [string, string, string] {
  const cleaned = subjectVariants
    .map((subject) => subject.trim())
    .filter(Boolean);

  const fallback = fallbackSubject.trim() || "Quick question";
  const variants = cleaned.length > 0 ? cleaned : [fallback];

  while (variants.length < 3) {
    variants.push(variants[variants.length - 1] || fallback);
  }

  return [variants[0], variants[1], variants[2]];
}

function classifyGenerationError(message: string): {
  error: string;
  detail: string;
  status: number;
  code?: string;
  provider?: ProviderId;
} {
  const provider = inferProvider(message);
  const label = providerLabel(provider);

  if (
    /token refresh failed|invalid_grant|refresh token not found or invalid|credentials are not configured/i.test(
      message
    )
  ) {
    return {
      error: "Provider authentication failed",
      detail: `${label} authentication needs attention. Reconnect ${label} in Settings or switch to an API key, then try again.`,
      status: 401,
      code: "provider_auth_error",
      provider: provider ?? undefined,
    };
  }

  if (/no model is selected/i.test(message)) {
    return {
      error: "Model not configured",
      detail: message,
      status: 422,
      code: "model_config_error",
      provider: provider ?? undefined,
    };
  }

  return {
    error: "Email generation failed",
    detail: message,
    status: 500,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateDraftRequest;
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
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const company = getCompanyProfile();
    const enrichment = getEnrichment(leadId);
    const score = getScore(leadId);

    if (!enrichment || !score) {
      return NextResponse.json(
        { error: "Lead must be enriched and scored before generating an email." },
        { status: 422 }
      );
    }

    const senderName = getSetting("sender_name") || company?.name || "Team";
    const senderTitle = getSetting("sender_title") || "Business Development";
    const recipient = resolveRecipient(
      body,
      leadId,
      lead.name
    );

    if (!recipient.toEmail) {
      return NextResponse.json(
        {
          error: "No contact email available",
          detail:
            "Add or approve a lead contact with an email address before generating a draft.",
        },
        { status: 422 }
      );
    }

    const prompt = buildEmailPrompt(
      {
        name: company?.name || "Our Company",
        industry: company?.industries_served ? JSON.parse(company.industries_served)[0] || "" : "",
        services: company?.services ? JSON.parse(company.services) : [],
        description: company?.description || "",
      },
      enrichment as unknown as Record<string, unknown>,
      score.fit_score,
      score.recommended_angle || "",
      senderName,
      senderTitle
    );

    const { parsed: emailData, model } = await callLLM({
      ...prompt,
      schema: emailResultSchema,
      temperature: 0.7,
      maxTokens: 1200,
    });
    const subjectVariants = normalizeSubjectVariants(
      emailData.subject_variants,
      `${lead.name} outreach`
    );

    const email = createEmailDraft(leadId, {
      to_email: recipient.toEmail,
      to_name: recipient.toName,
      subject: subjectVariants[0],
      body_html: emailData.body_html,
      body_text: emailData.body_text,
      model_used: model,
    });

    return NextResponse.json({
      email_id: email.id,
      to_email: recipient.toEmail,
      to_name: recipient.toName,
      subject_variants: subjectVariants,
      body_html: emailData.body_html,
      body_text: emailData.body_text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/generate/[id]]", error);
    const payload = classifyGenerationError(message);
    return NextResponse.json(
      {
        error: payload.error,
        detail: payload.detail,
        code: payload.code,
        provider: payload.provider,
      },
      { status: payload.status }
    );
  }
}
