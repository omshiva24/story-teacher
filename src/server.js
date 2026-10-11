/*! Story Teacher · © 2026 P Om Shiva (M.Tech CSE, Pondicherry University). All rights reserved. Copying or reuse without written permission is not allowed. */
'use strict';

// Start-up for Cloud Run and local development.
const { buildApp, config } = require('./bootstrap');

buildApp().listen(config.port, () => {
  console.log(`Story Teacher running on http://localhost:${config.port}`);
});
