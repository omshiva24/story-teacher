'use strict';

const { getBand, getSchoolStage } = require('../utils/ageBands');
const { AppError } = require('../utils/errors');
const { HERO_TOKEN, SYSTEM_INSTRUCTION, buildUserPrompt } = require('../utils/promptBuilder');
const { STORY_SCHEMA } = require('../utils/storySchema');
const { validateStoryResponse } = require('../utils/responseValidator');

const DEFAULT_HERO = 'Chintu';

/**
 * Cache key: same topic + same age band = same story.
 * @param {string} topic
 * @param {string} bandId
 * @returns {string}
 */
function buildCacheKey(topic, bandId) {
  return `${topic.toLowerCase()}|${bandId}`;
}

/**
 * Replaces the hero placeholder in every string of the story.
 * @param {unknown} value
 * @param {string} heroName
 * @returns {unknown} A new copy; the cached story is never changed.
 */
function personalize(value, heroName) {
  if (typeof value === 'string') {
    return value.split(HERO_TOKEN).join(heroName);
  }
  if (Array.isArray(value)) {
    return value.map((item) => personalize(item, heroName));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, personalize(item, heroName)]));
  }
  return value;
}

/**
 * Creates the story service.
 * @param {{ aiClient: { generateStoryJson: Function }, cache: { get: Function, set: Function }, findTopicImage?: (title: string) => Promise<object|null> }} deps
 * @returns {{ createStory: (input: { topic: string, age: number, name: string }) => Promise<object> }}
 */
function createStoryService({ aiClient, cache, findTopicImage }) {
  /**
   * Looks up a real photo for the topic; never fails the story.
   * @param {string} wikiTitle
   * @returns {Promise<object|null>}
   */
  async function lookUpImage(wikiTitle) {
    if (!findTopicImage || !wikiTitle) return null;
    try {
      return await findTopicImage(wikiTitle);
    } catch {
      return null;
    }
  }

  /**
   * Gets a validated story template from the cache or the AI.
   * @param {string} topic
   * @param {object} band
   * @returns {Promise<{ story: object, cached: boolean }>}
   */
  async function getStoryTemplate(topic, band) {
    const key = buildCacheKey(topic, band.id);
    const cachedStory = cache.get(key);
    if (cachedStory) {
      return { story: cachedStory, cached: true };
    }

    const { data, sources } = await aiClient.generateStoryJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildUserPrompt({ topic, band }),
      schema: STORY_SCHEMA,
    });

    let validated;
    try {
      validated = validateStoryResponse(data);
    } catch {
      throw new AppError(502, 'AI_BAD_RESPONSE', 'The story came back incomplete. Please try again.');
    }
    if (!validated.topicAccepted) {
      throw new AppError(
        400,
        'TOPIC_NOT_ACCEPTED',
        'Please choose a topic to learn about, like "black holes", "fractions" or "how bees make honey".',
      );
    }

    const story = {
      ...validated,
      sources: Array.isArray(sources) ? sources : [],
      topicImage: await lookUpImage(validated.wikiTitle),
    };
    cache.set(key, story);
    return { story, cached: false };
  }

  return {
    async createStory({ topic, age, name }) {
      const band = getBand(age);
      const { story, cached } = await getStoryTemplate(topic, band);
      const { topicAccepted, sources, ...storyContent } = story; // eslint-disable-line no-unused-vars
      const hero = name || DEFAULT_HERO;
      return {
        story: { ...personalize(storyContent, hero), sources },
        meta: {
          topic,
          age,
          hero,
          stage: getSchoolStage(age),
          band: { id: band.id, label: band.label, useEmoji: band.useEmoji },
          cached,
        },
      };
    },
  };
}

module.exports = { createStoryService, personalize, buildCacheKey, DEFAULT_HERO };
