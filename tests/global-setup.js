const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { execSync } = require('child_process');

module.exports = async () => {
  console.log('🔧 Global test setup starting...');

  // Ensure all required directories exist
  await fs.ensureDir(config.REPORT_DIR);
  await fs.ensureDir(config.SCREENSHOT_DIR);

  // Clean up old reports and screenshots
  try {
    const reportFiles = await fs.readdir(config.REPORT_DIR);
    for (const file of reportFiles) {
      if (file.endsWith('.json') || file.endsWith('.html') || file.endsWith('.xml')) {
        await fs.unlink(path.join(config.REPORT_DIR, file));
      }
    }

    const screenshotFiles = await fs.readdir(config.SCREENSHOT_DIR);
    for (const file of screenshotFiles) {
      if (file.endsWith('.png')) {
        await fs.unlink(path.join(config.SCREENSHOT_DIR, file));
      }
    }
  } catch (error) {
    console.warn('Warning: Could not clean up old files:', error.message);
  }

  // Check system dependencies
  try {
    // Check if Chrome/Chromium is available
    if (config.BROWSER.toLowerCase() === 'chrome') {
      try {
        execSync('which google-chrome || which chromium-browser || which chromium', { stdio: 'pipe' });
        console.log('✅ Chrome browser found');
      } catch (chromeError) {
        console.warn('⚠️  Chrome browser not found in PATH, tests may fail');
      }
    }

    // Check if Firefox is available
    if (config.BROWSER.toLowerCase() === 'firefox') {
      try {
        execSync('which firefox', { stdio: 'pipe' });
        console.log('✅ Firefox browser found');
      } catch (firefoxError) {
        console.warn('⚠️  Firefox browser not found in PATH, tests may fail');
      }
    }
  } catch (error) {
    console.warn('Warning: Could not verify browser availability:', error.message);
  }

  // Test network connectivity
  try {
    const axios = require('axios');
    const client = axios.create({ timeout: 10000 });

    // Test base URL connectivity
    try {
      await client.get(config.BASE_URL);
      console.log('✅ Base URL accessible:', config.BASE_URL);
    } catch (baseUrlError) {
      console.warn('⚠️  Base URL not accessible:', config.BASE_URL, '- tests may fail');
    }

    // Test API connectivity
    try {
      await client.get(`${config.API_BASE_URL}/health`);
      console.log('✅ API endpoint accessible:', config.API_BASE_URL);
    } catch (apiError) {
      console.warn('⚠️  API endpoint not accessible:', config.API_BASE_URL, '- API tests will fail');
    }
  } catch (error) {
    console.warn('Warning: Could not verify network connectivity:', error.message);
  }

  console.log('🚀 Global test setup completed');
};