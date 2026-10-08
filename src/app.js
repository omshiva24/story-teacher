'use strict';

/**
 * Vercel entry point. Vercel's Express preset needs the entry file to import
 * express itself and export an Express app, so this file wraps the real app
 * (built in bootstrap.js). Locally or on Cloud Run, `npm start` runs
 * src/server.js instead.
 */
const express = require('express');

const app = express();
app.disable('x-powered-by');

try {
  app.use(require('./bootstrap').buildApp());
} catch (err) {
  // Never crash silently: log the real reason and answer with a friendly message.
  console.error('[startup] Story Teacher failed to start:', err && err.stack ? err.stack : err);
  app.use((req, res) => {
    res.status(503).json({
      error: { code: 'STARTUP_FAILED', message: 'Story Teacher is starting up. Please try again shortly.' },
    });
  });
}

module.exports = app;
