/**
 * Application Entry Point
 * 
 * Dual-mode: runs as an Express API server or a CLI tool depending
 * on the command-line arguments.
 * 
 *   Server mode:  node src/app.js
 *   CLI mode:     node src/app.js crawl <url1> <url2> ...
 * 
 * Includes graceful shutdown handling for SIGINT/SIGTERM.
 */

const express = require('express');
const config = require('./config');
const browserManager = require('./config/browser');
const crawlRoutes = require('./routes/crawlRoutes');
const crawlerService = require('./services/crawlerService');
const { validateUrls } = require('./utils/urlHelper');
const logger = require('./utils/logger');

// ── CLI Mode ──────────────────────────────────────────────────────

async function runCli(urls) {
  logger.info('🕷️  Web Crawler — CLI Mode');
  logger.info(`URLs to crawl: ${urls.length}`);

  // Validate URLs
  const { valid, invalid } = validateUrls(urls);

  if (invalid.length > 0) {
    logger.warn('Skipping invalid URLs:');
    invalid.forEach((i) => logger.warn(`  ✗ ${i.url} — ${i.reason}`));
  }

  if (valid.length === 0) {
    logger.error('No valid URLs to crawl. Exiting.');
    process.exit(1);
  }

  // Launch browser and crawl
  await browserManager.launch();

  const results = await crawlerService.crawlMultiple(valid);

  // Print summary table
  console.log('\n' + '═'.repeat(80));
  console.log('  CRAWL RESULTS');
  console.log('═'.repeat(80));
  console.log(
    '  ' +
    'Status'.padEnd(10) +
    'Time'.padEnd(10) +
    'URL'
  );
  console.log('─'.repeat(80));

  for (const r of results) {
    const status = r.status === 'success' ? '✅ OK' : '❌ FAIL';
    const time = r.status === 'success' ? `${r.timeMs}ms` : '—';
    console.log(`  ${status.padEnd(10)}${time.padEnd(10)}${r.url}`);
    if (r.file) {
      console.log(`${''.padEnd(22)}→ ${r.file}`);
    }
    if (r.error) {
      console.log(`${''.padEnd(22)}⚠ ${r.error}`);
    }
  }

  console.log('═'.repeat(80));

  const success = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`  Total: ${results.length} | Success: ${success} | Failed: ${failed}`);
  console.log('═'.repeat(80) + '\n');

  // Clean up
  await browserManager.close();
  process.exit(0);
}

// ── Server Mode ───────────────────────────────────────────────────

async function runServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      const duration = Math.round(performance.now() - start);
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, { duration: `${duration}ms` });
    });
    next();
  });

  // Routes
  app.use('/', crawlRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      availableRoutes: {
        'POST /crawl': 'Synchronous crawl — waits for completion',
        'POST /crawl/async': 'Async crawl — returns job ID',
        'GET /crawl/status/:jobId': 'Check async job status',
        'GET /health': 'Health check',
      },
    });
  });

  // Global error handler
  app.use((err, req, res, _next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  });

  // Launch browser before accepting requests
  await browserManager.launch();

  // Start listening
  const server = app.listen(config.PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                                                              ║');
    console.log('║   🕷️  CMLABS Web Crawler Service                             ║');
    console.log(`║   🌐 Server running on http://localhost:${String(config.PORT).padEnd(24)}║`);
    console.log(`║   📂 Output directory: ${config.OUTPUT_DIR.padEnd(35)}║`);
    console.log(`║   ⚡ Max concurrency: ${String(config.MAX_CONCURRENCY).padEnd(36)}║`);
    console.log('║                                                              ║');
    console.log('║   Endpoints:                                                 ║');
    console.log('║     POST /crawl           — Synchronous crawl               ║');
    console.log('║     POST /crawl/async     — Async crawl (returns job ID)    ║');
    console.log('║     GET  /crawl/status/:id — Check job status               ║');
    console.log('║     GET  /health          — Health check                    ║');
    console.log('║                                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────
  let isShuttingDown = false;

  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`\nReceived ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close browser
    await browserManager.close();

    logger.info('Graceful shutdown complete. Goodbye! 👋');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

// ── Entry Point ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'crawl') {
    // CLI mode: node src/app.js crawl <url1> <url2> ...
    const urls = args.slice(1);

    if (urls.length === 0) {
      console.log('');
      console.log('Usage: node src/app.js crawl <url1> [url2] [url3] ...');
      console.log('');
      console.log('Example:');
      console.log('  node src/app.js crawl https://cmlabs.co https://sequence.day');
      console.log('');
      process.exit(1);
    }

    await runCli(urls);
  } else {
    // Server mode
    await runServer();
  }
}

main().catch((err) => {
  logger.error('Fatal error during startup', { error: err.message });
  process.exit(1);
});
