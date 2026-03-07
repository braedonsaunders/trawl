import { NextRequest, NextResponse } from "next/server";
import { crawlWebsite } from "@/lib/playwright/crawler";
import { callLLM } from "@/lib/llm/client";
import { buildEnrichmentPrompt } from "@/lib/llm/prompts/enrich";
import { upsertCompanyProfile } from "@/lib/db/queries/companies";
import type { EnrichmentResult } from "@/lib/llm/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { website } = body;

    if (!website) {
      return NextResponse.json(
        { error: "Missing required field: website" },
        { status: 400 }
      );
    }

    const crawlResult = await crawlWebsite(website, 8);

    const prompt = buildEnrichmentPrompt(
      "Your Company",
      website,
      crawlResult.allContent
    );

    const { parsed: profileData, model } = await callLLM<EnrichmentResult>({
      ...prompt,
      temperature: 0.3,
      maxTokens: 1000,
    });

    const company = upsertCompanyProfile({
      name: profileData.website_summary?.split(".")[0] || "My Company",
      website,
      description: profileData.website_summary,
      services: JSON.stringify(profileData.services_needed || []),
      industries_served: JSON.stringify([profileData.industry]),
      differentiators: JSON.stringify([]),
      raw_content: crawlResult.allContent.slice(0, 50000),
      last_profiled_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ...company,
      model_used: model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/profile]", error);
    return NextResponse.json(
      { error: "Profile extraction failed", detail: message },
      { status: 500 }
    );
  }
}
