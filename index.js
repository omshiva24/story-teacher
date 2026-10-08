'use strict';

// Entry point for Vercel: it runs the exported Express app as a function.
// Locally or on Cloud Run, use `npm start` (src/server.js) instead.
const { buildApp } = require('./src/bootstrap');

module.exports = buildApp();
