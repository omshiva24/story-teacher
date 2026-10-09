'use strict';

/**
 * Builds a quick lesson from an encyclopedia introduction, without AI.
 * Used only when the AI is unavailable, so a search always gets an answer.
 * The result has the same shape as an AI story and is validated the same way.
 */

const { HERO_TOKEN } = require('./promptBuilder');
const { validateStoryResponse } = require('./responseValidator');

const STOP_WORDS = new Set(
  (
    'about above after again against among because before being below between both could during each every ' +
    'first from further having however into itself known large later least makes might other others ' +
    'often over same should since small some such than that their them then there these they this those ' +
    'through under until usually very were what when where which while whose with within would years also ' +
    'called including include includes along around based became become becomes different especially ' +
    'example found given good great important instead later light means million mostly named number ' +
    'parts people place several similar something sometimes still study things three times together ' +
    'types until using various world'
  ).split(' '),
);
const BACKUP_DISTRACTORS = ['energy', 'water', 'planet', 'animal', 'number', 'machine', 'river', 'forest'];

/**
 * Splits text into clean sentences (removes pronunciation brackets).
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  return text
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25 && sentence.length <= 240);
}

/**
 * Picks the most useful word in a sentence to turn into a gap.
 * @param {string} sentence
 * @param {Set<string>} avoid - Words from the topic title.
 * @returns {string|null}
 */
function pickKeyword(sentence, avoid) {
  const words = sentence.match(/[A-Za-z][A-Za-z-]{4,}/g) || [];
  const candidates = words.filter((word) => {
    const lower = word.toLowerCase();
    return !STOP_WORDS.has(lower) && !avoid.has(lower) && !avoid.has(lower.replace(/s$/, ''));
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, word) => (word.length > best.length ? word : best));
}

/**
 * Builds one multiple-choice "fill the gap" question.
 * @returns {object|null}
 */
function buildQuestion({ sentence, conceptId, answer, pool, optionsCount, index }) {
  const distractors = [...new Set(pool.filter((word) => word.toLowerCase() !== answer.toLowerCase()))]
    .concat(BACKUP_DISTRACTORS)
    .filter((word, i, all) => all.findIndex((w) => w.toLowerCase() === word.toLowerCase()) === i)
    .filter((word) => word.toLowerCase() !== answer.toLowerCase())
    .slice(0, optionsCount - 1);
  const options = [...distractors];
  const answerIndex = (index * 2 + 1) % optionsCount; // fixed, varied position
  options.splice(answerIndex, 0, answer);
  const gapped = sentence.replace(new RegExp(`\\b${answer}\\b`), '_____');
  return {
    question: `Help ${HERO_TOKEN} fill the gap: “${gapped}”`,
    conceptId,
    options: options.map((text) => ({ text, emoji: '' })),
    answerIndex,
    explanation: `The full sentence is: “${sentence}”`,
  };
}

/**
 * A short clue: the sentence with the word blanked out, trimmed around the gap.
 * @param {string} sentence
 * @param {string} word
 * @returns {string} At most about 85 characters.
 */
function makeClue(sentence, word) {
  const gapped = sentence.replace(new RegExp(`\\b${word}\\b`), '___').replace(/[.!?]$/, '');
  if (gapped.length <= 85) return gapped;
  const at = gapped.indexOf('___');
  const start = Math.max(0, Math.min(at - 40, gapped.length - 80));
  const piece = gapped.slice(start, start + 80);
  return `${start > 0 ? '…' : ''}${piece.trim()}…`;
}

/**
 * Matching game for the backup lesson: each word goes with the sentence it
 * completes. Uses sentences the quiz does not use, when there are enough.
 * @param {string[]} sentences
 * @param {Set<string>} quizSentences
 * @param {Set<string>} avoid - Topic words.
 * @returns {object|null}
 */
function buildGame(sentences, quizSentences, avoid) {
  const pick = (pool) => {
    const pairs = [];
    const used = new Set();
    for (const sentence of pool) {
      const word = pickKeyword(sentence, avoid);
      if (!word) continue;
      const stem = word.toLowerCase().replace(/(es|s)$/, '');
      if (used.has(stem)) continue;
      used.add(stem);
      pairs.push({ term: word.charAt(0).toUpperCase() + word.slice(1), emoji: '', match: makeClue(sentence, word) });
      if (pairs.length === 4) break;
    }
    return pairs;
  };
  let pairs = pick(sentences.filter((s) => !quizSentences.has(s)));
  if (pairs.length < 3) pairs = pick(sentences);
  return pairs.length >= 3 ? { instructions: 'Match each word with the sentence it completes.', pairs } : null;
}

/**
 * Builds a lesson from an article.
 * @param {{ article: { title: string, text: string, pageUrl: string, imageUrl: string, site: string }, band: object }} params
 * @returns {object|null} A validated story, or null if the text is too short.
 */
function buildFallbackLesson({ article, band }) {
  // A sentence starting with "It was…" makes no sense on its own: name the topic instead.
  const sentences = splitSentences(article.text).map((sentence) =>
    sentence.replace(/^(It|This)\s(?=(is|was|has|had|can|will|became|uses|means|makes)\b)/, `${article.title} `),
  );
  if (sentences.length < 3) return null;

  const perPart = band.id === 'early' ? 1 : band.id === 'primary' ? 2 : 3;
  const parts = [0, 1, 2].map((i) => sentences.slice(i * perPart, i * perPart + perPart)).map((group, i) =>
    group.length > 0 ? group : [sentences[Math.min(i, sentences.length - 1)]],
  );

  const title = article.title;
  const avoid = new Set(title.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const storyParts = [
    `${HERO_TOKEN} wanted to know about ${title}. ${parts[0].join(' ')}`,
    `${HERO_TOKEN} kept reading and learned more. ${parts[1].join(' ')}`,
    `Finally, ${HERO_TOKEN} found out: ${parts[2].join(' ')} Now ${HERO_TOKEN} could explain ${title} to everyone!`,
  ];

  const allWords = sentences.flatMap((s) => (s.match(/[A-Za-z][A-Za-z-]{4,}/g) || []).filter((w) => !STOP_WORDS.has(w.toLowerCase())));
  const keyConcepts = [];
  const quiz = [];
  const quizSentences = new Set();
  parts.forEach((group, i) => {
    const sentence = group.find((s) => pickKeyword(s, avoid)) || group[0];
    const answer = pickKeyword(sentence, avoid);
    if (!answer) return;
    quizSentences.add(sentence);
    const id = `c${i + 1}`;
    keyConcepts.push({
      id,
      name: answer.charAt(0).toUpperCase() + answer.slice(1),
      practiceTip:
        band.id === 'early' || band.id === 'primary'
          ? `With a grown-up, find a picture of “${answer}” and talk about it.`
          : `Explain “${answer}” in two sentences of your own, then check it against the source.`,
    });
    // Wrong choices: content words from other sentences, not from the topic
    // title, written the same way as the answer (lower-case vs Capitalised).
    const capitalised = /^[A-Z]/.test(answer);
    const pool = allWords.filter(
      (word) =>
        !sentence.includes(word) &&
        !avoid.has(word.toLowerCase()) &&
        /^[A-Z]/.test(word) === capitalised &&
        word.length >= 5,
    );
    quiz.push(buildQuestion({ sentence, conceptId: id, answer, pool, optionsCount: band.optionsPerQuestion, index: i }));
  });
  if (quiz.length < 3) return null;

  const story = validateStoryResponse({
    topicAccepted: true,
    category: article.site,
    title: `${HERO_TOKEN} and the secrets of ${title}`,
    storyParts,
    sceneEmojis: ['🔎📘', '💡📖', '🌟🎉'],
    partVisuals: parts.map((group, i) => {
      const words = [];
      group.forEach((sentence) => {
        const word = pickKeyword(sentence, avoid);
        if (word && !words.some((w) => w.toLowerCase() === word.toLowerCase())) words.push(word);
      });
      const labels = [title, ...words].slice(0, 3);
      return labels.length >= 2
        ? { layout: i === 1 ? 'flow' : 'group', caption: `Key ideas in part ${i + 1}`, items: labels.map((label, j) => ({ emoji: ['📘', '💡', '⭐'][j], label })) }
        : null;
    }),
    wikiTitle: '',
    funFact: sentences[sentences.length - 1],
    visual: {
      type: 'steps',
      title: `${title} in three ideas`,
      items: keyConcepts.map((concept, i) => ({ label: concept.name, emoji: ['1️⃣', '2️⃣', '3️⃣'][i], detail: parts[i][0] })),
    },
    game: buildGame(sentences, quizSentences, avoid),
    keyConcepts,
    quiz,
    nextChallenge: `Find one more fact about ${title} with a grown-up and add it to the story.`,
  });
  return story;
}

module.exports = { buildFallbackLesson, splitSentences, pickKeyword };
