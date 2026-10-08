'use strict';

const { createGeminiClient, withTimeout, parseJsonText, extractSources, toFriendlyError } = require('../src/services/geminiService');

/**
 * A fake Gen AI SDK so tests never call the real API.
 * @param {Function} generateContent
 */
function fakeSdk(generateContent) {
  return {
    GoogleGenAI: class {
      constructor() {
        this.models = { generateContent };
      }
    },
  };
}

const groundedResponse = {
  text: '{"topicAccepted":false}',
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://a.example/1', title: 'Site A' } },
          { web: { uri: 'https://a.example/1', title: 'Duplicate' } },
          { web: { uri: 'http://insecure.example', title: 'Not https' } },
          { web: { uri: 'https://b.example/2', title: '' } },
        ],
      },
    },
  ],
};

describe('createGeminiClient', () => {
  test('without an API key it fails with a friendly 503 instead of crashing', async () => {
    const client = createGeminiClient({ apiKey: '', model: 'x', timeoutMs: 1000 });
    await expect(client.generateStoryJson({})).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' });
  });

  test('uses Google Search, JSON mode and the schema, and returns sources', async () => {
    const generateContent = jest.fn().mockResolvedValue(groundedResponse);
    const client = createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 1000, sdk: fakeSdk(generateContent) });
    const result = await client.generateStoryJson({ systemInstruction: 's', prompt: 'p', schema: { type: 'OBJECT' } });

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('m');
    expect(request.config.tools).toEqual([{ googleSearch: {} }]);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema).toEqual({ type: 'OBJECT' });
    expect(result.data).toEqual({ topicAccepted: false });
    expect(result.sources).toHaveLength(2);
  });

  test('falls back to a call without search if the grounded call fails', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const generateContent = jest
      .fn()
      .mockRejectedValueOnce(new Error('tools not supported'))
      .mockResolvedValueOnce({ text: '{"topicAccepted":false}' });
    const client = createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 1000, sdk: fakeSdk(generateContent) });
    const result = await client.generateStoryJson({ systemInstruction: 's', prompt: 'p', schema: {} });
    spy.mockRestore();

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].config.tools).toBeUndefined();
    expect(result).toEqual({ data: { topicAccepted: false }, sources: [] });
  });

  test('does not search when grounding is turned off', async () => {
    const generateContent = jest.fn().mockResolvedValue({ text: '{"topicAccepted":false}' });
    const client = createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 1000, grounding: false, sdk: fakeSdk(generateContent) });
    await client.generateStoryJson({ systemInstruction: 's', prompt: 'p', schema: {} });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config.tools).toBeUndefined();
  });
});

describe('parseJsonText', () => {
  test('parses plain JSON and fenced JSON', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('bad JSON becomes a friendly 502', () => {
    expect(() => parseJsonText('not json')).toThrow(/strange shape/);
  });
});

describe('extractSources', () => {
  test('keeps unique https links and gives a default title', () => {
    expect(extractSources(groundedResponse)).toEqual([
      { title: 'Site A', url: 'https://a.example/1' },
      { title: 'Source', url: 'https://b.example/2' },
    ]);
  });

  test('returns an empty list when there is no grounding data', () => {
    expect(extractSources({})).toEqual([]);
  });
});

describe('withTimeout', () => {
  test('returns the result when fast enough', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  test('rejects with a 504 when too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 200));
    await expect(withTimeout(slow, 10)).rejects.toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
  });
});

describe('model fallback and friendly errors', () => {
  const quiet = () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    return () => {
      warn.mockRestore();
      error.mockRestore();
    };
  };
  const notFound = () => Object.assign(new Error('models/old-model is not found for API version v1beta'), { status: 404 });

  test('tries the next model when the configured one is not available', async () => {
    const restore = quiet();
    const generateContent = jest
      .fn()
      .mockRejectedValueOnce(notFound())
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ text: '{"topicAccepted":false}' });
    const client = createGeminiClient({ apiKey: 'k', model: 'old-model', timeoutMs: 1000, sdk: fakeSdk(generateContent) });
    const result = await client.generateStoryJson({ systemInstruction: 's', prompt: 'p', schema: {} });
    restore();
    expect(generateContent.mock.calls[0][0].model).toBe('old-model');
    expect(generateContent.mock.calls[2][0].model).toBe('gemini-3.8-flash');
    expect(result.data).toEqual({ topicAccepted: false });
  });

  test('an invalid key gives a clear message and does not try other models', async () => {
    const restore = quiet();
    const badKey = Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 });
    const generateContent = jest.fn().mockRejectedValue(badKey);
    const client = createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 1000, sdk: fakeSdk(generateContent) });
    await expect(client.generateStoryJson({ systemInstruction: 's', prompt: 'p', schema: {} })).rejects.toMatchObject({
      code: 'AI_KEY_INVALID',
    });
    restore();
    expect(generateContent).toHaveBeenCalledTimes(2); // with search, then without
  });

  test.each([
    [{ status: 429, message: 'Resource has been exhausted (e.g. check quota).' }, 429, 'AI_BUSY'],
    [{ status: 503, message: 'The model is overloaded.' }, 503, 'AI_OVERLOADED'],
    [{ status: 500, message: 'Internal error' }, 502, 'STORY_FAILED'],
  ])('maps %p to a friendly error', (raw, status, code) => {
    const restore = quiet();
    const friendly = toFriendlyError(Object.assign(new Error(raw.message), { status: raw.status }));
    restore();
    expect(friendly).toMatchObject({ status, code });
  });

  test('keeps errors that are already friendly', () => {
    const timeout = toFriendlyError(Object.assign(new Error('x'), { status: 404 }));
    expect(timeout.code).toBe('AI_MODEL_UNAVAILABLE');
  });
});
