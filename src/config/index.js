/**
 * Central Configuration
 * 
 * All application settings in one place.
 * Every value is overridable via environment variables.
 */

const config = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,

  // Output
  OUTPUT_DIR: process.env.OUTPUT_DIR || 'output',

  // Crawling
  MAX_CONCURRENCY: parseInt(process.env.MAX_CONCURRENCY, 10) || 3,
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,       // ms
  RETRY_BASE_DELAY: parseInt(process.env.RETRY_BASE_DELAY, 10) || 1000,     // ms
  FALLBACK_WAIT: parseInt(process.env.FALLBACK_WAIT, 10) || 3000,           // ms

  // Browser
  HEADLESS: process.env.HEADLESS !== 'false',  // default true
  VIEWPORT_WIDTH: parseInt(process.env.VIEWPORT_WIDTH, 10) || 1920,
  VIEWPORT_HEIGHT: parseInt(process.env.VIEWPORT_HEIGHT, 10) || 1080,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,  // 1 minute
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 10,
};

module.exports = config;
