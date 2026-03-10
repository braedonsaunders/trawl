import { NextRequest, NextResponse } from "next/server";
import { crawlWebsite } from "@/lib/playwright/crawler";
import { callLLM } from "@/lib/llm/client";
import { companyProfileResultSchema } from "@/lib/llm/schemas";
import { buildCompanyProfilePrompt } from "@/lib/llm/prompts/profile";
import { upsertCompanyProfile } from "@/lib/db/queries/companies";
import { getSetting } from "@/lib/db/queries/settings";

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

    const maxPages = Math.max(
      1,
      parseInt(getSetting("max_crawl_pages") || "8", 10) || 8
    );
    const screenshotsDir =
      getSetting("screenshots_dir") || "./data/screenshots";
    const crawlResult = await crawlWebsite(website, {
      maxPages,
      screenshotDir: screenshotsDir,
      captureScreenshots: true,
    });

    if (!crawlResult.allContent.trim()) {
      throw new Error(
        `Website crawl returned no readable content for ${website}`
      );
    }

    const prompt = buildCompanyProfilePrompt(website, crawlResult.allContent);

    const { parsed: profileData, model } = await callLLM({
      ...prompt,
      schema: companyProfileResultSchema,
      temperature: 0.2,
      maxTokens: 1400,
    });

    const fallbackName = new URL(website).hostname.replace(/^www\./i, "");
    const company = upsertCompanyProfile({
      name: profileData.company_name.trim() || fallbackName,
      website,
      description: profileData.description,
      services: JSON.stringify(profileData.services_offered || []),
      industries_served: JSON.stringify(
        profileData.industry.trim() ? [profileData.industry] : []
      ),
      geographies: JSON.stringify(profileData.geographies_served || []),
      differentiators: JSON.stringify(profileData.differentiators || []),
      ideal_customer_summary: profileData.ideal_customer_summary.trim() || null,
      buyer_search_queries: JSON.stringify(profileData.buyer_search_queries || []),
      buyer_target_signals: JSON.stringify(profileData.target_signals || []),
      buyer_exclusion_signals: JSON.stringify(
        profileData.exclusion_signals || []
      ),
      screenshots: JSON.stringify(crawlResult.screenshots || []),
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
