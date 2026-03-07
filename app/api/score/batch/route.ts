import { NextResponse } from "next/server";
import { getLeadsByStatus, updateLeadStatus } from "@/lib/db/queries/leads";
import { getEnrichment } from "@/lib/db/queries/enrichments";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import { upsertScore } from "@/lib/db/queries/scores";
import { getSetting } from "@/lib/db/queries/settings";
import { callLLM } from "@/lib/llm/client";
import { buildScoringPrompt } from "@/lib/llm/prompts/score";
import type { ScoringResult } from "@/lib/llm/types";

export async function POST() {
  try {
    const company = getCompanyProfile();

    if (!company) {
      return NextResponse.json(
        { error: "Company profile is required before scoring." },
        { status: 422 }
      );
    }

    const leads = getLeadsByStatus("enriched");
    leads.sort((a, b) => (b.google_rating || 0) - (a.google_rating || 0));

    const hotThreshold = parseInt(getSetting("hot_score_threshold") || "70", 10);
    const warmThreshold = parseInt(getSetting("warm_score_threshold") || "40", 10);

    let processed = 0;
    let failed = 0;
    const total = leads.length;

    for (const lead of leads) {
      try {
        const enrichment = getEnrichment(lead.id);
        if (!enrichment) {
          failed++;
          continue;
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

        const { parsed: scoreData, model } = await callLLM<ScoringResult>({
          ...prompt,
          temperature: 0.2,
          maxTokens: 800,
        });

        let fitTier: "hot" | "warm" | "cold";
        if (scoreData.fit_score >= hotThreshold) {
          fitTier = "hot";
        } else if (scoreData.fit_score >= warmThreshold) {
          fitTier = "warm";
        } else {
          fitTier = "cold";
        }

        upsertScore(lead.id, {
          fit_score: scoreData.fit_score,
          fit_tier: fitTier,
          reasoning: scoreData.reasoning,
          strengths: JSON.stringify(scoreData.strengths || []),
          risks: JSON.stringify(scoreData.risks || []),
          recommended_angle: scoreData.recommended_angle,
          scored_at: new Date().toISOString(),
          model_used: model,
        });

        updateLeadStatus(lead.id, "scored");
        processed++;
      } catch (err) {
        console.error(`[Batch Score] Failed for lead ${lead.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ processed, failed, total });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/score/batch]", error);
    return NextResponse.json(
      { error: "Batch scoring failed", detail: message },
      { status: 500 }
    );
  }
}
