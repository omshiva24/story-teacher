'use strict';

const express = require('express');
const { validateStoryRequest } = require('../utils/validation');
const { checkTopicSafety } = require('../utils/safety');
const { AppError } = require('../utils/errors');
const { asyncHandler } = require('../middleware/errorHandler');

const SAFETY_MESSAGES = {
  unsafe: 'That topic is not suitable here. Please choose something to learn about.',
  injection: 'Please type only a topic name, like "volcanoes".',
};

/**
 * Creates the story API router.
 * @param {{ storyService: { createStory: Function } }} deps
 * @returns {import('express').Router}
 */
function createStoryRouter({ storyService, checkAiStatus }) {
  const router = express.Router();

  // Diagnostic: is the AI reachable with the deployed key? Cached for a minute.
  let statusCache = null;
  router.get(
    '/ai-status',
    asyncHandler(async (req, res) => {
      if (!checkAiStatus) throw new AppError(404, 'NOT_FOUND', 'Not available.');
      if (!statusCache || Date.now() - statusCache.at > 60000) {
        statusCache = { at: Date.now(), value: await checkAiStatus() };
      }
      res.set('Cache-Control', 'no-store');
      res.json(statusCache.value);
    }),
  );

  router.post(
    '/story',
    asyncHandler(async (req, res) => {
      const { value, errors } = validateStoryRequest(req.body);
      if (errors) {
        throw new AppError(400, 'INVALID_INPUT', errors.join(' '));
      }

      const safety = checkTopicSafety(value.topic);
      if (!safety.safe) {
        throw new AppError(400, 'UNSAFE_TOPIC', SAFETY_MESSAGES[safety.reason]);
      }

      const result = await storyService.createStory(value);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    }),
  );

  return router;
}

module.exports = { createStoryRouter };
