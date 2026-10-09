'use strict';

const { getBand, getSchoolStage } = require('../utils/ageBands');
const { AppError } = require('../utils/errors');
const { HERO_TOKEN, SYSTEM_INSTRUCTION, buildUserPrompt } = require('../utils/promptBuilder');
const { STORY_SCHEMA } = require('../utils/storySchema');
const { validateStoryResponse } = require('../utils/responseValidator');
const { buildFallbackLesson } = require('../utils/lessonBuilder');

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
 * @param {{ aiClient: { generateStoryJson: Function }, cache: { get: Function, set: Function }, findTopicImage?: (title: string) => Promise<object|null>, findArticle?: (topic: string, opts: { simple: boolean }) => Promise<object|null> }} deps
 * @returns {{ createStory: (input: { topic: string, age: number, name: string }) => Promise<object> }}
 */
function createStoryService({ aiClient, cache, findTopicImage, findArticle }) {
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
   * Builds a quick lesson from Wikipedia when the AI cannot answer,
   * so a search always gets an answer. Returns null if nothing is found.
   * @param {string} topic
   * @param {object} band
   * @returns {Promise<object|null>}
   */
  async function getFallbackLesson(topic, band) {
    if (!findArticle) return null;
    try {
      const simple = band.id === 'early' || band.id === 'primary' || band.id === 'middle';
      const article = await findArticle(topic, { simple });
      const lesson = article && buildFallbackLesson({ article, band });
      if (!lesson) return null;
      return {
        ...lesson,
        sources: article.pageUrl ? [{ title: `${article.site}: ${article.title}`, url: article.pageUrl }] : [],
        topicImage: article.imageUrl
          ? { imageUrl: article.imageUrl, pageUrl: article.pageUrl, title: article.title, description: '' }
          : (await lookUpImage(article.title)) || (await lookUpImage(topic)),
      };
    } catch (err) {
      console.warn('[fallback] could not build a lesson:', err && err.message);
      return null;
    }
  }

  /**
   * Gets a validated story template: cache, then AI, then the Wikipedia backup.
   * @param {string} topic
   * @param {object} band
   * @returns {Promise<{ story: object, cached: boolean, fallbackReason?: string }>}
   */
  async function getStoryTemplate(topic, band) {
    const key = buildCacheKey(topic, band.id);
    const cachedStory = cache.get(key);
    if (cachedStory) {
      return { story: cachedStory, cached: true };
    }
    try {
      const story = await getAiStory(topic, band);
      cache.set(key, story);
      return { story, cached: false };
    } catch (err) {
      if (err && err.code === 'TOPIC_NOT_ACCEPTED') throw err;
      console.warn('[story] AI story failed, using the Wikipedia backup:', (err && (err.code || err.message)) || err);
      const lesson = await getFallbackLesson(topic, band);
      if (!lesson) throw err;
      // Not cached, so the full AI story is tried again next time.
      return { story: lesson, cached: false, fallbackReason: (err && err.code) || 'AI_ERROR' };
    }
  }

  /**
   * Asks the AI for a story and validates it.
   * @param {string} topic
   * @param {object} band
   * @returns {Promise<object>}
   */
  async function getAiStory(topic, band) {
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

    return {
      ...validated,
      sources: Array.isArray(sources) ? sources : [],
      // The AI's suggested page first, then the topic itself as typed.
      topicImage: (await lookUpImage(validated.wikiTitle)) || (await lookUpImage(topic)),
    };
  }

  return {
    async createStory({ topic, age, name }) {
      const band = getBand(age);
      const { story, cached, fallbackReason } = await getStoryTemplate(topic, band);
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
          ...(fallbackReason ? { fallback: true, fallbackReason } : {}),
        },
      };
    },
  };
}

module.exports = { createStoryService, personalize, buildCacheKey, DEFAULT_HERO };
