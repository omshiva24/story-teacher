'use strict';

const { MIN_AGE, MAX_AGE, isSupportedAge } = require('./ageBands');

const TOPIC_MIN = 2;
const TOPIC_MAX = 100;
const NAME_MAX = 30;

// Letters (any language, including vowel signs \p{M} used in Hindi, Tamil, etc.),
// numbers, spaces and basic punctuation only. Angle brackets, braces and quotes
// are not allowed, so user text cannot fake the prompt delimiters or inject markup.
const TOPIC_PATTERN = /^[\p{L}\p{M}\p{N} .,'?!()+\-=/&:%]+$/u;
const NAME_PATTERN = /^[\p{L}\p{M} ]+$/u;

/**
 * Trims and collapses repeated whitespace.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Validates and normalises the topic.
 * @param {unknown} topic
 * @returns {{ value?: string, error?: string }}
 */
function validateTopic(topic) {
  if (typeof topic !== 'string') {
    return { error: 'Please enter a topic.' };
  }
  const value = cleanText(topic);
  if (value.length < TOPIC_MIN || value.length > TOPIC_MAX) {
    return { error: `The topic must be ${TOPIC_MIN} to ${TOPIC_MAX} characters long.` };
  }
  if (!TOPIC_PATTERN.test(value)) {
    return { error: 'The topic can use only letters, numbers and basic punctuation.' };
  }
  return { value };
}

/**
 * Validates the age. Accepts a whole number or a string of digits.
 * @param {unknown} age
 * @returns {{ value?: number, error?: string }}
 */
function validateAge(age) {
  const isDigits = typeof age === 'string' && /^\d{1,2}$/.test(age.trim());
  const value = typeof age === 'number' ? age : isDigits ? Number(age.trim()) : NaN;
  if (!isSupportedAge(value)) {
    return { error: `Age must be a whole number from ${MIN_AGE} to ${MAX_AGE}.` };
  }
  return { value };
}

/**
 * Validates the optional child name.
 * @param {unknown} name
 * @returns {{ value?: string, error?: string }}
 */
function validateName(name) {
  if (name === undefined || name === null || name === '') {
    return { value: '' };
  }
  if (typeof name !== 'string') {
    return { error: 'The name must be text.' };
  }
  const value = cleanText(name);
  if (value.length > NAME_MAX) {
    return { error: `The name can be at most ${NAME_MAX} characters.` };
  }
  if (value && !NAME_PATTERN.test(value)) {
    return { error: 'The name can use only letters and spaces.' };
  }
  return { value };
}

/**
 * Validates the whole story request body.
 * @param {unknown} body
 * @returns {{ value?: { topic: string, age: number, name: string }, errors?: string[] }}
 */
function validateStoryRequest(body) {
  const input = body && typeof body === 'object' ? body : {};
  const topic = validateTopic(input.topic);
  const age = validateAge(input.age);
  const name = validateName(input.name);

  const errors = [topic.error, age.error, name.error].filter(Boolean);
  if (errors.length > 0) {
    return { errors };
  }
  return { value: { topic: topic.value, age: age.value, name: name.value } };
}

module.exports = {
  TOPIC_MIN,
  TOPIC_MAX,
  NAME_MAX,
  cleanText,
  validateTopic,
  validateAge,
  validateName,
  validateStoryRequest,
};
