import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveWritablePath } from "@/lib/runtime/paths";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  screenshot: string | null;
}

export interface CrawlResult {
  pages: CrawledPage[];
  allContent: string;
  screenshots: string[];
}

export interface CrawlWebsiteOptions {
  maxPages?: number;
  screenshotDir?: string | null;
  captureScreenshots?: boolean;
  onVisit?: ((page: CrawledPage) => void | Promise<void>) | null;
}

const PRIORITY_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/services",
  "/what-we-do",
  "/industries",
  "/contact",
  "/contact-us",
  "/team",
  "/our-team",
  "/leadership",
  "/people",
  "/staff",
  "/careers",
  "/join-us",
  "/products",
  "/solutions",
];

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeUrl(url: string, preferredOrigin?: string): string {
  try {
    const parsed = new URL(url);
    if (preferredOrigin) {
      const preferred = new URL(preferredOrigin);
      if (stripWww(parsed.hostname) === stripWww(preferred.hostname)) {
        parsed.protocol = preferred.protocol;
        parsed.host = preferred.host;
      }
    }

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

function isInternalUrl(url: string, baseHostname: string): boolean {
  try {
    const parsed = new URL(url);
    if (stripWww(parsed.hostname) !== baseHostname) {
      return false;
    }

    const skipExtensions = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".svg",
      ".webp",
      ".css",
      ".js",
      ".zip",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
    ];
    const pathname = parsed.pathname.toLowerCase();
    if (skipExtensions.some((ext) => pathname.endsWith(ext))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function toSafeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

async function stabilizePage(
  page: import("playwright").Page
): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(750);

  await page
    .evaluate(async () => {
      const delay = (ms: number) =>
        new Promise((resolveDelay) => window.setTimeout(resolveDelay, ms));
      const documentHeight = Math.min(
        document.body?.scrollHeight || 0,
        8000
      );
      const step = Math.max(window.innerHeight, 600);

      for (let offset = 0; offset <= documentHeight; offset += step) {
        window.scrollTo(0, offset);
        await delay(150);
      }

      window.scrollTo(0, 0);
    })
    .catch(() => {});

  await page.waitForTimeout(250);
}

async function extractPageContent(
  page: import("playwright").Page
): Promise<string> {
  return page.evaluate(() => {
    const normalizeText = (value: string): string =>
      value.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    const collectLines = (root: ParentNode): string[] => {
      const selectors = [
        "h1",
        "h2",
        "h3",
        "h4",
        "p",
        "li",
        "dt",
        "dd",
        "address",
        "a[href^='tel:']",
        "a[href^='mailto:']",
      ].join(",");

      return Array.from(root.querySelectorAll(selectors))
        .map((node) => normalizeText(node.textContent || ""))
        .filter((line) => line.length >= 3 && /[a-z]/i.test(line));
    };

    const collectLinkSignals = (root: ParentNode): string[] => {
      return Array.from(root.querySelectorAll("a[href]"))
        .map((node) => {
          const anchor = node as HTMLAnchorElement;
          const href = anchor.getAttribute("href") || "";
          const label = normalizeText(anchor.textContent || "");

          if (href.startsWith("mailto:")) {
            const email = href.replace(/^mailto:/i, "").trim();
            return email ? `Email: ${email}${label ? ` (${label})` : ""}` : "";
          }

          if (href.startsWith("tel:")) {
            const phone = href.replace(/^tel:/i, "").trim();
            return phone ? `Phone: ${phone}${label ? ` (${label})` : ""}` : "";
          }

          if (
            /linkedin\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com/i.test(
              href
            )
          ) {
            return label ? `Social: ${label} -> ${href}` : `Social: ${href}`;
          }

          return "";
        })
        .filter((line) => line.length >= 3);
    };

    const dedupe = (values: string[]): string[] => {
      const unique = new Set<string>();
      const result: string[] = [];

      for (const value of values) {
        const key = value.toLowerCase();
        if (unique.has(key)) {
          continue;
        }

        unique.add(key);
        result.push(value);
      }

      return result;
    };

    const meta = [
      document.title,
      document
        .querySelector("meta[name='description']")
        ?.getAttribute("content"),
      document
        .querySelector("meta[property='og:description']")
        ?.getAttribute("content"),
    ]
      .map((value) => normalizeText(value || ""))
      .filter(Boolean);

    const mainRoot =
      document.querySelector("main, [role='main'], article") || document.body;

    const semanticLines = dedupe(collectLines(mainRoot));
    const linkSignals = dedupe(collectLinkSignals(document.body));
    const fallbackLines =
      semanticLines.length >= 10
        ? []
        : dedupe(collectLines(document.body)).slice(0, 120);

    const combined = dedupe([
      ...meta,
      ...semanticLines,
      ...linkSignals,
      ...fallbackLines,
    ]);
    const joined = combined.join("\n");

    if (joined.length >= 200) {
      return joined;
    }

    return normalizeText(document.body?.innerText || "");
  });
}

async function capturePageScreenshot(
  page: import("playwright").Page,
  screenshotDir: string,
  sequence: number,
  pageUrl: string
): Promise<string> {
  await mkdir(screenshotDir, { recursive: true });

  const parsed = new URL(pageUrl);
  const slug = toSafeSlug(parsed.pathname === "/" ? "home" : parsed.pathname);
  const fileName = `${Date.now()}-${String(sequence + 1).padStart(
    2,
    "0"
  )}-${slug}.png`;
  const outputPath = resolve(screenshotDir, fileName);

  await page.screenshot({
    path: outputPath,
    fullPage: true,
    type: "png",
  });

  return outputPath;
}

/**
 * BFS crawl a website starting at the root URL.
 * Uses require() for playwright to avoid webpack bundling issues.
 */
export async function crawlWebsite(
  url: string,
  options: number | CrawlWebsiteOptions = 10
): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright");

  const maxPages =
    typeof options === "number" ? options : (options.maxPages ?? 10);
  const captureScreenshots =
    typeof options === "number"
      ? false
      : (options.captureScreenshots ?? Boolean(options.screenshotDir?.trim()));
  const screenshotDir =
    typeof options === "number" || !captureScreenshots
      ? null
      : resolveWritablePath(options.screenshotDir);
  const onVisit =
    typeof options === "number" ? null : (options.onVisit ?? null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;

  try {
    const baseUrl = new URL(url);
    const baseOrigin = baseUrl.origin;
    const baseHostname = stripWww(baseUrl.hostname);
    let canonicalOrigin: string | undefined;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      userAgent:
        "Mozilla/5.0 (compatible; TrawlBot/1.0; +https://trawl.app)",
    });
    const page = await context.newPage();

    const visited = new Set<string>();
    const pages: CrawledPage[] = [];
    const screenshots: string[] = [];

    const priorityQueue: string[] = PRIORITY_PATHS.map(
      (path) => normalizeUrl(baseOrigin + path)
    );
    const bfsQueue: string[] = [];

    const rootNormalized = normalizeUrl(url);
    if (!priorityQueue.includes(rootNormalized)) {
      priorityQueue.unshift(rootNormalized);
    }

    const getNextUrl = (): string | undefined => {
      while (priorityQueue.length > 0) {
        const next = priorityQueue.shift()!;
        if (!visited.has(next)) return next;
      }
      while (bfsQueue.length > 0) {
        const next = bfsQueue.shift()!;
        if (!visited.has(next)) return next;
      }
      return undefined;
    };

    let nextUrl: string | undefined;
    while (
      (nextUrl = getNextUrl()) !== undefined &&
      pages.length < maxPages
    ) {
      const currentUrl = nextUrl;
      visited.add(currentUrl);

      try {
        const response = await page.goto(currentUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        if (!response || response.status() >= 400) continue;

        await stabilizePage(page);

        const finalUrl = page.url();
        if (!isInternalUrl(finalUrl, baseHostname)) continue;

        canonicalOrigin = new URL(finalUrl).origin;
        const normalizedFinalUrl = normalizeUrl(finalUrl, canonicalOrigin);
        visited.add(normalizedFinalUrl);

        const title = await page.title();
        const content = await extractPageContent(page);

        if (content.length > 50) {
          const screenshot =
            screenshotDir === null
              ? null
              : await capturePageScreenshot(
                  page,
                  screenshotDir,
                  pages.length,
                  finalUrl
                ).catch(() => null);

          if (screenshot) {
            screenshots.push(screenshot);
          }

          const crawledPage = {
            url: finalUrl,
            title: title || "",
            content: content.slice(0, 10000),
            screenshot,
          };

          pages.push(crawledPage);
          await onVisit?.(crawledPage);
        }

        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map((a: Element) => {
              try {
                return new URL(
                  (a as HTMLAnchorElement).href,
                  window.location.href
                ).href;
              } catch {
                return null;
              }
            })
            .filter((href: string | null): href is string => href !== null);
        });

        for (const link of links) {
          if (!isInternalUrl(link, baseHostname)) {
            continue;
          }

          const normalized = normalizeUrl(link, canonicalOrigin);
          if (
            !visited.has(normalized) &&
            !priorityQueue.includes(normalized) &&
            !bfsQueue.includes(normalized)
          ) {
            bfsQueue.push(normalized);
          }
        }
      } catch {
        continue;
      }
    }

    await context.close();

    const allContent = pages
      .map((p) => `--- ${p.title} (${p.url}) ---\n${p.content}`)
      .join("\n\n");

    return { pages, allContent, screenshots };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
