/*! Story Teacher · © 2026 P Om Shiva (M.Tech CSE, Pondicherry University). All rights reserved. Copying or reuse without written permission is not allowed. */
'use strict';

/**
 * Human-sounding narration with Gemini text-to-speech.
 * - A female or male storyteller voice, told to read warmly for children.
 * - The TTS model is found automatically from the models this key can use.
 * - Audio is cached (same story text → same audio), so a replay costs nothing.
 * - Any failure throws, and the browser falls back to its own voices.
 */

const crypto = require('crypto');
const { AppError } = require('../utils/errors');

const VOICES = Object.freeze({ female: 'Kore', male: 'Puck' });
const PREFERRED_MODELS = ['gemini-3.5-flash-tts', 'gemini-3-flash-tts', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts'];
const MAX_TEXT = 900;
const STYLE =
  'Read this aloud like a warm, friendly storyteller talking to a child: natural pauses, gentle excitement, clear Indian English. Read only the text after the colon:';

/**
 * Wraps raw 16-bit mono PCM in a WAV header so every browser can play it.
 * @param {Buffer} pcm
 * @param {number} sampleRate
 * @returns {Buffer}
 */
function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Reads "rate=24000" from a mime type like "audio/L16;codec=pcm;rate=24000". */
function sampleRateOf(mimeType) {
  const match = /rate=(\d{4,6})/.exec(String(mimeType || ''));
  return match ? Number(match[1]) : 24000;
}

/**
 * Makes the text safe and short enough for one audio clip.
 * @param {unknown} text
 * @returns {string}
 */
function cleanSpeechText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[<>{}[\]\\`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * @param {{ apiKey: string, model?: string, sdk?: object, timeoutMs?: number, maxEntries?: number }} options
 */
function createTtsService({ apiKey, model = '', sdk, timeoutMs = 25000, maxEntries = 40 }) {
  const audioCache = new Map(); // insertion order = age, for a simple LRU
  let clientPromise = null;
  let modelPromise = null;
  let disabledUntil = 0;

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

  /** Configured model, else the best TTS model this key can see. */
  function findModel() {
    if (model) return Promise.resolve(model);
    if (!modelPromise) {
      modelPromise = (async () => {
        const ai = await getClient();
        const names = [];
        const pager = await ai.models.list({ config: { pageSize: 100 } });
        for await (const m of pager) {
          const name = String((m && m.name) || '').replace(/^models\//, '');
          if (/tts/i.test(name)) names.push(name);
        }
        const preferred = PREFERRED_MODELS.find((p) => names.includes(p));
        const flash = names.find((n) => /flash/.test(n));
        const found = preferred || flash || names[0];
        if (!found) throw new AppError(503, 'TTS_UNAVAILABLE', 'No natural voice is available right now.');
        return found;
      })().catch((err) => {
        modelPromise = null;
        throw err;
      });
    }
    return modelPromise;
  }

  function remember(key, wav) {
    audioCache.set(key, wav);
    while (audioCache.size > maxEntries) audioCache.delete(audioCache.keys().next().value);
  }

  /**
   * @param {string} text
   * @param {'female'|'male'} voice
   * @returns {Promise<Buffer>} WAV audio
   */
  async function synthesize(text, voice) {
    if (!apiKey) throw new AppError(503, 'TTS_UNAVAILABLE', 'Natural voice is not set up.');
    const clean = cleanSpeechText(text);
    if (!clean) throw new AppError(400, 'INVALID_INPUT', 'Nothing to read.');
    const voiceName = VOICES[voice] || VOICES.female;
    const key = crypto.createHash('sha256').update(`${voiceName}|${clean}`).digest('hex');
    if (audioCache.has(key)) {
      const wav = audioCache.get(key);
      audioCache.delete(key);
      audioCache.set(key, wav);
      return wav;
    }
    if (Date.now() < disabledUntil) throw new AppError(503, 'TTS_BUSY', 'Natural voice is resting. Using the device voice.');

    try {
      const [ai, modelName] = await Promise.all([getClient(), findModel()]);
      let timer;
      const call = ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: `${STYLE} ${clean}` }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AppError(504, 'TTS_TIMEOUT', 'The voice took too long.')), timeoutMs);
      });
      const response = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));
      const parts = response?.candidates?.[0]?.content?.parts || [];
      const audio = parts.find((p) => p && p.inlineData && typeof p.inlineData.data === 'string');
      if (!audio) throw new AppError(502, 'TTS_FAILED', 'No audio came back.');
      const wav = pcmToWav(Buffer.from(audio.inlineData.data, 'base64'), sampleRateOf(audio.inlineData.mimeType));
      remember(key, wav);
      return wav;
    } catch (err) {
      const message = String((err && err.message) || '');
      // Out of quota: stop asking for a while; the browser voice takes over.
      if (/quota|RESOURCE_EXHAUSTED|429/i.test(message) || (err && err.status === 429)) disabledUntil = Date.now() + 10 * 60 * 1000;
      if (err instanceof AppError) throw err;
      console.warn('[tts] natural voice failed:', message.replace(/AIza[\w-]+|AQ\.[\w.-]+/g, '[key]').slice(0, 200));
      throw new AppError(503, 'TTS_FAILED', 'Natural voice is not available right now.');
    }
  }

  /** Diagnostic for the status page: which model, and does a tiny clip work. */
  async function checkStatus() {
    try {
      const modelName = await findModel();
      const wav = await synthesize('Hello!', 'female');
      return { ok: true, model: modelName, bytes: wav.length };
    } catch (err) {
      return { ok: false, code: (err && err.code) || null, message: String((err && err.message) || '').slice(0, 120) };
    }
  }

  return { synthesize, checkStatus, voices: Object.keys(VOICES) };
}

module.exports = { createTtsService, pcmToWav, sampleRateOf, cleanSpeechText, VOICES };
