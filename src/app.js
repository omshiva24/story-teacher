'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createStoryRouter } = require('./routes/storyRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SHARED_FILES = ['ageBands.js', 'scoring.js'];

/**
 * Builds the Express app. Dependencies are passed in so tests can use mocks.
 * @param {{ storyService: object, config: object }} deps
 * @returns {import('express').Express}
 */
function createApp({ storyService, config }) {
  const app = express();
  const staticMaxAge = config.nodeEnv === 'production' ? '1h' : 0;

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind one proxy; needed for correct rate limiting.

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://upload.wikimedia.org'], // topic photos from Wikipedia only
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  const apiLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many stories at once. Please wait a minute.' } },
  });
  app.use('/api', apiLimiter, createStoryRouter({ storyService }));
  app.use('/api', notFound);

  // Shared modules (one source of truth for server and browser).
  SHARED_FILES.forEach((file) => {
    app.get(`/shared/${file}`, (req, res) =>
      res.sendFile(path.join(__dirname, 'utils', file), { maxAge: staticMaxAge }),
    );
  });
  app.use(express.static(PUBLIC_DIR, { maxAge: staticMaxAge }));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
