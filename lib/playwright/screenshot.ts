/**
 * Capture a full-page PNG screenshot of a URL.
 * Returns the output file path.
 */
export async function captureScreenshot(
  url: string,
  outputPath: string
): Promise<string> {
  // Dynamic import to avoid webpack resolution
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright');

  let browser: unknown = null;

  try {
    browser = await chromium.launch({ headless: true });

    const typedBrowser = browser as {
      newContext: (opts: unknown) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, opts: unknown) => Promise<unknown>;
          screenshot: (opts: unknown) => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    };

    const context = await typedBrowser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (compatible; TrawlBot/1.0; +https://trawl.app)',
    });
    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.screenshot({
      path: outputPath,
      fullPage: true,
      type: 'png',
    });

    await context.close();

    return outputPath;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown screenshot error';
    throw new Error(`Failed to capture screenshot of ${url}: ${message}`);
  } finally {
    if (browser) {
      await (browser as { close: () => Promise<void> }).close();
    }
  }
}
