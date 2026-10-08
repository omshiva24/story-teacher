'use strict';

/**
 * Wires the real services together and returns the Express app.
 * Used by src/server.js (Cloud Run / local) and index.js (Vercel).
 */
require('dotenv').config();

const config = require('./config');
const { createApp } = require('./app');
const { createGeminiClient } = require('./services/geminiService');
const { MemoryCache } = require('./services/cache');
const { createStoryService } = require('./services/storyService');
const { createWikiImageFinder } = require('./services/wikiImageService');

/**
 * @returns {import('express').Express}
 */
function buildApp() {
  if (!config.geminiApiKey) {
    console.warn('GEMINI_API_KEY is not set. Stories will fail until it is added.');
  }
  const aiClient = createGeminiClient({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    timeoutMs: config.aiTimeoutMs,
    grounding: config.groundingEnabled,
  });
  const cache = new MemoryCache({ maxEntries: config.cacheMaxEntries, ttlMs: config.cacheTtlMs });
  const storyService = createStoryService({ aiClient, cache, findTopicImage: createWikiImageFinder() });
  return createApp({ storyService, config });
}

module.exports = { buildApp, config };
