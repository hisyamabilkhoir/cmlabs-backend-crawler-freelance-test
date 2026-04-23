/**
 * Queue Service — Lightweight Job Queue Abstraction
 * 
 * Provides an in-memory job queue that tracks crawl jobs with status
 * transitions: pending → running → completed / failed.
 * 
 * This is NOT a production message broker (like RabbitMQ or Bull).
 * It demonstrates the *pattern* — in production, you'd swap this
 * for a persistent queue backed by Redis or similar.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * @typedef {Object} CrawlJob
 * @property {string}   id          — Unique job identifier
 * @property {string[]} urls        — URLs to crawl
 * @property {'pending'|'running'|'completed'|'failed'} status
 * @property {Array}    results     — Crawl results (populated on completion)
 * @property {string}   createdAt   — ISO timestamp
 * @property {string|null} completedAt — ISO timestamp or null
 * @property {string|null} error    — Error message if failed
 */

class QueueService {
  constructor() {
    /** @type {Map<string, CrawlJob>} */
    this._jobs = new Map();
  }

  /**
   * Create and enqueue a new crawl job.
   * @param {string[]} urls
   * @returns {CrawlJob}
   */
  enqueue(urls) {
    const job = {
      id: uuidv4(),
      urls,
      status: 'pending',
      results: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    this._jobs.set(job.id, job);
    logger.info(`Job enqueued: ${job.id}`, { urlCount: urls.length });
    return job;
  }

  /**
   * Mark a job as running.
   * @param {string} jobId
   */
  markRunning(jobId) {
    const job = this._jobs.get(jobId);
    if (job) {
      job.status = 'running';
      logger.debug(`Job running: ${jobId}`);
    }
  }

  /**
   * Mark a job as completed with results.
   * @param {string} jobId
   * @param {Array} results
   */
  markCompleted(jobId, results) {
    const job = this._jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.results = results;
      job.completedAt = new Date().toISOString();
      logger.info(`Job completed: ${jobId}`, {
        total: results.length,
        success: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
      });
    }
  }

  /**
   * Mark a job as failed with an error.
   * @param {string} jobId
   * @param {string} error
   */
  markFailed(jobId, error) {
    const job = this._jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = new Date().toISOString();
      logger.error(`Job failed: ${jobId}`, { error });
    }
  }

  /**
   * Get the current status and details of a job.
   * @param {string} jobId
   * @returns {CrawlJob | null}
   */
  getJob(jobId) {
    return this._jobs.get(jobId) || null;
  }

  /**
   * List all jobs (most recent first).
   * @param {number} [limit=20]
   * @returns {CrawlJob[]}
   */
  listJobs(limit = 20) {
    return Array.from(this._jobs.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Remove completed/failed jobs older than the given age.
   * @param {number} maxAgeMs — maximum age in milliseconds
   * @returns {number} Number of jobs cleaned
   */
  cleanup(maxAgeMs = 3600000) {
    let cleaned = 0;
    const now = Date.now();

    for (const [id, job] of this._jobs) {
      if (['completed', 'failed'].includes(job.status)) {
        if (now - new Date(job.createdAt).getTime() > maxAgeMs) {
          this._jobs.delete(id);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} stale job(s) from queue`);
    }
    return cleaned;
  }
}

// Export singleton
module.exports = new QueueService();
