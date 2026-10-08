'use strict';

const { scoreQuiz, getUnderstandingLevel, buildReport, gameStars } = require('../src/utils/scoring');
const { validateStoryResponse } = require('../src/utils/responseValidator');
const { makeAiStory } = require('./fixtures');

const story = validateStoryResponse(makeAiStory());

describe('scoreQuiz', () => {
  test('all correct', () => {
    expect(scoreQuiz(story.quiz, [0, 1, 1])).toMatchObject({ correct: 3, total: 3, percent: 100 });
  });

  test('some wrong and an unanswered question', () => {
    expect(scoreQuiz(story.quiz, [0, 0, null])).toMatchObject({ correct: 1, total: 3, percent: 33 });
  });
});

describe('getUnderstandingLevel', () => {
  test.each([
    [3, 3, 'Understood well'],
    [2, 3, 'Mostly understood'],
    [1, 3, 'Needs another go'],
    [0, 3, 'Needs another go'],
  ])('%i of %i is "%s"', (correct, total, level) => {
    expect(getUnderstandingLevel(correct, total)).toBe(level);
  });
});

describe('buildReport', () => {
  test('perfect score suggests the next challenge', () => {
    const report = buildReport(story, [0, 1, 1]);
    expect(report.understood.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(report.missed).toEqual([]);
    expect(report.practiceSuggestion).toBe(story.nextChallenge);
  });

  test('a concept counts as missed if any of its questions is wrong', () => {
    // c1 has questions 0 and 2; question 2 is wrong.
    const report = buildReport(story, [0, 1, 0]);
    expect(report.understood.map((c) => c.id)).toEqual(['c2']);
    expect(report.missed.map((c) => c.id)).toEqual(['c1']);
    expect(report.practiceSuggestion).toBe(story.keyConcepts[0].practiceTip);
    expect(report.level).toBe('Mostly understood');
  });
});

describe('gameStars', () => {
  test.each([
    [4, 4, 3],
    [6, 4, 2],
    [7, 4, 1],
  ])('%i tries for %i pairs gives %i stars', (tries, pairs, stars) => {
    expect(gameStars(tries, pairs)).toBe(stars);
  });
});
