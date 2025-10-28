module.exports = async () => {
  console.log('🧹 Global test teardown starting...');

  // Clean up any remaining processes
  try {
    const { execSync } = require('child_process');

    // Kill any remaining Chrome processes (Linux/Mac)
    try {
      execSync('pkill -f "chrome.*--test-type" || true', { stdio: 'pipe' });
      execSync('pkill -f "chromium.*--test-type" || true', { stdio: 'pipe' });
    } catch (error) {
      // Ignore errors as processes may not exist
    }

    // Kill any remaining Firefox processes
    try {
      execSync('pkill -f "firefox.*--headless" || true', { stdio: 'pipe' });
    } catch (error) {
      // Ignore errors as processes may not exist
    }

    console.log('✅ Browser processes cleaned up');
  } catch (error) {
    console.warn('Warning: Could not clean up browser processes:', error.message);
  }

  // Clean up temporary files
  try {
    const fs = require('fs-extra');
    const os = require('os');
    const path = require('path');

    const tempDir = os.tmpdir();
    const chromeUserDataDirs = await fs.readdir(tempDir);

    for (const dir of chromeUserDataDirs) {
      if (dir.startsWith('scoped_dir') || dir.includes('chrome_AUTOMATION')) {
        try {
          await fs.remove(path.join(tempDir, dir));
        } catch (removeError) {
          // Ignore errors
        }
      }
    }

    console.log('✅ Temporary files cleaned up');
  } catch (error) {
    console.warn('Warning: Could not clean up temporary files:', error.message);
  }

  console.log('✅ Global test teardown completed');
};