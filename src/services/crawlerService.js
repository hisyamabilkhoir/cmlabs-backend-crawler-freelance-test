/**
 * Crawler Service — Core Engine
 * 
 * The heart of the system. Handles single-URL crawling, retry logic with
 * exponential backoff, and batch crawling with concurrency control.
 * 
 * Design decisions:
 * - Each crawl uses its own browser *context* for isolation (cookies, storage)
 * - Primary wait strategy: `networkidle` (waits for no network activity for 500 ms)
 * - Fallback: if networkidle times out, we use `domcontentloaded` + fixed delay
 *   to handle streaming/WebSocket-heavy SPAs
 * - p-limit is ESM-only since v4, so we use dynamic import()
 */

const config = require('../config');
const browserManager = require('../config/browser');
const logger = require('../utils/logger');
const fileHelper = require('../utils/fileHelper');

/**
 * Crawl a single URL using Playwright.
 * Creates an isolated browser context, navigates, waits for rendering,
 * and extracts the fully rendered DOM.
 * 
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeout] — navigation timeout in ms
 * @returns {Promise<{ url: string, html: string, timeMs: number }>}
 */
async function crawlUrl(url, options = {}) {
  const timeout = options.timeout || config.REQUEST_TIMEOUT;
  const start = performance.now();

  const browser = await browserManager.getBrowser();

  // Each crawl gets its own context for complete isolation
  const context = await browser.newContext({
    viewport: { width: config.VIEWPORT_WIDTH, height: config.VIEWPORT_HEIGHT },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    logger.info(`Crawling: ${url}`);

    // Primary strategy: wait for network to be idle
    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });
    } catch (navError) {
      // Fallback strategy: if networkidle times out (common for streaming sites),
      // navigate with domcontentloaded and then wait a fixed period
      logger.warn(`networkidle timed out for ${url}, using fallback strategy`, {
        error: navError.message,
      });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // Wait for JS frameworks to finish rendering
      await page.waitForTimeout(config.FALLBACK_WAIT);
    }

    // Extract the fully rendered HTML
    const html = await page.content();
    const timeMs = Math.round(performance.now() - start);

    logger.info(`Crawled successfully: ${url}`, { timeMs: `${timeMs}ms` });

    return { url, html, timeMs };
  } finally {
    // Always clean up to prevent memory leaks
    await page.close();
    await context.close();
  }
}

/**
 * Crawl a URL with automatic retry and exponential backoff.
 * 
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.maxRetries]
 * @param {number} [options.baseDelay] — base delay in ms for exponential backoff
 * @returns {Promise<{ url: string, html: string, timeMs: number }>}
 */
async function crawlWithRetry(url, options = {}) {
  const maxRetries = options.maxRetries ?? config.MAX_RETRIES;
  const baseDelay = options.baseDelay ?? config.RETRY_BASE_DELAY;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await crawlUrl(url, options);
    } catch (error) {
      lastError = error;
      logger.warn(`Crawl attempt ${attempt}/${maxRetries} failed for ${url}`, {
        error: error.message,
      });

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.info(`Retrying ${url} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw new Error(`Failed to crawl ${url} after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Crawl multiple URLs in parallel with concurrency control.
 * Uses p-limit to cap the number of simultaneous browser tabs.
 * 
 * @param {string[]} urls — Array of validated URLs
 * @param {object} [options]
 * @param {number} [options.concurrency] — max concurrent crawls
 * @returns {Promise<Array<{ url: string, status: string, file?: string, timeMs: number, error?: string }>>}
 */
async function crawlMultiple(urls, options = {}) {
  const concurrency = options.concurrency ?? config.MAX_CONCURRENCY;

  // p-limit is ESM-only, so we use dynamic import
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);

  logger.info(`Starting batch crawl: ${urls.length} URL(s), concurrency: ${concurrency}`);

  const tasks = urls.map((url) =>
    limit(async () => {
      try {
        const result = await crawlWithRetry(url, options);

        // Save the HTML to disk
        const filePath = fileHelper.generateOutputPath(url);
        await fileHelper.saveHtml(filePath, result.html);

        const entry = {
          url: result.url,
          status: 'success',
          file: filePath,
          timeMs: result.timeMs,
        };

        logger.crawlResult(entry);
        return entry;
      } catch (error) {
        const entry = {
          url,
          status: 'failed',
          timeMs: 0,
          error: error.message,
        };

        logger.crawlResult(entry);
        return entry;
      }
    })
  );

  return Promise.all(tasks);
}

module.exports = {
  crawlUrl,
  crawlWithRetry,
  crawlMultiple,
};
