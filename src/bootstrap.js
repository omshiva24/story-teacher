/*! Story Teacher · © 2026 P Om Shiva (M.Tech CSE, Pondicherry University). All rights reserved. Copying or reuse without written permission is not allowed. */
'use strict';

/**
 * Wires the real services together and returns the Express app.
 * Used by src/server.js (Cloud Run / local) and index.js (Vercel).
 */
require('dotenv').config();

const config = require('./config');
const { createApp } = require('./expressApp');
const { createGeminiClient } = require('./services/geminiService');
const { MemoryCache } = require('./services/cache');
const { createStoryService } = require('./services/storyService');
const { createWikiImageFinder } = require('./services/wikiImageService');
const { createWikiArticleFinder } = require('./services/wikiLessonService');
const { createWikiMediaFinder } = require('./services/wikiMediaService');
const { createTtsService } = require('./services/ttsService');

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
  const storyService = createStoryService({
    aiClient,
    cache,
    findTopicImage: createWikiImageFinder(),
    findArticle: createWikiArticleFinder(),
  });
  const tts = createTtsService({ apiKey: config.geminiApiKey, model: config.ttsModel });
  const findMedia = createWikiMediaFinder({ cache: new MemoryCache({ maxEntries: 200, ttlMs: 6 * 60 * 60 * 1000 }) });
  // The status page also reports whether the natural voice works.
  const checkAiStatus = async () => {
    const voice = await tts.checkStatus();
    return { voice, ...(await aiClient.checkStatus()) };
  };
  return createApp({ storyService, config, checkAiStatus, findMedia, tts });
}

module.exports = { buildApp, config };
