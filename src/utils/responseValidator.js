'use strict';

/**
 * Checks the AI's JSON before the app uses it.
 * Returns a clean copy that contains only known fields, or throws.
 */

const LIMITS = Object.freeze({
  title: 120,
  storyPart: 2000,
  conceptName: 80,
  tip: 300,
  question: 300,
  optionText: 80,
  emoji: 8,
  explanation: 400,
  nextChallenge: 300,
  category: 40,
  sceneEmoji: 24,
  funFact: 300,
  visualLabel: 40,
  visualDetail: 160,
  gameTerm: 40,
  gameMatch: 90,
});

const VISUAL_TYPES = ['cycle', 'steps', 'parts'];
const PART_LAYOUTS = ['flow', 'group', 'compare'];
// Wikipedia titles: letters (any language), numbers, spaces and simple punctuation.
// No colons or slashes, so it can never look like a URL or a special page.
const WIKI_TITLE_PATTERN = /^[\p{L}\p{M}\p{N} .,'()\-&]{1,100}$/u;
const DEFAULT_SCENE = '📖✨';

class InvalidStoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidStoryError';
  }
}

/**
 * Returns a trimmed, length-limited string or throws.
 * @param {unknown} value
 * @param {number} max
 * @param {string} field
 * @param {boolean} [allowEmpty=false]
 * @returns {string}
 */
function cleanString(value, max, field, allowEmpty = false) {
  if (typeof value !== 'string') {
    throw new InvalidStoryError(`${field} must be a string`);
  }
  const text = value.trim();
  if (!allowEmpty && text.length === 0) {
    throw new InvalidStoryError(`${field} is empty`);
  }
  return text.slice(0, max);
}

/**
 * Checks a value is an array whose length is within a range.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} field
 * @returns {Array}
 */
function requireArray(value, min, max, field) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new InvalidStoryError(`${field} must have ${min} to ${max} items`);
  }
  return value;
}

/**
 * @param {unknown[]} rawConcepts
 * @returns {{ id: string, name: string, practiceTip: string }[]}
 */
function cleanConcepts(rawConcepts) {
  const concepts = requireArray(rawConcepts, 1, 3, 'keyConcepts').map((concept, index) => ({
    id: cleanString(concept && concept.id, 20, `keyConcepts[${index}].id`),
    name: cleanString(concept && concept.name, LIMITS.conceptName, `keyConcepts[${index}].name`),
    practiceTip: cleanString(concept && concept.practiceTip, LIMITS.tip, `keyConcepts[${index}].practiceTip`),
  }));
  const ids = new Set(concepts.map((concept) => concept.id));
  if (ids.size !== concepts.length) {
    throw new InvalidStoryError('keyConcepts ids must be unique');
  }
  return concepts;
}

/**
 * @param {unknown} rawOption
 * @param {string} field
 * @returns {{ text: string, emoji: string }}
 */
function cleanOption(rawOption, field) {
  const option = rawOption && typeof rawOption === 'object' ? rawOption : {};
  const emoji = typeof option.emoji === 'string' ? option.emoji.trim().slice(0, LIMITS.emoji) : '';
  return { text: cleanString(option.text, LIMITS.optionText, `${field}.text`), emoji };
}

/**
 * Cleans one quiz question. An unknown conceptId falls back to a real
 * concept so a small AI slip does not break the whole story.
 * @param {unknown} rawQuestion
 * @param {number} index
 * @param {{ id: string }[]} concepts
 * @returns {object}
 */
function cleanQuestion(rawQuestion, index, concepts) {
  const field = `quiz[${index}]`;
  const question = rawQuestion && typeof rawQuestion === 'object' ? rawQuestion : {};
  const options = requireArray(question.options, 2, 4, `${field}.options`).map((option, optionIndex) =>
    cleanOption(option, `${field}.options[${optionIndex}]`),
  );
  const { answerIndex } = question;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    throw new InvalidStoryError(`${field}.answerIndex is out of range`);
  }
  const knownId = concepts.some((concept) => concept.id === question.conceptId);
  return {
    question: cleanString(question.question, LIMITS.question, `${field}.question`),
    conceptId: knownId ? question.conceptId : concepts[index % concepts.length].id,
    options,
    answerIndex,
    explanation: cleanString(question.explanation, LIMITS.explanation, `${field}.explanation`),
  };
}

/**
 * Returns a short, safe string or a fallback (never throws).
 * @param {unknown} value
 * @param {number} max
 * @param {string} fallback
 * @returns {string}
 */
function optionalString(value, max, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

/**
 * Exactly 3 scene emoji strings, padded with a default when missing.
 * @param {unknown} raw
 * @returns {string[]}
 */
function cleanSceneEmojis(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((i) => optionalString(list[i], LIMITS.sceneEmoji, DEFAULT_SCENE));
}

/**
 * Cleans one per-part diagram (shown while that story part is read).
 * @param {unknown} raw
 * @returns {{ layout: string, caption: string, items: { emoji: string, label: string }[] } | null}
 */
function cleanPartVisual(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    return null;
  }
  const items = raw.items
    .map((item) => ({
      emoji: optionalString(item && item.emoji, LIMITS.emoji, '🔹'),
      label: optionalString(item && item.label, LIMITS.visualLabel),
    }))
    .filter((item) => item.label)
    .slice(0, 4);
  if (items.length < 2) {
    return null;
  }
  let layout = PART_LAYOUTS.includes(raw.layout) ? raw.layout : 'group';
  if (layout === 'compare' && items.length !== 2) {
    layout = 'group';
  }
  return { layout, caption: optionalString(raw.caption, LIMITS.visualDetail), items };
}

/**
 * Exactly 3 entries, one per story part; a broken one becomes null.
 * @param {unknown} raw
 * @returns {(object|null)[]}
 */
function cleanPartVisuals(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((i) => cleanPartVisual(list[i]));
}

/**
 * Keeps a Wikipedia title only if it looks like a plain article name.
 * @param {unknown} raw
 * @returns {string} The title, or '' when missing or suspicious.
 */
function cleanWikiTitle(raw) {
  const title = typeof raw === 'string' ? raw.trim() : '';
  return WIKI_TITLE_PATTERN.test(title) ? title : '';
}

/**
 * Cleans the picture plan. Extras (picture, game) are optional: a broken
 * one is dropped (null) so the story itself still works.
 * @param {unknown} raw
 * @returns {{ type: string, title: string, items: object[] } | null}
 */
function cleanVisual(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    return null;
  }
  const items = raw.items
    .map((item) => ({
      label: optionalString(item && item.label, LIMITS.visualLabel),
      emoji: optionalString(item && item.emoji, LIMITS.emoji, '🔹'),
      detail: optionalString(item && item.detail, LIMITS.visualDetail),
    }))
    .filter((item) => item.label)
    .slice(0, 6);
  if (items.length < 2) {
    return null;
  }
  return {
    type: VISUAL_TYPES.includes(raw.type) ? raw.type : 'steps',
    title: optionalString(raw.title, LIMITS.title, 'How it works'),
    items,
  };
}

/**
 * Cleans the matching game. Needs at least 3 pairs with unique terms and matches.
 * @param {unknown} raw
 * @returns {{ instructions: string, pairs: object[] } | null}
 */
function cleanGame(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pairs)) {
    return null;
  }
  const terms = new Set();
  const matches = new Set();
  const pairs = [];
  raw.pairs.forEach((pair) => {
    const term = optionalString(pair && pair.term, LIMITS.gameTerm);
    const match = optionalString(pair && pair.match, LIMITS.gameMatch);
    const key = (s) => s.toLowerCase();
    if (!term || !match || terms.has(key(term)) || matches.has(key(match))) {
      return;
    }
    terms.add(key(term));
    matches.add(key(match));
    pairs.push({ term, emoji: optionalString(pair.emoji, LIMITS.emoji), match });
  });
  if (pairs.length < 3) {
    return null;
  }
  return {
    instructions: optionalString(raw.instructions, LIMITS.question, 'Match each word with its meaning.'),
    pairs: pairs.slice(0, 5),
  };
}

/**
 * Validates the AI response.
 * @param {unknown} raw - Parsed JSON from the AI.
 * @returns {{ topicAccepted: false } | { topicAccepted: true, category: string, title: string, storyParts: string[], sceneEmojis: string[], funFact: string, visual: object|null, game: object|null, keyConcepts: object[], quiz: object[], nextChallenge: string }}
 * @throws {InvalidStoryError}
 */
function validateStoryResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidStoryError('Response must be an object');
  }
  if (typeof raw.topicAccepted !== 'boolean') {
    throw new InvalidStoryError('topicAccepted must be a boolean');
  }
  if (!raw.topicAccepted) {
    return { topicAccepted: false };
  }

  const keyConcepts = cleanConcepts(raw.keyConcepts);
  return {
    topicAccepted: true,
    category: optionalString(raw.category, LIMITS.category, 'Learning'),
    title: cleanString(raw.title, LIMITS.title, 'title'),
    storyParts: requireArray(raw.storyParts, 3, 3, 'storyParts').map((part, index) =>
      cleanString(part, LIMITS.storyPart, `storyParts[${index}]`),
    ),
    sceneEmojis: cleanSceneEmojis(raw.sceneEmojis),
    partVisuals: cleanPartVisuals(raw.partVisuals),
    wikiTitle: cleanWikiTitle(raw.wikiTitle),
    funFact: optionalString(raw.funFact, LIMITS.funFact),
    visual: cleanVisual(raw.visual),
    game: cleanGame(raw.game),
    keyConcepts,
    quiz: requireArray(raw.quiz, 3, 3, 'quiz').map((question, index) =>
      cleanQuestion(question, index, keyConcepts),
    ),
    nextChallenge: cleanString(raw.nextChallenge, LIMITS.nextChallenge, 'nextChallenge', true),
  };
}

module.exports = {
  validateStoryResponse,
  cleanVisual,
  cleanGame,
  cleanPartVisual,
  cleanWikiTitle,
  InvalidStoryError,
  LIMITS,
};
