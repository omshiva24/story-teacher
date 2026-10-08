'use strict';

/**
 * Central configuration. Every setting comes from environment variables
 * so no secret is ever written in the code.
 */

/**
 * Reads a positive integer from the environment, falling back to a default.
 * @param {string} name - Environment variable name.
 * @param {number} fallback - Default value.
 * @returns {number}
 */
function readInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const config = Object.freeze({
  port: readInt('PORT', 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  // Fact-check with Google Search (Gemini 3 models). Set GEMINI_GROUNDING=false to turn off.
  groundingEnabled: process.env.GEMINI_GROUNDING !== 'false',
  aiTimeoutMs: readInt('AI_TIMEOUT_MS', 30000),
  cacheMaxEntries: readInt('CACHE_MAX_ENTRIES', 100),
  cacheTtlMs: readInt('CACHE_TTL_MS', 60 * 60 * 1000),
  rateLimitWindowMs: readInt('RATE_LIMIT_WINDOW_MS', 60 * 1000),
  rateLimitMax: readInt('RATE_LIMIT_MAX', 10),
});

module.exports = config;
