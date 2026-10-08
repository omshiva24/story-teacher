'use strict';

// Entry point for Vercel: it runs the exported Express app as a function.
// Locally or on Cloud Run, use `npm start` (src/server.js) instead.
let app;
try {
  app = require('./src/bootstrap').buildApp();
} catch (err) {
  // Never crash silently: log the real reason and answer with a friendly page.
  console.error('[startup] Story Teacher failed to start:', err && err.stack ? err.stack : err);
  app = (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'STARTUP_FAILED', message: 'Story Teacher is starting up. Please try again shortly.' } }));
  };
}

module.exports = app;
