import type { AgentRunTracker } from "@/lib/agent/monitor";
import type { Lead } from "@/lib/db/queries/leads";
import { callLLM } from "@/lib/llm/client";
import { buildContactResearchPrompt } from "@/lib/llm/prompts/contacts";
import { contactResearchResultSchema } from "@/lib/llm/schemas";
import { crawlWebsite } from "@/lib/playwright/crawler";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  domain: string;
  search_url: string;
}

interface ContactResearchDocument {
  title: string;
  url: string;
  source: string;
  content: string;
}

export interface ResearchedLeadContact {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  facility_name: string | null;
  source_label: string | null;
  source_url: string | null;
  notes: string | null;
  confidence: number | null;
}

const SEARCH_RESULT_LIMIT = 10;
const PAGE_VISIT_LIMIT = 6;
const WEBSITE_DOC_LIMIT = 8;
const SOURCE_DOC_LIMIT = 12;
const DOCUMENT_CHAR_LIMIT = 2800;
const ROLE_TERMS = [
  "plant manager",
  "operations manager",
  "maintenance manager",
  "procurement manager",
  "purchasing manager",
  "site manager",
  "reliability manager",
  "engineering manager",
  "production manager",
  "facility manager",
  "mill manager",
  "terminal manager",
  "ehs manager",
  "safety manager",
];

const DOMAIN_PRIORITY: Record<string, number> = {
  "linkedin.com": 80,
  "company.site": 75,
  "facebook.com": 20,
  "rocketreach.co": 35,
  "zoominfo.com": 30,
  "localnews.com": 25,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function decodeYahooRedirect(value: string): string {
  try {
    const match = value.match(/\/RU=([^/]+)\/RK=/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Ignore malformed redirect values.
  }

  return value;
}

function getLocationLabel(lead: Lead): string {
  return [lead.city, lead.province]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(", ");
}

function buildRoleQuery(): string {
  return `(${ROLE_TERMS.map((term) => `"${term}"`).join(" OR ")})`;
}

function buildSearchQueries(lead: Lead): string[] {
  const location = getLocationLabel(lead);
  const host = lead.website ? normalizeHost(lead.website) : "";
  const roleQuery = buildRoleQuery();

  return Array.from(
    new Set(
      [
        `"${lead.name}" ${location} ${roleQuery}`,
        `"${lead.name}" ${location} ("plant" OR "facility" OR "mill" OR "site" OR "terminal") ${roleQuery}`,
        host
          ? `site:${host} ${location} ("plant" OR "facility" OR "locations" OR "team" OR "leadership" OR "operations")`
          : "",
        `"${lead.name}" ${location} ("purchasing" OR "procurement" OR "maintenance" OR "operations")`,
        `"${lead.name}" ${location} site:linkedin.com/in ${roleQuery}`,
      ].filter(Boolean)
    )
  );
}

function domainPriority(domain: string, lead: Lead): number {
  const host = lead.website ? normalizeHost(lead.website) : "";
  if (host && (domain === host || domain.endsWith(`.${host}`))) {
    return DOMAIN_PRIORITY["company.site"] ?? 75;
  }

  if (domain.includes("linkedin.com")) {
    return DOMAIN_PRIORITY["linkedin.com"] ?? 80;
  }

  if (domain.includes("rocketreach.co")) {
    return DOMAIN_PRIORITY["rocketreach.co"] ?? 35;
  }

  if (domain.includes("zoominfo.com")) {
    return DOMAIN_PRIORITY["zoominfo.com"] ?? 30;
  }

  return 10;
}

function scoreResult(result: SearchResult, lead: Lead): number {
  const haystack = normalizeText(
    `${result.title} ${result.snippet} ${result.url}`
  ).toLowerCase();
  const companyName = normalizeText(lead.name).toLowerCase();
  const location = getLocationLabel(lead).toLowerCase();
  let score = domainPriority(result.domain, lead) - result.rank * 2;

  if (companyName && haystack.includes(companyName)) {
    score += 25;
  }

  if (location && haystack.includes(location)) {
    score += 20;
  }

  if (ROLE_TERMS.some((term) => haystack.includes(term))) {
    score += 25;
  }

  if (/(plant|facility|site|mill|terminal|operations)/i.test(haystack)) {
    score += 15;
  }

  return score;
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const result of results) {
    const resolvedUrl = decodeYahooRedirect(result.url);
    if (!resolvedUrl || seen.has(resolvedUrl)) {
      continue;
    }

    seen.add(resolvedUrl);
    deduped.push({
      ...result,
      url: resolvedUrl,
    });
  }

  return deduped;
}

function dedupeDocuments(documents: ContactResearchDocument[]): ContactResearchDocument[] {
  const seen = new Set<string>();
  const result: ContactResearchDocument[] = [];

  for (const document of documents) {
    const key = `${document.url}::${document.content.slice(0, 120)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(document);
  }

  return result;
}

async function extractYahooResults(
  page: import("playwright").Page,
  searchUrl: string
): Promise<SearchResult[]> {
  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(900);

  const blockedText = normalizeText(
    await page.evaluate(() => document.body?.innerText || "")
  ).toLowerCase();
  if (blockedText.includes("we have detected unusual traffic")) {
    return [];
  }

  return page.evaluate(
    ({ url, resultLimit }: { url: string; resultLimit: number }) => {
      const normalize = (value: string): string =>
        value.replace(/\s+/g, " ").trim();

      const nodes = Array.from(document.querySelectorAll("div.algo"));
      return nodes
        .map((node: Element, index: number) => {
          const link = node.querySelector("a[href]") as HTMLAnchorElement | null;
          const title = normalize(node.querySelector("h3")?.textContent || "");
          const snippet = normalize(node.querySelector("p")?.textContent || "");
          const href = link?.href || "";

          try {
            const parsed = new URL(href);
            return {
              title,
              url: href,
              snippet,
              rank: index,
              domain: parsed.hostname.replace(/^www\./, ""),
              search_url: url,
            };
          } catch {
            return null;
          }
        })
        .filter((result: SearchResult | null): result is SearchResult => {
          if (!result) {
            return false;
          }

          return (
            result.title.length > 0 &&
            result.url.length > 0 &&
            result.rank < resultLimit
          );
        });
    },
    { url: searchUrl, resultLimit: SEARCH_RESULT_LIMIT }
  );
}

async function extractPageText(
  page: import("playwright").Page,
  url: string
): Promise<string> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(900);

  const title = await page.title();
  const body = await page.evaluate(() => document.body?.innerText || "");
  const text = normalizeText(`${title}\n${body}`);

  if (
    /access to this page has been denied|forbidden|captcha|verify you are human|sorry/i.test(
      text
    )
  ) {
    return "";
  }

  return text.slice(0, 20000);
}

function toDocument(
  title: string,
  url: string,
  source: string,
  content: string
): ContactResearchDocument | null {
  const normalized = normalizeText(content).slice(0, DOCUMENT_CHAR_LIMIT);
  if (normalized.length < 80) {
    return null;
  }

  return {
    title: normalizeText(title) || url,
    url,
    source,
    content: normalized,
  };
}

function getSourceLabel(url: string, domain: string, lead: Lead): string {
  const host = lead.website ? normalizeHost(lead.website) : "";
  if (host && (domain === host || domain.endsWith(`.${host}`))) {
    return "Company site";
  }

  if (domain.includes("linkedin.com")) {
    return "LinkedIn";
  }

  if (domain.includes("rocketreach.co")) {
    return "RocketReach";
  }

  if (domain.includes("zoominfo.com")) {
    return "ZoomInfo";
  }

  return domain.replace(/^www\./, "");
}

function normalizeCandidate(
  candidate: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    facility_name?: string;
    source_label?: string;
    source_url?: string;
    notes?: string;
    confidence?: number | null;
  }
): ResearchedLeadContact | null {
  const name = candidate.name?.trim() || null;
  const title = candidate.title?.trim() || null;
  const email = candidate.email?.trim() || null;
  const phone = candidate.phone?.trim() || null;
  const linkedinUrl = candidate.linkedin_url?.trim() || null;
  const facilityName = candidate.facility_name?.trim() || null;
  const sourceLabel = candidate.source_label?.trim() || null;
  const sourceUrl = candidate.source_url?.trim() || null;
  const notes = candidate.notes?.trim() || null;

  if (!name && !title && !email && !phone && !linkedinUrl) {
    return null;
  }

  return {
    name,
    title,
    email,
    phone,
    linkedin_url: linkedinUrl,
    facility_name: facilityName,
    source_label: sourceLabel,
    source_url: sourceUrl,
    notes,
    confidence:
      typeof candidate.confidence === "number" &&
      Number.isFinite(candidate.confidence)
        ? Math.max(0, Math.min(1, candidate.confidence))
        : null,
  };
}

function dedupeCandidates(
  candidates: ResearchedLeadContact[]
): ResearchedLeadContact[] {
  const seen = new Set<string>();
  const result: ResearchedLeadContact[] = [];

  for (const candidate of candidates) {
    const key =
      candidate.email?.toLowerCase() ||
      candidate.linkedin_url?.toLowerCase() ||
      [candidate.name, candidate.title, candidate.facility_name]
        .map((value) => (value || "").toLowerCase())
        .join("::");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export async function deepFindLeadContacts(
  lead: Lead,
  runTracker?: AgentRunTracker | null
): Promise<ResearchedLeadContact[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright");

  const documents: ContactResearchDocument[] = [];
  const location = getLocationLabel(lead);

  if (lead.website) {
    runTracker?.setSummary("Crawling the company site for local contact clues");
    runTracker?.progress("Crawling company website", {
      stage: "crawl",
      detail: lead.website,
      url: lead.website,
    });

    try {
      const websiteCrawl = await crawlWebsite(lead.website, {
        maxPages: 10,
        captureScreenshots: false,
      });

      for (const page of websiteCrawl.pages.slice(0, WEBSITE_DOC_LIMIT)) {
        const document = toDocument(
          page.title || page.url,
          page.url,
          "Company site",
          page.content
        );
        if (!document) {
          continue;
        }

        documents.push(document);
      }

      runTracker?.success("Collected company-site contact evidence", {
        stage: "crawl",
        detail: `${Math.min(websiteCrawl.pages.length, WEBSITE_DOC_LIMIT)} pages added`,
      });
    } catch (error) {
      runTracker?.warning("Company-site crawl for contacts failed", {
        stage: "crawl",
        detail: error instanceof Error ? error.message : "Unknown crawl failure",
        url: lead.website,
      });
    }
  }

  let browser: import("playwright").Browser | null = null;

  try {
    const launchedBrowser = await chromium.launch({ headless: true });
    browser = launchedBrowser;
    const context = await launchedBrowser.newContext({
      viewport: { width: 1440, height: 960 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    });
    const searchPage = await context.newPage();
    const detailPage = await context.newPage();

    const allResults: SearchResult[] = [];
    for (const query of buildSearchQueries(lead)) {
      runTracker?.progress("Searching the public web for local contacts", {
        stage: "search",
        detail: query,
      });
      const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(
        query
      )}`;
      const results = await extractYahooResults(searchPage, searchUrl);
      allResults.push(...results);
    }

    const candidates = dedupeResults(allResults)
      .sort((left, right) => scoreResult(right, lead) - scoreResult(left, lead))
      .slice(0, SEARCH_RESULT_LIMIT);

    for (const candidate of candidates) {
      const snippetDoc = toDocument(
        candidate.title || candidate.url,
        candidate.url,
        getSourceLabel(candidate.url, candidate.domain, lead),
        candidate.snippet
      );
      if (snippetDoc) {
        documents.push(snippetDoc);
      }
    }

    for (const candidate of candidates.slice(0, PAGE_VISIT_LIMIT)) {
      try {
        runTracker?.progress("Opening public source for contact evidence", {
          stage: "search",
          detail: candidate.title,
          url: candidate.url,
        });
        const pageText = await extractPageText(detailPage, candidate.url);
        const pageDoc = toDocument(
          candidate.title || candidate.url,
          candidate.url,
          getSourceLabel(candidate.url, candidate.domain, lead),
          pageText
        );
        if (pageDoc) {
          documents.push(pageDoc);
        }
      } catch {
        continue;
      }
    }

    await detailPage.close();
    await searchPage.close();
    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const sourceDocuments = dedupeDocuments(documents).slice(0, SOURCE_DOC_LIMIT);
  if (sourceDocuments.length === 0) {
    runTracker?.warning("No contact evidence sources were collected", {
      stage: "search",
      detail: location || lead.website || lead.name,
    });
    return [];
  }

  runTracker?.setSummary("Extracting local facility contacts from evidence");
  runTracker?.progress("Sending evidence to contact research model", {
    stage: "research",
    detail: `${sourceDocuments.length} sources for ${lead.name}`,
  });

  const prompt = buildContactResearchPrompt({
    leadName: lead.name,
    website: lead.website,
    location,
    documents: sourceDocuments,
  });
  const { parsed, model } = await callLLM({
    ...prompt,
    schema: contactResearchResultSchema,
    temperature: 0.2,
    maxTokens: 1800,
  });

  const contacts = dedupeCandidates(
    parsed.contacts.map(normalizeCandidate).filter(Boolean) as ResearchedLeadContact[]
  );

  runTracker?.success("Contact research complete", {
    stage: "research",
    detail: `${contacts.length} candidates from ${sourceDocuments.length} sources using ${model}`,
  });

  return contacts;
}
