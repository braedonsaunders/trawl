import type { Lead } from "@/lib/db/queries/leads";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  domain: string;
  search_url: string;
}

export interface FirmographicEvidence {
  value: string;
  source_name: string;
  source_url: string;
  evidence_url: string;
  excerpt: string;
}

export interface PublicFirmographics {
  employee_count: FirmographicEvidence | null;
  annual_revenue: FirmographicEvidence | null;
}

export interface FirmographicScrapeEvent {
  stage: "search" | "candidate" | "visit" | "evidence";
  message: string;
  detail?: string | null;
  url?: string | null;
}

const DOMAIN_PRIORITY: Record<string, number> = {
  "zoominfo.com": 100,
  "rocketreach.co": 90,
  "owler.com": 80,
  "growjo.com": 75,
  "apollo.io": 70,
  "salesintel.io": 70,
  "craft.co": 65,
  "crunchbase.com": 60,
};

const SEARCH_RESULT_LIMIT = 8;
const PAGE_VISIT_LIMIT = 4;

function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeYahooRedirect(value: string): string {
  try {
    const match = value.match(/\/RU=([^/]+)\/RK=/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Fall through to the original value.
  }

  return value;
}

function getSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname === "zoominfo.com") return "ZoomInfo";
    if (hostname === "rocketreach.co") return "RocketReach";
    if (hostname === "owler.com") return "Owler";
    if (hostname === "growjo.com") return "Growjo";
    if (hostname === "apollo.io") return "Apollo";
    if (hostname === "salesintel.io") return "SalesIntel";
    if (hostname === "craft.co") return "Craft";
    if (hostname === "crunchbase.com") return "Crunchbase";
    return hostname;
  } catch {
    return "Public Web";
  }
}

function buildSearchQueries(lead: Lead): string[] {
  const name = lead.name.trim();
  const host = lead.website ? normalizeHost(lead.website) : "";
  const location = [lead.city, lead.province]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");

  return Array.from(
    new Set(
      [
        host ? `"${name}" "${host}" revenue employees` : `"${name}" revenue employees`,
        host ? `site:zoominfo.com/c/ "${name}" "${host}"` : `site:zoominfo.com/c/ "${name}"`,
        host ? `"${name}" "${host}" annual revenue headcount` : `"${name}" annual revenue headcount`,
        location ? `"${name}" ${location} revenue employees` : "",
      ].filter(Boolean)
    )
  );
}

function scoreResult(result: SearchResult, lead: Lead): number {
  const haystack = normalizeText(
    `${result.title} ${result.snippet} ${result.url}`
  ).toLowerCase();
  const host = lead.website ? normalizeHost(lead.website) : "";
  const companyName = normalizeText(lead.name).toLowerCase();
  const domainScore = DOMAIN_PRIORITY[result.domain] ?? 0;

  let score = domainScore - result.rank * 2;

  if (host && haystack.includes(host)) {
    score += 60;
  }

  if (companyName && haystack.includes(companyName)) {
    score += 40;
  }

  return score;
}

function buildExcerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 160);
  return normalizeText(text.slice(start, end));
}

function looksEstimated(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 40);
  const context = text.slice(windowStart, matchIndex).toLowerCase();
  return /\bestimated\b|\baround\b|\babout\b|\bapprox(?:imately)?\b|~/.test(
    context
  );
}

function extractEmployeeCountEvidence(
  text: string,
  candidate: SearchResult
): FirmographicEvidence | null {
  const normalized = normalizeText(text);
  const patterns = [
    /\b(\d[\d,]*)\s+employees\b/i,
    /\bemployee count(?:\s*[:\-])?\s*(\d[\d,]*)\b/i,
    /\bheadcount(?:\s*[:\-])?\s*(\d[\d,]*)\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match || !match[1]) {
      continue;
    }

    if (looksEstimated(normalized, match.index)) {
      continue;
    }

    return {
      value: match[1],
      source_name: getSourceName(candidate.url),
      source_url: candidate.url,
      evidence_url: candidate.search_url === candidate.url ? candidate.url : candidate.search_url,
      excerpt: buildExcerpt(normalized, match.index, match[0].length),
    };
  }

  return null;
}

function extractRevenueEvidence(
  text: string,
  candidate: SearchResult
): FirmographicEvidence | null {
  const normalized = normalizeText(text);
  const patterns = [
    /\bannual revenue(?:\s*[:\-]|\s+of)?\s*(\$[0-9][0-9.,]*(?:\s?(?:[MBTK]|million|billion|thousand))?(?:\s*-\s*\$?[0-9][0-9.,]*(?:\s?(?:[MBTK]|million|billion|thousand))?)?)/i,
    /\brevenue(?:\s*[:\-]|\s+of)?\s*(\$[0-9][0-9.,]*(?:\s?(?:[MBTK]|million|billion|thousand))?(?:\s*-\s*\$?[0-9][0-9.,]*(?:\s?(?:[MBTK]|million|billion|thousand))?)?)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match || !match[1]) {
      continue;
    }

    if (looksEstimated(normalized, match.index)) {
      continue;
    }

    return {
      value: match[1],
      source_name: getSourceName(candidate.url),
      source_url: candidate.url,
      evidence_url: candidate.search_url === candidate.url ? candidate.url : candidate.search_url,
      excerpt: buildExcerpt(normalized, match.index, match[0].length),
    };
  }

  return null;
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

function updateEvidence(
  current: FirmographicEvidence | null,
  next: FirmographicEvidence | null
): FirmographicEvidence | null {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  const currentPriority = DOMAIN_PRIORITY[
    (() => {
      try {
        return new URL(current.source_url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })()
  ] ?? 0;
  const nextPriority = DOMAIN_PRIORITY[
    (() => {
      try {
        return new URL(next.source_url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })()
  ] ?? 0;

  return nextPriority > currentPriority ? next : current;
}

export async function scrapePublicFirmographics(
  lead: Lead,
  onEvent?: ((event: FirmographicScrapeEvent) => void | Promise<void>) | null
): Promise<PublicFirmographics> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright");

  let browser: import("playwright").Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser!.newContext({
      viewport: { width: 1440, height: 960 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    });

    const searchPage = await context.newPage();
    const detailPage = await context.newPage();

    let employeeCount: FirmographicEvidence | null = null;
    let annualRevenue: FirmographicEvidence | null = null;
    const allResults: SearchResult[] = [];

    for (const query of buildSearchQueries(lead)) {
      if (employeeCount && annualRevenue) {
        break;
      }

      await onEvent?.({
        stage: "search",
        message: "Searching public firmographic sources",
        detail: query,
      });
      const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(
        query
      )}`;
      const results = await extractYahooResults(searchPage, searchUrl);
      allResults.push(...results);
    }

    const candidates = dedupeResults(allResults)
      .filter((result) => DOMAIN_PRIORITY[result.domain] != null)
      .sort((left, right) => scoreResult(right, lead) - scoreResult(left, lead))
      .slice(0, SEARCH_RESULT_LIMIT);

    for (const candidate of candidates) {
      await onEvent?.({
        stage: "candidate",
        message: `Shortlisted ${getSourceName(candidate.url)} result`,
        detail: candidate.title || candidate.snippet,
        url: candidate.url,
      });

      if (!employeeCount) {
        const nextEmployeeCount = extractEmployeeCountEvidence(
          candidate.snippet,
          candidate
        );
        employeeCount = updateEvidence(
          employeeCount,
          nextEmployeeCount
        );
        if (nextEmployeeCount) {
          await onEvent?.({
            stage: "evidence",
            message: "Found employee count evidence",
            detail: `${nextEmployeeCount.value} from ${nextEmployeeCount.source_name}`,
            url: nextEmployeeCount.source_url,
          });
        }
      }

      if (!annualRevenue) {
        const nextAnnualRevenue = extractRevenueEvidence(
          candidate.snippet,
          candidate
        );
        annualRevenue = updateEvidence(
          annualRevenue,
          nextAnnualRevenue
        );
        if (nextAnnualRevenue) {
          await onEvent?.({
            stage: "evidence",
            message: "Found revenue evidence",
            detail: `${nextAnnualRevenue.value} from ${nextAnnualRevenue.source_name}`,
            url: nextAnnualRevenue.source_url,
          });
        }
      }
    }

    for (const candidate of candidates.slice(0, PAGE_VISIT_LIMIT)) {
      if (employeeCount && annualRevenue) {
        break;
      }

      try {
        await onEvent?.({
          stage: "visit",
          message: "Opening public source",
          detail: candidate.title,
          url: candidate.url,
        });
        const pageText = await extractPageText(detailPage, candidate.url);
        if (!pageText) {
          continue;
        }

        if (!employeeCount) {
          const nextEmployeeCount = extractEmployeeCountEvidence(pageText, {
            ...candidate,
            search_url: candidate.url,
          });
          employeeCount = updateEvidence(
            employeeCount,
            nextEmployeeCount
          );
          if (nextEmployeeCount) {
            await onEvent?.({
              stage: "evidence",
              message: "Verified employee count on source page",
              detail: `${nextEmployeeCount.value} from ${nextEmployeeCount.source_name}`,
              url: nextEmployeeCount.source_url,
            });
          }
        }

        if (!annualRevenue) {
          const nextAnnualRevenue = extractRevenueEvidence(pageText, {
            ...candidate,
            search_url: candidate.url,
          });
          annualRevenue = updateEvidence(
            annualRevenue,
            nextAnnualRevenue
          );
          if (nextAnnualRevenue) {
            await onEvent?.({
              stage: "evidence",
              message: "Verified revenue on source page",
              detail: `${nextAnnualRevenue.value} from ${nextAnnualRevenue.source_name}`,
              url: nextAnnualRevenue.source_url,
            });
          }
        }
      } catch {
        continue;
      }
    }

    await detailPage.close();
    await searchPage.close();
    await context.close();

    return {
      employee_count: employeeCount,
      annual_revenue: annualRevenue,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
