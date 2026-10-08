/**
 * Quiz scoring and the parent/teacher report summary.
 * Shared by the browser (window.Scoring) and the tests (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Scoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Scores the child's answers.
   * @param {{ answerIndex: number, conceptId: string }[]} quiz
   * @param {(number|null)[]} answers - Chosen option index per question.
   * @returns {{ correct: number, total: number, percent: number, results: { correct: boolean, conceptId: string }[] }}
   */
  function scoreQuiz(quiz, answers) {
    const results = quiz.map((question, index) => ({
      correct: answers[index] === question.answerIndex,
      conceptId: question.conceptId,
    }));
    const correct = results.filter((result) => result.correct).length;
    const total = quiz.length;
    const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
    return { correct, total, percent, results };
  }

  /**
   * Turns a score into a plain-language level for parents and teachers.
   * @param {number} correct
   * @param {number} total
   * @returns {string}
   */
  function getUnderstandingLevel(correct, total) {
    if (total > 0 && correct === total) {
      return 'Understood well';
    }
    if (correct >= Math.ceil(total / 2)) {
      return 'Mostly understood';
    }
    return 'Needs another go';
  }

  /**
   * Splits concepts into understood (every question right) and missed.
   * @param {{ id: string, name: string }[]} concepts
   * @param {{ correct: boolean, conceptId: string }[]} results
   * @returns {{ understood: object[], missed: object[] }}
   */
  function splitConcepts(concepts, results) {
    const understood = [];
    const missed = [];
    concepts.forEach((concept) => {
      const related = results.filter((result) => result.conceptId === concept.id);
      if (related.length === 0) {
        return;
      }
      (related.every((result) => result.correct) ? understood : missed).push(concept);
    });
    return { understood, missed };
  }

  /**
   * Stars for the matching game: fewer tries = more stars (1 to 3).
   * @param {number} tries - Total match attempts.
   * @param {number} pairs - Number of pairs in the game.
   * @returns {number}
   */
  function gameStars(tries, pairs) {
    if (tries <= pairs) return 3;
    if (tries <= pairs + 2) return 2;
    return 1;
  }

  /**
   * Builds everything the report screen shows.
   * @param {{ quiz: object[], keyConcepts: object[], nextChallenge: string }} story
   * @param {(number|null)[]} answers
   * @returns {object}
   */
  function buildReport(story, answers) {
    const score = scoreQuiz(story.quiz, answers);
    const { understood, missed } = splitConcepts(story.keyConcepts, score.results);
    const practiceSuggestion =
      missed.length > 0
        ? missed[0].practiceTip
        : story.nextChallenge || story.keyConcepts[0].practiceTip;
    return {
      correct: score.correct,
      total: score.total,
      percent: score.percent,
      level: getUnderstandingLevel(score.correct, score.total),
      understood,
      missed,
      practiceSuggestion,
    };
  }

  return Object.freeze({ scoreQuiz, getUnderstandingLevel, splitConcepts, gameStars, buildReport });
});
