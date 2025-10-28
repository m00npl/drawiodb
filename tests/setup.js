const fs = require('fs-extra');
const path = require('path');
const config = require('./config');

// Global test setup
beforeAll(async () => {
  // Ensure test directories exist
  await fs.ensureDir(config.REPORT_DIR);
  await fs.ensureDir(config.SCREENSHOT_DIR);

  // Clear previous test results
  const reportFiles = await fs.readdir(config.REPORT_DIR);
  for (const file of reportFiles) {
    if (file.endsWith('.json') || file.endsWith('.html')) {
      await fs.unlink(path.join(config.REPORT_DIR, file));
    }
  }

  console.log('🚀 Test environment initialized');
  console.log(`Base URL: ${config.BASE_URL}`);
  console.log(`API URL: ${config.API_BASE_URL}`);
  console.log(`Browser: ${config.BROWSER} (headless: ${config.HEADLESS})`);
});

// Global test teardown
afterAll(async () => {
  console.log('✅ Test suite completed');
});