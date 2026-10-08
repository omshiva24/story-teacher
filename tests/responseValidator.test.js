'use strict';

const { validateStoryResponse, cleanVisual, cleanGame, cleanPartVisual, cleanWikiTitle, InvalidStoryError, LIMITS } = require('../src/utils/responseValidator');
const { makeAiStory } = require('./fixtures');

describe('validateStoryResponse', () => {
  test('accepts a valid story and keeps only known fields', () => {
    const result = validateStoryResponse(makeAiStory({ extra: 'should be removed' }));
    expect(result.topicAccepted).toBe(true);
    expect(result.storyParts).toHaveLength(3);
    expect(result.quiz).toHaveLength(3);
    expect(result).not.toHaveProperty('extra');
  });

  test('passes through a rejected topic', () => {
    expect(validateStoryResponse({ topicAccepted: false })).toEqual({ topicAccepted: false });
  });

  test.each([
    ['not an object', 'hello'],
    ['an array', []],
    ['missing topicAccepted', { title: 'x' }],
    ['2 story parts', makeAiStory({ storyParts: ['a', 'b'] })],
    ['empty title', makeAiStory({ title: '   ' })],
    ['no concepts', makeAiStory({ keyConcepts: [] })],
    ['2 questions', makeAiStory({ quiz: makeAiStory().quiz.slice(0, 2) })],
  ])('rejects %s', (_, raw) => {
    expect(() => validateStoryResponse(raw)).toThrow(InvalidStoryError);
  });

  test('rejects an answerIndex outside the options', () => {
    const quiz = makeAiStory().quiz.map((q) => ({ ...q, answerIndex: 5 }));
    expect(() => validateStoryResponse(makeAiStory({ quiz }))).toThrow(/answerIndex/);
  });

  test('rejects duplicate concept ids', () => {
    const keyConcepts = [
      { id: 'c1', name: 'A', practiceTip: 'tip' },
      { id: 'c1', name: 'B', practiceTip: 'tip' },
    ];
    expect(() => validateStoryResponse(makeAiStory({ keyConcepts }))).toThrow(/unique/);
  });

  test('maps an unknown conceptId to a real concept', () => {
    const quiz = makeAiStory().quiz.map((q) => ({ ...q, conceptId: 'zzz' }));
    const result = validateStoryResponse(makeAiStory({ quiz }));
    const ids = result.keyConcepts.map((c) => c.id);
    result.quiz.forEach((q) => expect(ids).toContain(q.conceptId));
  });

  test('cuts over-long text', () => {
    const result = validateStoryResponse(makeAiStory({ title: 'x'.repeat(500) }));
    expect(result.title).toHaveLength(LIMITS.title);
  });

  test('keeps the category, fun fact, scene emojis, picture and game', () => {
    const result = validateStoryResponse(makeAiStory());
    expect(result.category).toBe('Plants');
    expect(result.funFact).toMatch(/oxygen/);
    expect(result.sceneEmojis).toEqual(['🌱😢', '☀️🍃💧', '🌻😊']);
    expect(result.visual.items).toHaveLength(4);
    expect(result.game.pairs).toHaveLength(4);
  });

  test('a broken picture or game is dropped but the story still works', () => {
    const result = validateStoryResponse(makeAiStory({ visual: 'oops', game: { pairs: [] }, sceneEmojis: null, category: '' }));
    expect(result.visual).toBe(null);
    expect(result.game).toBe(null);
    expect(result.sceneEmojis).toHaveLength(3);
    expect(result.category).toBe('Learning');
  });

  test('a missing emoji becomes an empty string', () => {
    const quiz = makeAiStory().quiz.map((q) => ({ ...q, options: q.options.map((o) => ({ text: o.text })) }));
    const result = validateStoryResponse(makeAiStory({ quiz }));
    expect(result.quiz[0].options[0].emoji).toBe('');
  });
});

describe('cleanVisual', () => {
  test('an unknown type becomes "steps" and items are capped at 6', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ label: `Step ${i}`, emoji: '🔹', detail: 'x' }));
    const visual = cleanVisual({ type: 'spiral', title: 'T', items });
    expect(visual.type).toBe('steps');
    expect(visual.items).toHaveLength(6);
  });

  test('fewer than 2 usable items gives null', () => {
    expect(cleanVisual({ type: 'cycle', title: 'T', items: [{ label: 'Only one' }, { label: '' }] })).toBe(null);
  });
});

describe('cleanGame', () => {
  test('drops duplicate terms or meanings, so every match fits only one word', () => {
    const game = cleanGame({
      instructions: 'Match',
      pairs: [
        { term: 'Sun', emoji: '☀️', match: 'Gives light' },
        { term: 'sun', emoji: '🌞', match: 'A star' },
        { term: 'Moon', emoji: '🌙', match: 'gives light' },
        { term: 'Earth', emoji: '🌍', match: 'Our home' },
        { term: 'Mars', emoji: '🔴', match: 'The red planet' },
      ],
    });
    expect(game.pairs.map((p) => p.term)).toEqual(['Sun', 'Earth', 'Mars']);
  });

  test('fewer than 3 pairs gives null', () => {
    expect(cleanGame({ pairs: [{ term: 'a', match: 'b' }] })).toBe(null);
  });
});

describe('per-part pictures and Wikipedia title', () => {
  test('keeps one diagram per story part', () => {
    const result = validateStoryResponse(makeAiStory());
    expect(result.partVisuals.map((v) => v.layout)).toEqual(['compare', 'flow', 'group']);
    expect(result.wikiTitle).toBe('Photosynthesis');
  });

  test('missing or broken part diagrams become null, always 3 entries', () => {
    const result = validateStoryResponse(makeAiStory({ partVisuals: [{ layout: 'flow', items: [] }] }));
    expect(result.partVisuals).toEqual([null, null, null]);
  });

  test('compare needs exactly 2 items, otherwise it becomes a group', () => {
    const visual = cleanPartVisual({
      layout: 'compare',
      caption: 'c',
      items: [{ emoji: '1', label: 'A' }, { emoji: '2', label: 'B' }, { emoji: '3', label: 'C' }],
    });
    expect(visual.layout).toBe('group');
  });

  test.each(['javascript:alert(1)', 'https://evil.example', '<b>x</b>', 'x'.repeat(101)])(
    'rejects a suspicious Wikipedia title: %s',
    (title) => {
      expect(cleanWikiTitle(title)).toBe('');
    },
  );

  test('accepts normal Wikipedia titles', () => {
    expect(cleanWikiTitle('A. P. J. Abdul Kalam')).toBe('A. P. J. Abdul Kalam');
    expect(cleanWikiTitle('Black hole')).toBe('Black hole');
  });
});
