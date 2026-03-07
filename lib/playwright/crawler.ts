export interface CrawledPage {
  url: string;
  title: string;
  content: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  allContent: string;
}

const PRIORITY_PATHS = [
  '/',
  '/about',
  '/about-us',
  '/services',
  '/what-we-do',
  '/industries',
  '/contact',
  '/contact-us',
  '/team',
  '/our-team',
  '/products',
  '/solutions',
];

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

function isInternalUrl(url: string, baseOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== baseOrigin) return false;
    const skipExtensions = [
      '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
      '.css', '.js', '.zip', '.doc', '.docx', '.xls', '.xlsx',
      '.mp3', '.mp4', '.avi', '.mov', '.ico', '.woff', '.woff2',
      '.ttf', '.eot',
    ];
    const pathname = parsed.pathname.toLowerCase();
    if (skipExtensions.some((ext) => pathname.endsWith(ext))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * BFS crawl a website starting at the root URL.
 * Uses require() for playwright to avoid webpack bundling issues.
 */
export async function crawlWebsite(
  url: string,
  maxPages: number = 10
): Promise<CrawlResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;

  try {
    const baseUrl = new URL(url);
    const baseOrigin = baseUrl.origin;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; TrawlBot/1.0; +https://trawl.app)',
    });
    const page = await context.newPage();

    const visited = new Set<string>();
    const pages: CrawledPage[] = [];

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
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });

        if (!response || response.status() >= 400) continue;

        const finalUrl = page.url();
        if (!finalUrl.startsWith(baseOrigin)) continue;
        visited.add(normalizeUrl(finalUrl));

        const title = await page.title();
        const content = await page.evaluate(() => {
          const elementsToRemove = document.querySelectorAll(
            'script, style, noscript, iframe'
          );
          elementsToRemove.forEach((el: Element) => el.remove());
          const body = document.body;
          if (!body) return '';
          return body.innerText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        });

        if (content.length > 50) {
          pages.push({
            url: finalUrl,
            title: title || '',
            content: content.slice(0, 10000),
          });
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
          const normalized = normalizeUrl(link);
          if (!visited.has(normalized) && isInternalUrl(normalized, baseOrigin)) {
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
      .join('\n\n');

    return { pages, allContent };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
