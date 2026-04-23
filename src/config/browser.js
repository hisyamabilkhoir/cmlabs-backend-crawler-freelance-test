/**
 * Browser Manager — Singleton
 * 
 * Manages a single Playwright Chromium instance shared across all crawl
 * requests. Re-launching the browser per request is expensive (~2 s),
 * so we launch once and create lightweight browser *contexts* per crawl
 * for cookie/storage isolation.
 */

const { chromium } = require('playwright');
const config = require('./index');
const logger = require('../utils/logger');

class BrowserManager {
  constructor() {
    /** @type {import('playwright').Browser | null} */
    this._browser = null;
    this._launching = null; // guards against concurrent launches
  }

  /**
   * Launch the shared browser instance (idempotent).
   * Safe to call multiple times — only the first call actually launches.
   */
  async launch() {
    if (this._browser) return this._browser;

    // If a launch is already in progress, wait for it
    if (this._launching) return this._launching;

    this._launching = (async () => {
      logger.info('Launching Chromium browser instance...');
      this._browser = await chromium.launch({
        headless: config.HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',   // important for Docker
          '--disable-gpu',
        ],
      });

      // If the browser disconnects unexpectedly, clear the reference
      this._browser.on('disconnected', () => {
        logger.warn('Browser disconnected unexpectedly');
        this._browser = null;
      });

      logger.info('Chromium browser launched successfully');
      return this._browser;
    })();

    try {
      const browser = await this._launching;
      return browser;
    } finally {
      this._launching = null;
    }
  }

  /**
   * Get the active browser instance, launching if necessary.
   * @returns {Promise<import('playwright').Browser>}
   */
  async getBrowser() {
    if (!this._browser) {
      await this.launch();
    }
    return this._browser;
  }

  /**
   * Gracefully close the browser and release resources.
   */
  async close() {
    if (this._browser) {
      logger.info('Closing Chromium browser...');
      await this._browser.close();
      this._browser = null;
      logger.info('Chromium browser closed');
    }
  }

  /**
   * Check whether the browser is currently running.
   * @returns {boolean}
   */
  isRunning() {
    return this._browser !== null && this._browser.isConnected();
  }
}

// Export a singleton instance
module.exports = new BrowserManager();
