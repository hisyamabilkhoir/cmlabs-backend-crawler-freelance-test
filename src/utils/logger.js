/**
 * Logger Utility
 * 
 * Centralized, colored, timestamped logging with multiple levels.
 * No external dependencies — uses ANSI escape codes for terminal coloring.
 */

const COLORS = {
  reset:   '\x1b[0m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
  bold:    '\x1b[1m',
};

const LEVEL_CONFIG = {
  DEBUG: { color: COLORS.gray,   label: 'DEBUG' },
  INFO:  { color: COLORS.green,  label: 'INFO ' },
  WARN:  { color: COLORS.yellow, label: 'WARN ' },
  ERROR: { color: COLORS.red,    label: 'ERROR' },
};

/**
 * Format a log message with timestamp, level, and optional context.
 * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {object} [context] — additional key-value pairs to log
 */
function log(level, message, context = {}) {
  const { color, label } = LEVEL_CONFIG[level] || LEVEL_CONFIG.INFO;
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length
    ? ` ${COLORS.gray}${JSON.stringify(context)}${COLORS.reset}`
    : '';

  const formatted = [
    `${COLORS.gray}[${timestamp}]${COLORS.reset}`,
    `${color}${COLORS.bold}[${label}]${COLORS.reset}`,
    message,
    contextStr,
  ].join(' ');

  if (level === 'ERROR') {
    console.error(formatted);
  } else if (level === 'WARN') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

const logger = {
  debug: (msg, ctx) => log('DEBUG', msg, ctx),
  info:  (msg, ctx) => log('INFO',  msg, ctx),
  warn:  (msg, ctx) => log('WARN',  msg, ctx),
  error: (msg, ctx) => log('ERROR', msg, ctx),

  /**
   * Log a crawl result summary.
   * @param {{ url: string, timeMs: number, status: string, file?: string, error?: string }} result
   */
  crawlResult(result) {
    const level = result.status === 'success' ? 'INFO' : 'ERROR';
    const emoji = result.status === 'success' ? '✅' : '❌';
    log(level, `${emoji} ${result.url}`, {
      status: result.status,
      timeMs: result.timeMs,
      ...(result.file  ? { file: result.file }   : {}),
      ...(result.error ? { error: result.error }  : {}),
    });
  },
};

module.exports = logger;
