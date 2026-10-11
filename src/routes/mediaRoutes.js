/*! Story Teacher · © 2026 P Om Shiva (M.Tech CSE, Pondicherry University). All rights reserved. Copying or reuse without written permission is not allowed. */
'use strict';

const express = require('express');
const { validateTopic } = require('../utils/validation');
const { checkTopicSafety } = require('../utils/safety');
const { AppError } = require('../utils/errors');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Extra lesson media: moving pictures from Wikipedia and natural narration.
 * @param {{ findMedia?: Function, tts?: { synthesize: Function } }} deps
 * @returns {import('express').Router}
 */
function createMediaRouter({ findMedia, tts }) {
  const router = express.Router();

  /** GET /api/media?title=Water cycle → GIFs, short videos and diagrams from that article. */
  router.get(
    '/media',
    asyncHandler(async (req, res) => {
      const { value, error } = validateTopic(req.query.title);
      if (error) throw new AppError(400, 'INVALID_INPUT', error);
      if (!checkTopicSafety(value).safe) throw new AppError(400, 'UNSAFE_TOPIC', 'That topic is not suitable here.');
      const media = findMedia ? await findMedia(value) : { title: '', moving: [], pictures: [] };
      res.set('Cache-Control', 'public, max-age=3600');
      res.json(media);
    }),
  );

  /** POST /api/voice { text, voice: 'female'|'male' } → WAV audio of a storyteller reading the text. */
  router.post(
    '/voice',
    asyncHandler(async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const text = typeof body.text === 'string' ? body.text : '';
      const voice = body.voice === 'male' ? 'male' : 'female';
      if (text.trim().length < 1 || text.length > 900) throw new AppError(400, 'INVALID_INPUT', 'Text must be 1 to 900 characters.');
      // Story text can say things like "you are now inside a leaf", so only
      // the unsafe-word check applies here, not the prompt-injection check.
      if (checkTopicSafety(text).reason === 'unsafe') throw new AppError(400, 'UNSAFE_TOPIC', 'That text cannot be read aloud.');
      if (!tts) throw new AppError(503, 'TTS_UNAVAILABLE', 'Natural voice is not set up.');
      const wav = await tts.synthesize(text, voice);
      res.set('Content-Type', 'audio/wav');
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(wav);
    }),
  );

  return router;
}

module.exports = { createMediaRouter };
