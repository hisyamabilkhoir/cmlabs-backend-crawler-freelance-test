/**
 * URL Helper Utility
 * 
 * Validates, normalizes, and inspects URLs before they are fed
 * into the crawler engine.
 */

/**
 * Check whether a string is a valid, crawlable URL.
 * Must have http or https protocol and a valid hostname.
 * @param {string} urlString
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, reason: 'URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(urlString);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    if (!parsed.hostname || parsed.hostname.length < 2) {
      return { valid: false, reason: 'Invalid hostname' };
    }

    // Basic TLD check (hostname must contain at least one dot, or be localhost)
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
      return { valid: false, reason: 'Hostname must contain a valid domain' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL' };
  }
}

/**
 * Batch-validate an array of URLs.
 * @param {string[]} urls
 * @returns {{ valid: string[], invalid: { url: string, reason: string }[] }}
 */
function validateUrls(urls) {
  const valid = [];
  const invalid = [];

  for (const url of urls) {
    const result = validateUrl(url);
    if (result.valid) {
      valid.push(normalizeUrl(url));
    } else {
      invalid.push({ url, reason: result.reason });
    }
  }

  return { valid, invalid };
}

/**
 * Normalize a URL for consistency.
 * Strips trailing slashes, lowercases the hostname.
 * @param {string} urlString
 * @returns {string}
 */
function normalizeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove trailing slash from pathname (unless it's just '/')
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return urlString;
  }
}

/**
 * Extract a clean domain name from a URL (for filenames).
 * e.g. "https://cmlabs.co/en/home" → "cmlabs.co"
 * @param {string} urlString
 * @returns {string}
 */
function extractDomain(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

module.exports = {
  validateUrl,
  validateUrls,
  normalizeUrl,
  extractDomain,
};
