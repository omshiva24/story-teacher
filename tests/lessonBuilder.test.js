'use strict';

const { buildFallbackLesson, splitSentences, pickKeyword } = require('../src/utils/lessonBuilder');
const { getBand } = require('../src/utils/ageBands');

const ARTICLE = {
  title: 'Solar System',
  site: 'Simple English Wikipedia',
  pageUrl: 'https://simple.wikipedia.org/wiki/Solar_System',
  imageUrl: 'https://upload.wikimedia.org/solar.png',
  text:
    'The Solar System (sometimes called the solar system) is the Sun and all the objects that orbit around it. ' +
    'The Sun is a star at the centre of the system. Eight planets travel around the Sun in paths called orbits. ' +
    'The four inner planets are rocky and are called terrestrial planets. The four outer planets are giants made mostly of gas. ' +
    'Jupiter is the largest planet and has dozens of moons. Many smaller bodies such as asteroids and comets also orbit the Sun. ' +
    'Pluto is now called a dwarf planet.',
};

describe('splitSentences', () => {
  test('splits into clean sentences and removes brackets', () => {
    const sentences = splitSentences(ARTICLE.text);
    expect(sentences[0]).toBe('The Solar System is the Sun and all the objects that orbit around it.');
    expect(sentences.length).toBeGreaterThan(5);
  });
});

describe('pickKeyword', () => {
  test('picks a content word that is not part of the topic', () => {
    const word = pickKeyword('Eight planets travel around the Sun in paths called orbits.', new Set(['solar', 'system']));
    expect(word).toBe('planets');
  });
});

describe('buildFallbackLesson', () => {
  test.each([4, 7, 10, 13, 16])('builds a complete lesson for age %i', (age) => {
    const band = getBand(age);
    const lesson = buildFallbackLesson({ article: ARTICLE, band });
    expect(lesson.storyParts).toHaveLength(3);
    expect(lesson.storyParts[0]).toContain('{{HERO}}');
    expect(lesson.quiz).toHaveLength(3);
    lesson.quiz.forEach((q) => {
      expect(q.options).toHaveLength(band.optionsPerQuestion);
      expect(q.question).toContain('_____');
      expect(q.options[q.answerIndex].text.length).toBeGreaterThan(4);
    });
    expect(lesson.keyConcepts.length).toBe(3);
    expect(lesson.visual.type).toBe('steps');
    expect(lesson.game.pairs.length).toBeGreaterThan(2);
  });

  test('younger children get shorter parts', () => {
    const early = buildFallbackLesson({ article: ARTICLE, band: getBand(4) });
    const senior = buildFallbackLesson({ article: ARTICLE, band: getBand(16) });
    expect(early.storyParts[1].length).toBeLessThan(senior.storyParts[1].length);
  });

  test('the right answer is in the question sentence, distractors are not', () => {
    const lesson = buildFallbackLesson({ article: ARTICLE, band: getBand(10) });
    const q = lesson.quiz[0];
    const answer = q.options[q.answerIndex].text;
    expect(q.explanation).toContain(answer);
    expect(q.question).not.toContain(answer);
  });

  test('returns null when the text is too short', () => {
    expect(buildFallbackLesson({ article: { ...ARTICLE, text: 'Too short.' }, band: getBand(9) })).toBe(null);
  });
});

describe('backup lesson matching game', () => {
  test('has 3 or 4 pairs with unique words, each clue blanks its own word', () => {
    const lesson = buildFallbackLesson({ article: ARTICLE, band: getBand(10) });
    expect(lesson.game).not.toBe(null);
    const terms = lesson.game.pairs.map((p) => p.term.toLowerCase().replace(/(es|s)$/, ''));
    expect(new Set(terms).size).toBe(terms.length);
    expect(lesson.game.pairs.length).toBeGreaterThan(2);
    lesson.game.pairs.forEach((p) => {
      expect(p.match).toContain('___');
      expect(p.match.toLowerCase()).not.toContain(p.term.toLowerCase());
    });
  });
});
