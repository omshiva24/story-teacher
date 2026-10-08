'use strict';

const { AppError } = require('../utils/errors');

/**
 * Wraps an async route so its errors reach the error handler.
 * @param {Function} handler
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Sends a 404 for unknown API routes. */
function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That page does not exist.' } });
}

/**
 * Central error handler. Users only ever see friendly messages;
 * details are logged on the server, never sent to the browser.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That request is too large.' } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request was not valid.' } });
  }

  console.error('[error]', err && err.message ? err.message : err);
  return res.status(502).json({
    error: { code: 'STORY_FAILED', message: 'Sorry, we could not make the story right now. Please try again.' },
  });
}

module.exports = { asyncHandler, notFound, errorHandler };
