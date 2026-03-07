import { NextResponse } from "next/server";
import { getLeadsByStatus, updateLeadStatus } from "@/lib/db/queries/leads";
import { upsertEnrichment } from "@/lib/db/queries/enrichments";
import { crawlWebsite } from "@/lib/playwright/crawler";
import { callLLM } from "@/lib/llm/client";
import { enrichmentResultSchema } from "@/lib/llm/schemas";
import { buildEnrichmentPrompt } from "@/lib/llm/prompts/enrich";

export async function POST() {
  try {
    const leads = getLeadsByStatus("discovered");

    let processed = 0;
    let failed = 0;
    const total = leads.length;

    for (const lead of leads) {
      try {
        let rawContent = "";

        if (lead.website) {
          const crawlResult = await crawlWebsite(lead.website, 4);
          rawContent = crawlResult.allContent;
        } else {
          rawContent = `Company: ${lead.name}\nAddress: ${lead.address || "N/A"}\nCategories: ${lead.categories || "N/A"}\nRating: ${lead.google_rating || "N/A"}`;
        }

        const prompt = buildEnrichmentPrompt(
          lead.name,
          lead.website || "",
          rawContent
        );

        const { parsed: enrichmentData, model } = await callLLM({
          ...prompt,
          schema: enrichmentResultSchema,
          temperature: 0.3,
          maxTokens: 1000,
        });

        upsertEnrichment(lead.id, {
          website_summary: enrichmentData.website_summary,
          industry: enrichmentData.industry,
          company_size: enrichmentData.company_size,
          services_needed: JSON.stringify(enrichmentData.services_needed || []),
          decision_maker_signals: enrichmentData.decision_maker_signals,
          pain_points: enrichmentData.pain_points,
          tech_stack: JSON.stringify(enrichmentData.tech_stack || []),
          social_links: JSON.stringify(enrichmentData.social_links || {}),
          raw_content: rawContent.slice(0, 50000),
          enriched_at: new Date().toISOString(),
          model_used: model,
        });

        updateLeadStatus(lead.id, "enriched");
        processed++;
      } catch (err) {
        console.error(`[Batch Enrich] Failed for lead ${lead.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ processed, failed, total });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/enrich/batch]", error);
    return NextResponse.json(
      { error: "Batch enrichment failed", detail: message },
      { status: 500 }
    );
  }
}
