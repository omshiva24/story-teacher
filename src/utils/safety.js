'use strict';

/**
 * Server-side safety filter that runs BEFORE the AI is called.
 * It blocks clearly unsafe topics and obvious prompt-injection attempts.
 * The AI's system prompt is a second layer: it rejects anything that is
 * not a child-safe school concept (topicAccepted = false).
 *
 * Words are matched as whole words, so school topics such as
 * "sexual reproduction in plants" or "alcohols" (chemistry) are not blocked.
 * The list is kept short on purpose; borderline topics go to the AI layer.
 */

const UNSAFE_WORDS = [
  'porn',
  'porno',
  'pornography',
  'sex',
  'sexy',
  'nude',
  'nudes',
  'naked',
  'erotic',
  'fetish',
  'murder',
  'suicide',
  'gore',
  'torture',
  'terrorist',
  'terrorism',
  'gun',
  'guns',
  'cocaine',
  'heroin',
  'meth',
  'gambling',
  'betting',
  'casino',
];

const UNSAFE_PHRASES = ['self harm', 'self-harm', 'make a bomb', 'build a bomb', 'how to hack'];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)/i,
  /disregard\s+(all\s+)?(the\s+)?(previous|prior|above|instructions)/i,
  /system\s+prompt/i,
  /you\s+are\s+now/i,
  /pretend\s+(to\s+be|you)/i,
  /new\s+instructions/i,
  /jailbreak/i,
];

/**
 * Lower-cases and swaps common look-alike characters (e.g. "s3x" -> "sex").
 * @param {string} text
 * @returns {string}
 */
function normalizeForSafety(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

/**
 * Checks whether a topic is safe to send to the AI.
 * @param {string} topic - An already validated topic.
 * @returns {{ safe: boolean, reason?: 'unsafe' | 'injection' }}
 */
function checkTopicSafety(topic) {
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(topic))) {
    return { safe: false, reason: 'injection' };
  }

  const normalized = normalizeForSafety(topic);
  const words = new Set(normalized.split(/[^a-z]+/).filter(Boolean));
  const hasUnsafeWord = UNSAFE_WORDS.some((word) => words.has(word));
  const hasUnsafePhrase = UNSAFE_PHRASES.some((phrase) => normalized.includes(phrase));

  if (hasUnsafeWord || hasUnsafePhrase) {
    return { safe: false, reason: 'unsafe' };
  }
  return { safe: true };
}

module.exports = { checkTopicSafety, normalizeForSafety };
