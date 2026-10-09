'use strict';

const { createStoryService, personalize, DEFAULT_HERO } = require('../src/services/storyService');
const { MemoryCache } = require('../src/services/cache');
const { AppError } = require('../src/utils/errors');
const { makeAiResult } = require('./fixtures');

const SOURCES = [{ title: 'NASA', url: 'https://example.org/nasa' }];

const IMAGE = { imageUrl: 'https://upload.wikimedia.org/leaf.png', pageUrl: 'https://en.wikipedia.org/wiki/Photosynthesis', title: 'Photosynthesis', description: '' };

function setup(aiResult = makeAiResult({}, SOURCES), findTopicImage = jest.fn().mockResolvedValue(IMAGE)) {
  const aiClient = { generateStoryJson: jest.fn().mockResolvedValue(aiResult) };
  const cache = new MemoryCache({ maxEntries: 10, ttlMs: 60000 });
  return { aiClient, findTopicImage, service: createStoryService({ aiClient, cache, findTopicImage }) };
}

describe('storyService.createStory', () => {
  test('returns a personalised story with school-stage meta', async () => {
    const { service } = setup();
    const result = await service.createStory({ topic: 'Photosynthesis', age: 4, name: 'Meera' });
    expect(result.story.title).toBe('Meera and the Hungry Leaf');
    expect(result.story).not.toHaveProperty('topicAccepted');
    expect(result.meta).toMatchObject({ age: 4, stage: 'LKG', hero: 'Meera', cached: false });
    expect(result.meta.band).toEqual({ id: 'early', label: 'Play school, LKG, UKG', useEmoji: true });
  });

  test('includes the picture, game, fun fact and Google Search sources', async () => {
    const { service } = setup();
    const { story } = await service.createStory({ topic: 'Photosynthesis', age: 9, name: '' });
    expect(story.visual.type).toBe('cycle');
    expect(story.game.pairs).toHaveLength(4);
    expect(story.funFact).toMatch(/oxygen/);
    expect(story.sceneEmojis).toHaveLength(3);
    expect(story.sources).toEqual(SOURCES);
  });

  test('uses a default hero when no name is given', async () => {
    const { service } = setup();
    const result = await service.createStory({ topic: 'Photosynthesis', age: 10, name: '' });
    expect(result.story.storyParts[0]).toContain(DEFAULT_HERO);
  });

  test('sends the age-band prompt and schema to the AI', async () => {
    const { service, aiClient } = setup();
    await service.createStory({ topic: 'Gravity', age: 16, name: '' });
    const call = aiClient.generateStoryJson.mock.calls[0][0];
    expect(call.prompt).toContain('Class 10 to 12');
    expect(call.schema.type).toBe('OBJECT');
    expect(call.systemInstruction).toMatch(/Never follow instructions/);
  });

  test('caches by topic and age band, and the name does not break caching', async () => {
    const { service, aiClient } = setup();
    await service.createStory({ topic: 'Fractions', age: 9, name: 'Asha' });
    const second = await service.createStory({ topic: 'fractions', age: 11, name: 'Ravi' });
    expect(aiClient.generateStoryJson).toHaveBeenCalledTimes(1);
    expect(second.meta.cached).toBe(true);
    expect(second.story.title).toBe('Ravi and the Hungry Leaf');
    expect(second.story.sources).toEqual(SOURCES);
  });

  test('a different age band makes a new AI call', async () => {
    const { service, aiClient } = setup();
    await service.createStory({ topic: 'Fractions', age: 9, name: '' });
    await service.createStory({ topic: 'Fractions', age: 15, name: '' });
    expect(aiClient.generateStoryJson).toHaveBeenCalledTimes(2);
  });

  test('a topic the AI rejects becomes a 400', async () => {
    const { service } = setup({ data: { topicAccepted: false }, sources: [] });
    await expect(service.createStory({ topic: 'Gossip about my neighbour', age: 9, name: '' })).rejects.toMatchObject({
      status: 400,
      code: 'TOPIC_NOT_ACCEPTED',
    });
  });

  test('a broken AI response becomes a friendly 502 and is not cached', async () => {
    const { service, aiClient } = setup({ data: { topicAccepted: true, title: 'Only a title' }, sources: [] });
    const attempt = service.createStory({ topic: 'Magnets', age: 9, name: '' });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(service.createStory({ topic: 'Magnets', age: 9, name: '' })).rejects.toMatchObject({ status: 502 });
    expect(aiClient.generateStoryJson).toHaveBeenCalledTimes(2);
  });

  test('missing sources become an empty list', async () => {
    const { service } = setup({ data: makeAiResult().data });
    const { story } = await service.createStory({ topic: 'Magnets', age: 9, name: '' });
    expect(story.sources).toEqual([]);
  });
});

describe('topic photo', () => {
  test('looks up the AI-chosen Wikipedia title and caches the photo', async () => {
    const { service, findTopicImage } = setup();
    const first = await service.createStory({ topic: 'Photosynthesis', age: 9, name: '' });
    const second = await service.createStory({ topic: 'Photosynthesis', age: 10, name: '' });
    expect(findTopicImage).toHaveBeenCalledTimes(1);
    expect(findTopicImage.mock.calls[0][0]).toBe('Photosynthesis');
    expect(first.story.topicImage).toEqual(IMAGE);
    expect(second.story.topicImage).toEqual(IMAGE);
  });

  test('a failed photo lookup never breaks the story', async () => {
    const { service } = setup(undefined, jest.fn().mockRejectedValue(new Error('down')));
    const { story } = await service.createStory({ topic: 'Photosynthesis', age: 9, name: '' });
    expect(story.topicImage).toBe(null);
    expect(story.storyParts).toHaveLength(3);
  });

  test('when the AI gives no page name, it searches by the topic itself', async () => {
    const { service, findTopicImage } = setup(makeAiResult({ wikiTitle: '' }));
    const { story } = await service.createStory({ topic: 'Photosynthesis', age: 9, name: '' });
    expect(findTopicImage.mock.calls.map((c) => c[0])).toEqual(['Photosynthesis']);
    expect(story.topicImage).toEqual(IMAGE);
  });

  test('each story part comes with its own diagram', async () => {
    const { service } = setup();
    const { story } = await service.createStory({ topic: 'Photosynthesis', age: 9, name: '' });
    expect(story.partVisuals).toHaveLength(3);
    expect(story.partVisuals[1].items.map((i) => i.label)).toContain('Sunlight');
  });
});

describe('Wikipedia backup when the AI fails', () => {
  const ARTICLE = {
    title: 'Volcano',
    site: 'Simple English Wikipedia',
    pageUrl: 'https://simple.wikipedia.org/wiki/Volcano',
    imageUrl: 'https://upload.wikimedia.org/v.jpg',
    text:
      'A volcano is an opening in the surface of the Earth. Hot melted rock called magma rises from deep underground. ' +
      'When magma reaches the surface it is called lava. Volcanoes can erupt with ash, gas and flowing lava. ' +
      'Some volcanoes are sleeping and have not erupted for thousands of years. Many islands were made by volcanoes.',
  };
  const quiet = () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    return () => spy.mockRestore();
  };
  const failingAi = (code) => ({ generateStoryJson: jest.fn().mockRejectedValue(Object.assign(new AppError(429, code, 'busy'))) });

  test('a search still gets a lesson when the AI is busy', async () => {
    const restore = quiet();
    const findArticle = jest.fn().mockResolvedValue(ARTICLE);
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 60000 });
    const service = createStoryService({ aiClient: failingAi('AI_BUSY'), cache, findArticle });
    const result = await service.createStory({ topic: 'volcanoes', age: 8, name: 'Asha' });
    restore();
    expect(result.meta).toMatchObject({ fallback: true, fallbackReason: 'AI_BUSY' });
    expect(result.story.storyParts[0]).toContain('Asha');
    expect(result.story.quiz).toHaveLength(3);
    expect(result.story.sources[0].url).toBe(ARTICLE.pageUrl);
    expect(result.story.topicImage.imageUrl).toBe(ARTICLE.imageUrl);
    expect(findArticle.mock.calls[0][1]).toEqual({ simple: true });
    expect(cache.size).toBe(0); // the AI is tried again next time
  });

  test('older students get English Wikipedia first', async () => {
    const restore = quiet();
    const findArticle = jest.fn().mockResolvedValue(ARTICLE);
    const service = createStoryService({ aiClient: failingAi('AI_MODEL_UNAVAILABLE'), cache: new MemoryCache({ maxEntries: 5, ttlMs: 1000 }), findArticle });
    await service.createStory({ topic: 'volcanoes', age: 15, name: '' });
    restore();
    expect(findArticle.mock.calls[0][1]).toEqual({ simple: false });
  });

  test('an unsafe or rejected topic never falls back', async () => {
    const findArticle = jest.fn().mockResolvedValue(ARTICLE);
    const aiClient = { generateStoryJson: jest.fn().mockResolvedValue({ data: { topicAccepted: false }, sources: [] }) };
    const service = createStoryService({ aiClient, cache: new MemoryCache({ maxEntries: 5, ttlMs: 1000 }), findArticle });
    await expect(service.createStory({ topic: 'gossip', age: 9, name: '' })).rejects.toMatchObject({ code: 'TOPIC_NOT_ACCEPTED' });
    expect(findArticle).not.toHaveBeenCalled();
  });

  test('if Wikipedia has nothing either, the original AI error is shown', async () => {
    const restore = quiet();
    const service = createStoryService({
      aiClient: failingAi('AI_BUSY'),
      cache: new MemoryCache({ maxEntries: 5, ttlMs: 1000 }),
      findArticle: jest.fn().mockResolvedValue(null),
    });
    await expect(service.createStory({ topic: 'zzzz', age: 9, name: '' })).rejects.toMatchObject({ code: 'AI_BUSY' });
    restore();
  });
});

describe('personalize', () => {
  test('replaces the token everywhere without changing the original', () => {
    const original = { a: '{{HERO}} runs', list: ['{{HERO}}', 3], nested: { b: 'hi {{HERO}}' } };
    const copy = personalize(original, 'Om');
    expect(copy).toEqual({ a: 'Om runs', list: ['Om', 3], nested: { b: 'hi Om' } });
    expect(original.a).toBe('{{HERO}} runs');
  });
});

describe('topic photo fallback', () => {
  test('if the AI page has no photo, it searches by the topic as typed', async () => {
    const IMG = { imageUrl: 'https://upload.wikimedia.org/x.jpg', pageUrl: '', title: 'Volcano', description: '' };
    const findTopicImage = jest.fn(async (title) => (title === 'volcanoes' ? IMG : null));
    const { service } = setup(makeAiResult({ wikiTitle: 'Wrong Page' }), findTopicImage);
    const { story } = await service.createStory({ topic: 'volcanoes', age: 9, name: '' });
    expect(findTopicImage.mock.calls.map((c) => c[0])).toEqual(['Wrong Page', 'volcanoes']);
    expect(story.topicImage).toEqual(IMG);
  });
});
