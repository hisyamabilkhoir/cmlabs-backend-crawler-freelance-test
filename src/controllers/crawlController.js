/**
 * Crawl Controller
 * 
 * Handles HTTP request/response logic for crawl endpoints.
 * Delegates all business logic to the service layer.
 */

const crawlerService = require('../services/crawlerService');
const queueService = require('../services/queueService');
const { validateUrls } = require('../utils/urlHelper');
const logger = require('../utils/logger');

/**
 * POST /crawl — Synchronous crawl
 * 
 * Accepts an array of URLs, crawls them with concurrency control,
 * and returns results when all URLs are finished.
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleCrawl(req, res) {
  const startTime = performance.now();

  try {
    // ── Input validation ──────────────────────────────────────────
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must contain a non-empty "urls" array',
        example: { urls: ['https://example.com'] },
      });
    }

    // Validate each URL
    const { valid, invalid } = validateUrls(urls);

    if (valid.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid URLs provided',
        invalid,
      });
    }

    // Warn about invalid URLs but continue with valid ones
    if (invalid.length > 0) {
      logger.warn(`Skipping ${invalid.length} invalid URL(s)`, { invalid });
    }

    // ── Crawl execution ───────────────────────────────────────────
    logger.info(`Received crawl request for ${valid.length} URL(s)`);

    const results = await crawlerService.crawlMultiple(valid);

    const totalTimeMs = Math.round(performance.now() - startTime);

    // ── Response ──────────────────────────────────────────────────
    return res.status(200).json({
      status: 'success',
      totalTimeMs,
      results,
      ...(invalid.length > 0 ? { skipped: invalid } : {}),
    });
  } catch (error) {
    logger.error('Crawl request failed', { error: error.message });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during crawl',
      error: error.message,
    });
  }
}

/**
 * POST /crawl/async — Asynchronous crawl (enqueue and return immediately)
 * 
 * Returns a job ID that can be polled for status.
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleAsyncCrawl(req, res) {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Request body must contain a non-empty "urls" array',
      });
    }

    const { valid, invalid } = validateUrls(urls);

    if (valid.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid URLs provided',
        invalid,
      });
    }

    // Enqueue the job
    const job = queueService.enqueue(valid);

    // Start crawling in the background (fire and forget)
    (async () => {
      try {
        queueService.markRunning(job.id);
        const results = await crawlerService.crawlMultiple(valid);
        queueService.markCompleted(job.id, results);
      } catch (error) {
        queueService.markFailed(job.id, error.message);
      }
    })();

    return res.status(202).json({
      status: 'accepted',
      jobId: job.id,
      message: 'Crawl job enqueued. Poll GET /crawl/status/:jobId for results.',
      ...(invalid.length > 0 ? { skipped: invalid } : {}),
    });
  } catch (error) {
    logger.error('Async crawl request failed', { error: error.message });
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message,
    });
  }
}

/**
 * GET /crawl/status/:jobId — Check job status
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleJobStatus(req, res) {
  const { jobId } = req.params;
  const job = queueService.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      status: 'error',
      message: `Job not found: ${jobId}`,
    });
  }

  return res.status(200).json({
    status: 'success',
    job,
  });
}

module.exports = {
  handleCrawl,
  handleAsyncCrawl,
  handleJobStatus,
};
