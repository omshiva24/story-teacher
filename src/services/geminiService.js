'use strict';

const { AppError } = require('../utils/errors');

const MAX_SOURCES = 5;

// Tried in order after the configured model when a model is not available
// for this key or its free quota is used up. Each model has its own quota,
// and the Lite models usually have the largest free allowance.
const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
];
// After a quota error on a Google Search call, skip search for a while so
// each story costs one request instead of two.
const SEARCH_PAUSE_MS = 10 * 60 * 1000;

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
 * (Kept narrow so a "feature not supported" error is not mistaken for it.)
 * @param {any} err
 * @returns {boolean}
 */
function isModelUnavailable(err) {
  const message = String((err && err.message) || '');
  return (
    errorStatus(err) === 404 ||
    /models\/[\w.-]+ is not found|is not found for API version|not available (to|for) (new )?users|no longer available|model .*not (found|available)/i.test(
      message,
    )
  );
}

/**
 * True when Google rejected the request settings (HTTP 400), e.g. a
 * schema feature or tool this model does not support. Not a key error.
 * @param {any} err
 * @returns {boolean}
 */
function isBadRequest(err) {
  const message = String((err && err.message) || '');
  return (
    (errorStatus(err) === 400 || /INVALID_ARGUMENT/i.test(message)) &&
    !/API key not valid|API_KEY_INVALID/i.test(message)
  );
}

/**
 * True when the request hit a rate limit or used-up quota.
 * @param {any} err
 * @returns {boolean}
 */
function isQuotaError(err) {
  const message = String((err && err.message) || '');
  return errorStatus(err) === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message);
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
    return new AppError(502, 'AI_KEY_INVALID', 'The story service is not set up correctly right now. Please try again later.');
  }
  if (isModelUnavailable(err)) {
    return new AppError(502, 'AI_MODEL_UNAVAILABLE', 'The story service is not available right now. Please try again later.');
  }
  if (isQuotaError(err)) {
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
    // Without JSON mode a model may add a sentence around the object.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
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
 * Asks Google which Flash models this key can use (for when none of the
 * known names work). Returns [] if listing is not possible.
 * @param {object} ai - GoogleGenAI instance.
 * @returns {Promise<string[]>}
 */
async function discoverFlashModels(ai) {
  if (!ai || !ai.models || typeof ai.models.list !== 'function') {
    return [];
  }
  const names = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const info of pager) {
      const name = String((info && info.name) || '').replace(/^models\//, '');
      const actions = (info && (info.supportedActions || info.supportedGenerationMethods)) || ['generateContent'];
      const usable = actions.includes('generateContent');
      if (usable && /flash/i.test(name) && !/(image|tts|audio|live|embed|vision|exp)/i.test(name)) {
        names.push(name);
      }
      if (names.length >= 15) break;
    }
  } catch (err) {
    console.warn('[gemini] could not list models:', err && err.message);
  }
  // Prefer stable names over previews, then newer versions first.
  return names.sort((a, b) => Number(/preview/i.test(a)) - Number(/preview/i.test(b)) || b.localeCompare(a));
}

/**
 * Creates the Gemini client. The API key stays on the server.
 * @param {{ apiKey: string, model: string, timeoutMs: number, grounding?: boolean, sdk?: object, now?: () => number }} options
 * @returns {{ generateStoryJson: (params: { systemInstruction: string, prompt: string, schema: object }) => Promise<{ data: unknown, sources: object[] }> }}
 */
function createGeminiClient({ apiKey, model, timeoutMs, grounding = true, sdk, now = Date.now }) {
  if (!apiKey) {
    return {
      generateStoryJson: async () => {
        throw new AppError(503, 'AI_NOT_CONFIGURED', 'The story service is not set up yet. Please try again later.');
      },
      checkStatus: async () => ({ configured: false, results: [] }),
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

  /** One call to the model. Options: Google Search on/off, JSON schema on/off. */
  async function callModel({ model: modelName, systemInstruction, prompt, schema, useSearch, useSchema }) {
    const ai = await getClient();
    const config = { systemInstruction, temperature: 0.8 };
    if (useSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = schema;
    }
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    const contents = useSchema ? prompt : `${prompt}\n\nReply with ONE JSON object only, no other text.`;
    const response = await withTimeout(ai.models.generateContent({ model: modelName, contents, config }), timeoutMs);
    return { data: parseJsonText(response.text), sources: useSearch ? extractSources(response) : [] };
  }

  let searchPausedUntil = 0;
  let workingModel = null; // remembered after the first success
  let discovered = false;

  /**
   * Tries one model in safe steps: with Google Search, then plain JSON mode,
   * then without the JSON schema (the reply is still validated afterwards).
   * Errors that mean "try another model" (unavailable, quota, key) stop early.
   */
  async function generateWithModel(modelName, params) {
    const attempts = [];
    if (grounding && now() >= searchPausedUntil) attempts.push({ useSearch: true, useSchema: true });
    attempts.push({ useSearch: false, useSchema: true }, { useSearch: false, useSchema: false });

    let lastError;
    for (const attempt of attempts) {
      try {
        return await callModel({ ...params, ...attempt, model: modelName });
      } catch (err) {
        lastError = err;
        if (err && err.code === 'AI_TIMEOUT') throw err;
        if (attempt.useSearch) {
          if (isQuotaError(err)) searchPausedUntil = now() + SEARCH_PAUSE_MS;
          console.warn(`[gemini] ${modelName}: search call failed, retrying without search:`, err && err.message);
          continue;
        }
        if (isModelUnavailable(err) || isQuotaError(err) || !isBadRequest(err)) throw err;
        console.warn(`[gemini] ${modelName}: request settings rejected, retrying more simply:`, err && err.message);
      }
    }
    throw lastError;
  }

  /**
   * Diagnostic: one tiny call per model, reporting what Google says.
   * Key-like strings are removed from messages; the key itself is never returned.
   */
  async function checkStatus() {
    const names = [...new Set([model, 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))];
    const results = [];
    for (const name of names) {
      try {
        const ai = await getClient();
        await withTimeout(ai.models.generateContent({ model: name, contents: 'Reply with the word OK.' }), 15000);
        results.push({ model: name, ok: true });
      } catch (err) {
        results.push({
          model: name,
          ok: false,
          status: (err && (err.status || err.code)) || null,
          message: redact(String((err && err.message) || err)).slice(0, 300),
        });
      }
    }
    return { configured: true, keyType: keyType(apiKey), results };
  }

  return {
    checkStatus,
    async generateStoryJson(params) {
      const queue = [...new Set([workingModel, model, ...FALLBACK_MODELS].filter(Boolean))];
      const tried = new Set();
      let lastError;
      while (queue.length > 0) {
        const modelName = queue.shift();
        if (tried.has(modelName)) continue;
        tried.add(modelName);
        try {
          const result = await generateWithModel(modelName, params);
          workingModel = modelName;
          return result;
        } catch (err) {
          lastError = err;
          const tryAnother = isModelUnavailable(err) || isQuotaError(err);
          if (!tryAnother) break;
          console.warn(`[gemini] model "${modelName}" is unavailable or out of quota, trying another`);
          if (queue.length === 0 && !discovered) {
            discovered = true;
            queue.push(...(await discoverFlashModels(await getClient())).filter((name) => !tried.has(name)));
          }
        }
      }
      throw toFriendlyError(lastError);
    },
  };
}

/** Removes anything that looks like an API key from a message. */
function redact(text) {
  return text.replace(/AIza[\w-]+|AQ\.[\w.-]+/g, '[key]');
}

/** Describes the key's format only (never the key). */
function keyType(key) {
  if (/^AIza/.test(key)) return 'AI Studio key (AIza…)';
  if (/^AQ\./.test(key)) return 'AQ.… key';
  return 'other format';
}

module.exports = {
  createGeminiClient,
  redact,
  withTimeout,
  parseJsonText,
  extractSources,
  toFriendlyError,
  isModelUnavailable,
  isQuotaError,
  isBadRequest,
  discoverFlashModels,
};
