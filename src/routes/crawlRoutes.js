/**
 * Crawl Routes
 * 
 * Defines all HTTP routes for the crawler API and applies
 * middleware (JSON parsing, rate limiting).
 */

const { Router } = require('express');
const crawlController = require('../controllers/crawlController');
const config = require('../config');
const logger = require('../utils/logger');

const router = Router();

// ── Rate Limiter Middleware (in-memory, lightweight) ──────────────
const rateLimitStore = new Map();

/**
 * Simple sliding-window rate limiter.
 * In production, use Redis-backed rate limiting.
 */
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = config.RATE_LIMIT_MAX_REQUESTS;

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }

  const timestamps = rateLimitStore.get(ip);

  // Remove timestamps outside the current window
  const filtered = timestamps.filter((t) => now - t < windowMs);
  rateLimitStore.set(ip, filtered);

  if (filtered.length >= maxRequests) {
    logger.warn(`Rate limit exceeded for ${ip}`);
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again later.',
      retryAfterMs: windowMs - (now - filtered[0]),
    });
  }

  filtered.push(now);
  next();
}

// Periodically clean up stale rate-limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore) {
    const filtered = timestamps.filter((t) => now - t < config.RATE_LIMIT_WINDOW_MS);
    if (filtered.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, filtered);
    }
  }
}, 300000).unref(); // .unref() so it doesn't keep the process alive

// ── Routes ────────────────────────────────────────────────────────

// Health check
router.get('/health', (req, res) => {
  const browserManager = require('../config/browser');
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    browser: browserManager.isRunning() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Synchronous crawl
router.post('/crawl', rateLimiter, crawlController.handleCrawl);

// Asynchronous crawl (returns job ID immediately)
router.post('/crawl/async', rateLimiter, crawlController.handleAsyncCrawl);

// Job status
router.get('/crawl/status/:jobId', crawlController.handleJobStatus);

module.exports = router;
