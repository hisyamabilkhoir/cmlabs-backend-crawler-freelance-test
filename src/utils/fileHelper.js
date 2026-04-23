/**
 * File Helper Utility
 * 
 * Handles output file naming, directory creation, and HTML persistence.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { extractDomain } = require('./urlHelper');
const logger = require('./logger');

/**
 * Produce a filesystem-safe filename from a URL.
 * e.g. "https://cmlabs.co/en" → "cmlabs.co"
 * @param {string} url
 * @returns {string}
 */
function sanitizeFilename(url) {
  const domain = extractDomain(url);
  // Replace characters that are unsafe on Windows/Linux filesystems
  return domain.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Generate the full output file path for a crawled URL.
 * Appends a timestamp suffix to prevent overwrite conflicts.
 * @param {string} url
 * @param {boolean} [withTimestamp=true]
 * @returns {string} Absolute path to the output file
 */
function generateOutputPath(url, withTimestamp = true) {
  const baseName = sanitizeFilename(url);
  const suffix = withTimestamp ? `_${Date.now()}` : '';
  const fileName = `${baseName}${suffix}.html`;
  return path.resolve(config.OUTPUT_DIR, fileName);
}

/**
 * Ensure the output directory exists, creating it if necessary.
 */
async function ensureOutputDir() {
  const dir = path.resolve(config.OUTPUT_DIR);
  try {
    await fs.promises.access(dir);
  } catch {
    await fs.promises.mkdir(dir, { recursive: true });
    logger.info(`Created output directory: ${dir}`);
  }
}

/**
 * Save HTML content to disk.
 * @param {string} filePath — Absolute path for the output file
 * @param {string} content  — HTML string to write
 * @returns {Promise<string>} The written file path
 */
async function saveHtml(filePath, content) {
  await ensureOutputDir();
  await fs.promises.writeFile(filePath, content, 'utf-8');
  logger.info(`Saved output file: ${filePath}`, { size: `${(Buffer.byteLength(content) / 1024).toFixed(1)} KB` });
  return filePath;
}

module.exports = {
  sanitizeFilename,
  generateOutputPath,
  ensureOutputDir,
  saveHtml,
};
