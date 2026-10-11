'use strict';

const { createTtsService, pcmToWav, sampleRateOf, cleanSpeechText, VOICES } = require('../src/services/ttsService');

function fakeSdk({ models = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash'], fail = null } = {}) {
  const calls = [];
  const sdk = {
    GoogleGenAI: function GoogleGenAI() {
      this.models = {
        list: async () => (async function* gen() {
          for (const name of models) yield { name: `models/${name}` };
        })(),
        generateContent: async (request) => {
          calls.push(request);
          if (fail) throw fail;
          return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(480).toString('base64') } }] } }] };
        },
      };
    },
  };
  return { sdk, calls };
}

describe('tts helpers', () => {
  test('wraps PCM in a valid WAV header', () => {
    const wav = pcmToWav(Buffer.alloc(100), 24000);
    expect(wav.length).toBe(144);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(100);
  });

  test('reads the sample rate from the mime type', () => {
    expect(sampleRateOf('audio/L16;codec=pcm;rate=16000')).toBe(16000);
    expect(sampleRateOf('')).toBe(24000);
  });

  test('cleans and limits the text', () => {
    expect(cleanSpeechText('  Hi <b>there</b>  {x} ')).toBe('Hi b there /b x');
    expect(cleanSpeechText('a'.repeat(2000))).toHaveLength(900);
    expect(cleanSpeechText(42)).toBe('');
  });
});

describe('createTtsService', () => {
  test('finds a TTS model and returns WAV audio in the chosen voice', async () => {
    const { sdk, calls } = fakeSdk();
    const tts = createTtsService({ apiKey: 'k', sdk });
    const wav = await tts.synthesize('Meera saw a plant.', 'male');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(calls[0].model).toBe('gemini-2.5-flash-preview-tts');
    expect(calls[0].config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(VOICES.male);
    expect(calls[0].contents[0].parts[0].text).toContain('Meera saw a plant.');
  });

  test('caches audio for the same text and voice', async () => {
    const { sdk, calls } = fakeSdk();
    const tts = createTtsService({ apiKey: 'k', sdk });
    await tts.synthesize('Hello there.', 'female');
    await tts.synthesize('Hello there.', 'female');
    await tts.synthesize('Hello there.', 'male');
    expect(calls).toHaveLength(2);
  });

  test('fails clearly without a key, without a TTS model, or on errors', async () => {
    await expect(createTtsService({ apiKey: '' }).synthesize('Hi', 'female')).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
    const noModel = createTtsService({ apiKey: 'k', sdk: fakeSdk({ models: ['gemini-3.8-flash'] }).sdk });
    await expect(noModel.synthesize('Hi', 'female')).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
    const broken = createTtsService({ apiKey: 'k', sdk: fakeSdk({ fail: new Error('boom AIzaSECRET') }).sdk });
    await expect(broken.synthesize('Hi', 'female')).rejects.toMatchObject({ code: 'TTS_FAILED' });
  });

  test('rests after a quota error so the device voice takes over', async () => {
    const quota = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    const { sdk, calls } = fakeSdk({ fail: quota });
    const tts = createTtsService({ apiKey: 'k', sdk });
    await expect(tts.synthesize('One', 'female')).rejects.toMatchObject({ code: 'TTS_FAILED' });
    await expect(tts.synthesize('Two', 'female')).rejects.toMatchObject({ code: 'TTS_BUSY' });
    expect(calls).toHaveLength(1);
  });

  test('status check reports the model', async () => {
    const tts = createTtsService({ apiKey: 'k', sdk: fakeSdk().sdk });
    await expect(tts.checkStatus()).resolves.toMatchObject({ ok: true, model: 'gemini-2.5-flash-preview-tts' });
  });
});
