'use strict';

const { AppError } = require('../utils/errors');

const MAX_SOURCES = 5;

// Tried in order after the configured model if a model is not available
// for this API key (Google limits some models for new keys).
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'];

/**
 * Reads the HTTP status from a Gen AI SDK error (shape differs by version).
 * @param {any} err
 * @returns {number|undefined}
 */
function errorStatus(err) {
  const value = err && (err.status ?? err.code ?? (err.error && err.error.code));
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

/**
 * True when the model name is unknown or not allowed for this key.
 * @param {any} err
 * @returns {boolean}
 */
function isModelUnavailable(err) {
  const message = String((err && err.message) || '');
  return errorStatus(err) === 404 || /not found|is not supported|not available|no longer available/i.test(message);
}

/**
 * Turns a raw Gemini error into a friendly AppError, and logs the real reason.
 * @param {any} err
 * @returns {AppError}
 */
function toFriendlyError(err) {
  if (err instanceof AppError) return err;
  const status = errorStatus(err);
  const message = String((err && err.message) || '');
  console.error('[gemini] request failed:', status || '', message.slice(0, 500));
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(message) || status === 401 || status === 403) {
    return new AppError(502, 'AI_KEY_INVALID', 'The story service key is not working. (Admin: check GEMINI_API_KEY.)');
  }
  if (isModelUnavailable(err)) {
    return new AppError(502, 'AI_MODEL_UNAVAILABLE', 'The AI model is not available for this key. (Admin: check GEMINI_MODEL.)');
  }
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
    return new AppError(429, 'AI_BUSY', 'The AI is busy right now (free limit reached). Please wait a minute and try again.');
  }
  if (status === 503 || /overloaded|UNAVAILABLE/i.test(message)) {
    return new AppError(503, 'AI_OVERLOADED', 'The AI is very busy right now. Please try again in a moment.');
  }
  return new AppError(502, 'STORY_FAILED', 'Sorry, we could not make the story right now. Please try again.');
}

/**
 * Rejects if the promise takes longer than the timeout.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AppError(504, 'AI_TIMEOUT', 'The story took too long. Please try again.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Parses the model's JSON text. Tolerates a ```json fence around it.
 * @param {string} text
 * @returns {unknown}
 * @throws {AppError}
 */
function parseJsonText(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError(502, 'AI_BAD_RESPONSE', 'The story came back in a strange shape. Please try again.');
  }
}

/**
 * Pulls the Google Search sources out of a grounded response.
 * Only https links are kept, without duplicates.
 * @param {object} response - Gemini response.
 * @returns {{ title: string, url: string }[]}
 */
function extractSources(response) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) {
    return [];
  }
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const url = chunk?.web?.uri;
    if (typeof url !== 'string' || !url.startsWith('https://') || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const title = typeof chunk.web.title === 'string' && chunk.web.title.trim() ? chunk.web.title.trim() : 'Source';
    sources.push({ title: title.slice(0, 120), url: url.slice(0, 2000) });
    if (sources.length === MAX_SOURCES) break;
  }
  return sources;
}

/**
 * Creates the Gemini client. The API key stays on the server.
 * @param {{ apiKey: string, model: string, timeoutMs: number, grounding?: boolean, sdk?: object }} options
 * @returns {{ generateStoryJson: (params: { systemInstruction: string, prompt: string, schema: object }) => Promise<{ data: unknown, sources: object[] }> }}
 */
function createGeminiClient({ apiKey, model, timeoutMs, grounding = true, sdk }) {
  if (!apiKey) {
    return {
      generateStoryJson: async () => {
        throw new AppError(503, 'AI_NOT_CONFIGURED', 'The story service is not set up yet. Please try again later.');
      },
    };
  }

  // The SDK is loaded on the first story, not at start-up, with import()
  // (works whether the package ships CommonJS or ES modules). A failed load
  // is retried on the next request instead of crashing the server.
  let clientPromise = null;
  function getClient() {
    if (!clientPromise) {
      clientPromise = Promise.resolve(sdk || import('@google/genai'))
        .then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }))
        .catch((err) => {
          clientPromise = null;
          throw err;
        });
    }
    return clientPromise;
  }

  /** One call to the model, with or without Google Search. */
  async function callModel({ model: modelName, systemInstruction, prompt, schema, useSearch }) {
    const ai = await getClient();
    const config = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.8,
    };
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    const response = await withTimeout(ai.models.generateContent({ model: modelName, contents: prompt, config }), timeoutMs);
    return { data: parseJsonText(response.text), sources: useSearch ? extractSources(response) : [] };
  }

  /** Tries one model: with Google Search first (if on), then without. */
  async function generateWithModel(modelName, params) {
    if (grounding) {
      try {
        return await callModel({ ...params, model: modelName, useSearch: true });
      } catch (err) {
        if (err && err.code === 'AI_TIMEOUT') throw err;
        // Search grounding is not available for every model or key: fall back once.
        console.warn('[gemini] search-grounded call failed, retrying without search:', err && err.message);
      }
    }
    return callModel({ ...params, model: modelName, useSearch: false });
  }

  const models = [...new Set([model, ...FALLBACK_MODELS].filter(Boolean))];

  return {
    async generateStoryJson(params) {
      let lastError;
      for (const modelName of models) {
        try {
          return await generateWithModel(modelName, params);
        } catch (err) {
          lastError = err;
          if (!isModelUnavailable(err)) break;
          console.warn(`[gemini] model "${modelName}" is not available, trying the next one`);
        }
      }
      throw toFriendlyError(lastError);
    },
  };
}

module.exports = { createGeminiClient, withTimeout, parseJsonText, extractSources, toFriendlyError, isModelUnavailable };
