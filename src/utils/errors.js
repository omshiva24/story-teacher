/*! Story Teacher · © 2026 P Om Shiva (M.Tech CSE, Pondicherry University). All rights reserved. Copying or reuse without written permission is not allowed. */
'use strict';

/**
 * An error that is safe to show to the user.
 * Anything that is not an AppError is reported as a generic message.
 */
class AppError extends Error {
  /**
   * @param {number} status - HTTP status code.
   * @param {string} code - Short machine-readable code.
   * @param {string} message - Friendly message for the user.
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { AppError };
