'use strict';

const { AppError } = require('../utils/errors');

const MAX_SOURCES = 5;

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

  // Loaded only when a key exists, so tests never need the real SDK.
  const { GoogleGenAI } = sdk || require('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  /** One call to the model, with or without Google Search. */
  async function callModel({ systemInstruction, prompt, schema, useSearch }) {
    const config = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.8,
    };
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    const response = await withTimeout(ai.models.generateContent({ model, contents: prompt, config }), timeoutMs);
    return { data: parseJsonText(response.text), sources: useSearch ? extractSources(response) : [] };
  }

  return {
    async generateStoryJson(params) {
      if (grounding) {
        try {
          return await callModel({ ...params, useSearch: true });
        } catch (err) {
          if (err && err.code === 'AI_TIMEOUT') throw err;
          // Search grounding is not available for every model or key: fall back once.
          console.warn('[gemini] search-grounded call failed, retrying without search:', err && err.message);
        }
      }
      return callModel({ ...params, useSearch: false });
    },
  };
}

module.exports = { createGeminiClient, withTimeout, parseJsonText, extractSources };
