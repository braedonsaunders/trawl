import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { getScore } from "@/lib/db/queries/scores";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { createEmailDraft } from "@/lib/db/queries/emails";
import { callLLM } from "@/lib/llm/client";
import { emailResultSchema } from "@/lib/llm/schemas";
import { buildEmailPrompt } from "@/lib/llm/prompts/email";
import { getSetting } from "@/lib/db/queries/settings";

export async function POST(
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

    const email = createEmailDraft(leadId, {
      subject: emailData.subject_variants[0],
      body_html: emailData.body_html,
      body_text: emailData.body_text,
      model_used: model,
    });

    return NextResponse.json({
      email_id: email.id,
      subject_variants: emailData.subject_variants,
      body_html: emailData.body_html,
      body_text: emailData.body_text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/generate/[id]]", error);
    return NextResponse.json(
      { error: "Email generation failed", detail: message },
      { status: 500 }
    );
  }
}
