'use strict';

require('dotenv').config();

const config = require('./config');
const { createApp } = require('./app');
const { createGeminiClient } = require('./services/geminiService');
const { MemoryCache } = require('./services/cache');
const { createStoryService } = require('./services/storyService');
const { createWikiImageFinder } = require('./services/wikiImageService');

const aiClient = createGeminiClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  timeoutMs: config.aiTimeoutMs,
  grounding: config.groundingEnabled,
});
const cache = new MemoryCache({ maxEntries: config.cacheMaxEntries, ttlMs: config.cacheTtlMs });
const storyService = createStoryService({ aiClient, cache, findTopicImage: createWikiImageFinder() });
const app = createApp({ storyService, config });

if (!config.geminiApiKey) {
  console.warn('GEMINI_API_KEY is not set. Stories will fail until it is added.');
}

app.listen(config.port, () => {
  console.log(`Story Teacher running on http://localhost:${config.port}`);
});
