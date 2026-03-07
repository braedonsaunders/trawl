import { NextRequest, NextResponse } from "next/server";
import { getLeadById, updateLeadStatus } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { upsertScore } from "@/lib/db/queries/scores";
import { getSetting } from "@/lib/db/queries/settings";
import { callLLM } from "@/lib/llm/client";
import { scoringResultSchema } from "@/lib/llm/schemas";
import { buildScoringPrompt } from "@/lib/llm/prompts/score";

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
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    const company = getCompanyProfile();

    if (!company) {
      return NextResponse.json(
        { error: "Company profile is required before scoring. Run /api/profile first." },
        { status: 422 }
      );
    }

    const enrichment = getEnrichment(leadId);

    if (!enrichment) {
      return NextResponse.json(
        { error: "Lead enrichment is required before scoring. Run /api/enrich first." },
        { status: 422 }
      );
    }

    const prompt = buildScoringPrompt(
      {
        name: company.name,
        industry: company.industries_served ? JSON.parse(company.industries_served)[0] || "" : "",
        services: company.services ? JSON.parse(company.services) : [],
        description: company.description || "",
      },
      enrichment as unknown as Record<string, unknown>
    );

    const { parsed: scoreData, model } = await callLLM({
      ...prompt,
      schema: scoringResultSchema,
      temperature: 0.2,
      maxTokens: 800,
    });

    const hotThreshold = parseInt(getSetting("hot_score_threshold") || "70", 10);
    const warmThreshold = parseInt(getSetting("warm_score_threshold") || "40", 10);

    let fitTier: "hot" | "warm" | "cold";
    if (scoreData.fit_score >= hotThreshold) {
      fitTier = "hot";
    } else if (scoreData.fit_score >= warmThreshold) {
      fitTier = "warm";
    } else {
      fitTier = "cold";
    }

    const score = upsertScore(leadId, {
      fit_score: scoreData.fit_score,
      fit_tier: fitTier,
      reasoning: scoreData.reasoning,
      strengths: JSON.stringify(scoreData.strengths || []),
      risks: JSON.stringify(scoreData.risks || []),
      recommended_angle: scoreData.recommended_angle,
      scored_at: new Date().toISOString(),
      model_used: model,
    });

    updateLeadStatus(leadId, "scored");

    return NextResponse.json({ lead_id: leadId, score });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/score/[id]]", error);
    return NextResponse.json(
      { error: "Scoring failed", detail: message },
      { status: 500 }
    );
  }
}
