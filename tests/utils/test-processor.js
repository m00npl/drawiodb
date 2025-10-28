const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

/**
 * Jest test result processor for additional reporting
 */
module.exports = (testResults) => {
  // Save raw Jest results for analysis
  const resultsFile = path.join(config.REPORT_DIR, 'raw-jest-results.json');

  // Process and enhance results
  const processedResults = {
    ...testResults,
    timestamp: new Date().toISOString(),
    environment: {
      baseUrl: config.BASE_URL,
      apiUrl: config.API_BASE_URL,
      browser: config.BROWSER,
      headless: config.HEADLESS,
      timeouts: {
        ui: config.UI_TIMEOUT,
        network: config.NETWORK_TIMEOUT
      }
    },
    summary: {
      total: testResults.numTotalTests,
      passed: testResults.numPassedTests,
      failed: testResults.numFailedTests,
      skipped: testResults.numPendingTests,
      duration: testResults.testResults.reduce((sum, result) =>
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0
      )
    },
    categories: {}
  };

  // Categorize tests by type
  testResults.testResults.forEach(fileResult => {
    if (!fileResult || !fileResult.name) return;

    const category = fileResult.name.includes('/api/') ? 'api' :
                    fileResult.name.includes('/ui/') ? 'ui' :
                    fileResult.name.includes('/integration/') ? 'integration' : 'other';

    if (!processedResults.categories[category]) {
      processedResults.categories[category] = {
        total: 0,
        passed: 0,
        failed: 0,
        tests: []
      };
    }

    if (fileResult.assertionResults) {
      fileResult.assertionResults.forEach(test => {
      processedResults.categories[category].total++;
      processedResults.categories[category].tests.push({
        name: test.title,
        status: test.status,
        duration: test.duration || 0,
        file: path.basename(fileResult.name)
      });

      if (test.status === 'passed') {
        processedResults.categories[category].passed++;
      } else if (test.status === 'failed') {
        processedResults.categories[category].failed++;
      }
      });
    }
  });

  // Save processed results
  fs.writeFileSync(resultsFile, JSON.stringify(processedResults, null, 2));

  console.log(`\n📊 Test results saved to: ${resultsFile}`);

  return testResults;
};