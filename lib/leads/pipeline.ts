import type { AgentRunTracker } from "@/lib/agent/monitor";
import { getCompanyProfile, type Company } from "@/lib/db/queries/companies";
import {
  upsertEnrichment,
  type Enrichment,
} from "@/lib/db/queries/enrichments";
import type { Lead } from "@/lib/db/queries/leads";
import { deleteScore, upsertScore, type Score } from "@/lib/db/queries/scores";
import { getSetting } from "@/lib/db/queries/settings";
import { callLLM } from "@/lib/llm/client";
import { buildEnrichmentPrompt } from "@/lib/llm/prompts/enrich";
import {
  buildScoringPrompt,
  type CompanyProfile,
} from "@/lib/llm/prompts/score";
import {
  enrichmentResultSchema,
  scoringResultSchema,
} from "@/lib/llm/schemas";
import { crawlWebsite } from "@/lib/playwright/crawler";
import {
  scrapePublicFirmographics,
  type FirmographicEvidence,
} from "@/lib/playwright/firmographics";

type AnalysisStatus = "enriched" | "scored";

export interface LeadAnalysisResult {
  enrichment: Enrichment;
  score: Score | null;
  status: AnalysisStatus;
  scoreError: string | null;
}

interface LeadSourceMaterial {
  rawContent: string;
  screenshots: string[];
}

interface StoredFirmographicEvidence {
  employee_count: FirmographicEvidence | null;
  annual_revenue: FirmographicEvidence | null;
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Ignore invalid JSON and fall back to an empty array.
  }

  return [];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

function parseExplicitEmployeeCount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!/^\d[\d,]*$/.test(normalized)) {
    return null;
  }

  const parsed = parseInt(normalized.replaceAll(",", ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readIntegerSetting(key: string, fallback: number): number {
  const parsed = parseInt(getSetting(key) || String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fitTierFromScore(score: number): "hot" | "warm" | "cold" {
  const hotThreshold = readIntegerSetting("hot_score_threshold", 70);
  const warmThreshold = readIntegerSetting("warm_score_threshold", 40);

  if (score >= hotThreshold) {
    return "hot";
  }

  if (score >= warmThreshold) {
    return "warm";
  }

  return "cold";
}

function normalizeCompanyProfile(company: Company): CompanyProfile {
  return {
    name: company.name,
    industry: parseJsonStringArray(company.industries_served)[0] || "",
    services: parseJsonStringArray(company.services),
    description: company.description || "",
  };
}

function buildFallbackContent(lead: Lead): string {
  return [
    `Company: ${lead.name}`,
    `Address: ${lead.address || "N/A"}`,
    `City: ${lead.city || "N/A"}`,
    `Province: ${lead.province || "N/A"}`,
    `Phone: ${lead.phone || "N/A"}`,
    `Website: ${lead.website || "N/A"}`,
    `Categories: ${lead.categories || "N/A"}`,
    `Rating: ${lead.google_rating || "N/A"}`,
    `Reviews: ${lead.google_review_count || "N/A"}`,
  ].join("\n");
}

async function getLeadSourceMaterial(
  lead: Lead,
  runTracker?: AgentRunTracker | null
): Promise<LeadSourceMaterial> {
  if (!lead.website) {
    runTracker?.warning("Lead has no website to crawl", {
      stage: "crawl",
      detail: "Using saved Google business fields instead.",
    });
    return {
      rawContent: buildFallbackContent(lead),
      screenshots: [],
    };
  }

  const maxPages = Math.max(1, readIntegerSetting("max_crawl_pages", 4));
  const screenshotsDir = getSetting("screenshots_dir") || "./data/screenshots";
  runTracker?.setSummary("Crawling website");
  runTracker?.progress("Starting Playwright crawl", {
    stage: "crawl",
    detail: `Up to ${maxPages} pages from ${lead.website}`,
    url: lead.website,
  });
  const crawlResult = await crawlWebsite(lead.website, {
    maxPages,
    screenshotDir: screenshotsDir,
    captureScreenshots: true,
    onVisit: async (page) => {
      runTracker?.progress("Visited website page", {
        stage: "crawl",
        detail: page.title || page.url,
        url: page.url,
      });
    },
  });
  runTracker?.success("Website crawl finished", {
    stage: "crawl",
    detail: `${crawlResult.pages.length} pages collected`,
    url: lead.website,
  });

  return {
    rawContent: crawlResult.allContent,
    screenshots: crawlResult.screenshots,
  };
}

export function resolveLeadStatusAfterAnalysis(
  currentStatus: string,
  analysisStatus: AnalysisStatus
): string {
  const rank: Record<string, number> = {
    discovered: 0,
    enriched: 1,
    scored: 2,
    contacted: 3,
    replied: 4,
    handed_off: 5,
    disqualified: 99,
  };

  const currentRank = rank[currentStatus];
  const analysisRank = rank[analysisStatus];

  if (
    typeof currentRank === "number" &&
    typeof analysisRank === "number" &&
    currentRank > analysisRank
  ) {
    return currentStatus;
  }

  return analysisStatus;
}

export async function enrichLead(
  lead: Lead,
  runTracker?: AgentRunTracker | null
): Promise<Enrichment> {
  const { rawContent, screenshots } = await getLeadSourceMaterial(
    lead,
    runTracker
  );

  if (!rawContent.trim()) {
    throw new Error(
      lead.website
        ? `Website crawl returned no readable content for ${lead.website}`
        : `No source content available for lead ${lead.id}`
    );
  }

  runTracker?.setSummary("Running enrichment model");
  runTracker?.progress("Sending content to the LLM", {
    stage: "enrichment",
    detail: `${Math.min(rawContent.length, 50000).toLocaleString()} characters of source material`,
  });
  const prompt = buildEnrichmentPrompt(lead.name, lead.website || "", rawContent);
  const { parsed: enrichmentData, model } = await callLLM({
    ...prompt,
    schema: enrichmentResultSchema,
    temperature: 0.3,
    maxTokens: 1400,
  });
  runTracker?.success("Enrichment completed", {
    stage: "enrichment",
    detail: `Model ${model}`,
  });

  runTracker?.setSummary("Checking firmographics");
  runTracker?.progress("Looking for public firmographic signals", {
    stage: "firmographics",
    detail: "Revenue and employee count sources",
  });
  const firmographics = await scrapePublicFirmographics(
    lead,
    async (event) => {
      runTracker?.log({
        status:
          event.stage === "evidence"
            ? "success"
            : event.stage === "visit"
              ? "progress"
              : "info",
        stage: "firmographics",
        message: event.message,
        detail: event.detail ?? null,
        url: event.url ?? null,
      });
    }
  ).catch((error) => {
    console.error(`[Firmographics] Failed for lead ${lead.id}:`, error);
    runTracker?.warning("Firmographic scrape failed", {
      stage: "firmographics",
      detail: toErrorMessage(error),
    });
    return {
      employee_count: null,
      annual_revenue: null,
    } satisfies StoredFirmographicEvidence;
  });

  const employeeCountValue = firmographics.employee_count?.value ?? null;
  const employeeCountSource =
    firmographics.employee_count?.source_name ??
    null;

  const enrichment = upsertEnrichment(lead.id, {
    website_summary: enrichmentData.website_summary,
    industry: enrichmentData.industry,
    company_size: enrichmentData.company_size,
    employee_count_estimate: parseExplicitEmployeeCount(employeeCountValue),
    employee_count_source: employeeCountSource,
    employee_count: employeeCountValue,
    annual_revenue: firmographics.annual_revenue?.value ?? null,
    firmographics_evidence: JSON.stringify(firmographics),
    services_needed: JSON.stringify(enrichmentData.services_needed || []),
    decision_maker_signals: enrichmentData.decision_maker_signals,
    pain_points: enrichmentData.pain_points,
    tech_stack: JSON.stringify(enrichmentData.tech_stack || []),
    social_links: JSON.stringify(enrichmentData.social_links || {}),
    potential_contacts: JSON.stringify(enrichmentData.potential_contacts || []),
    screenshots: JSON.stringify(screenshots),
    raw_content: rawContent.slice(0, 50000),
    enriched_at: new Date().toISOString(),
    model_used: model,
  });

  runTracker?.success("Saved enrichment", {
    stage: "enrichment",
    detail: screenshots.length
      ? `${screenshots.length} screenshots attached`
      : "No screenshots captured",
  });

  return enrichment;
}

export async function scoreLead(
  leadId: number,
  enrichment: Enrichment,
  companyOverride?: Company | null,
  runTracker?: AgentRunTracker | null
): Promise<Score> {
  const company = companyOverride ?? getCompanyProfile();

  if (!company) {
    throw new Error(
      "Company profile is required before scoring. Run /api/profile first."
    );
  }

  const prompt = buildScoringPrompt(
    normalizeCompanyProfile(company),
    enrichment as unknown as Record<string, unknown>
  );

  runTracker?.setSummary("Scoring lead fit");
  runTracker?.progress("Sending enrichment to scoring model", {
    stage: "score",
    detail: company.name
      ? `Using company profile for ${company.name}`
      : "Using saved company profile",
  });
  const { parsed: scoreData, model } = await callLLM({
    ...prompt,
    schema: scoringResultSchema,
    temperature: 0.2,
    maxTokens: 900,
  });

  const fitScore = Math.max(0, Math.min(100, Math.round(scoreData.fit_score)));

  const score = upsertScore(leadId, {
    fit_score: fitScore,
    fit_tier: fitTierFromScore(fitScore),
    reasoning: scoreData.reasoning,
    strengths: JSON.stringify(scoreData.strengths || []),
    risks: JSON.stringify(scoreData.risks || []),
    recommended_angle: scoreData.recommended_angle,
    scored_at: new Date().toISOString(),
    model_used: model,
  });

  runTracker?.success("Lead scored", {
    stage: "score",
    detail: `${fitScore}/100 with ${model}`,
  });

  return score;
}

export async function enrichAndScoreLead(
  lead: Lead,
  runTracker?: AgentRunTracker | null
): Promise<LeadAnalysisResult> {
  const enrichment = await enrichLead(lead, runTracker);

  // Any existing score is stale once the enrichment payload changes.
  deleteScore(lead.id);
  runTracker?.info("Cleared stale score after enrichment", {
    stage: "score",
  });

  const company = getCompanyProfile();
  if (!company) {
    runTracker?.warning("Skipping scoring because company profile is missing", {
      stage: "score",
      detail: "Save your business profile in Settings to enable scoring.",
    });
    return {
      enrichment,
      score: null,
      status: "enriched",
      scoreError: null,
    };
  }

  try {
    const score = await scoreLead(lead.id, enrichment, company, runTracker);
    return {
      enrichment,
      score,
      status: "scored",
      scoreError: null,
    };
  } catch (error) {
    runTracker?.warning("Scoring step failed after enrichment", {
      stage: "score",
      detail: toErrorMessage(error),
    });
    return {
      enrichment,
      score: null,
      status: "enriched",
      scoreError: toErrorMessage(error),
    };
  }
}
