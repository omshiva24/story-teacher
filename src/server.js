'use strict';

// Start-up for Cloud Run and local development.
const { buildApp, config } = require('./bootstrap');

buildApp().listen(config.port, () => {
  console.log(`Story Teacher running on http://localhost:${config.port}`);
});
