#!/usr/bin/env node

const { execSync } = require('child_process');
const TestReporter = require('./utils/TestReporter');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const config = require('./config');

class TestSuiteRunner {
  constructor() {
    this.globalReporter = new TestReporter();
    this.testResults = [];
    this.startTime = Date.now();
  }

  async run() {
    console.log(chalk.bold.blue('🚀 Starting DrawIO Golem DB Plugin Test Suite'));
    console.log('═'.repeat(60));
    console.log(`Environment: ${config.BASE_URL}`);
    console.log(`Browser: ${config.BROWSER} (headless: ${config.HEADLESS})`);
    console.log(`Timeout settings: UI=${config.UI_TIMEOUT}ms, Network=${config.NETWORK_TIMEOUT}ms`);
    console.log('═'.repeat(60));

    // Set global reporter for individual test files
    global.testReporter = this.globalReporter;

    try {
      // Ensure directories exist
      await fs.ensureDir(config.REPORT_DIR);
      await fs.ensureDir(config.SCREENSHOT_DIR);

      // Run different test suites in sequence
      await this.runTestSuite('API Tests', 'tests/api');
      await this.runTestSuite('UI Tests', 'tests/ui');
      await this.runTestSuite('Integration Tests', 'tests/integration');

      // Generate final reports
      await this.generateFinalReport();

    } catch (error) {
      console.error(chalk.red('❌ Test suite execution failed:'), error.message);
      process.exit(1);
    }
  }

  async runTestSuite(name, pattern) {
    console.log(chalk.bold.yellow(`\n📋 Running ${name}...`));
    console.log('─'.repeat(40));

    const startTime = Date.now();

    try {
      const result = execSync(`npx jest ${pattern} --detectOpenHandles --forceExit --json`, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000 // 5 minutes timeout
      });

      const jestResults = JSON.parse(result);
      const duration = Date.now() - startTime;

      this.processJestResults(name, jestResults, duration);

      console.log(chalk.green(`✅ ${name} completed in ${(duration / 1000).toFixed(2)}s`));

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`❌ ${name} failed after ${(duration / 1000).toFixed(2)}s`));

      // Try to parse Jest output even on failure
      try {
        const errorOutput = error.stdout || error.stderr || '';
        if (errorOutput.includes('{')) {
          const jsonStart = errorOutput.indexOf('{');
          const jsonOutput = errorOutput.substring(jsonStart);
          const jestResults = JSON.parse(jsonOutput);
          this.processJestResults(name, jestResults, duration);
        }
      } catch (parseError) {
        console.warn('Could not parse Jest results:', parseError.message);
      }

      this.globalReporter.addIssue('system', name, `Test suite execution failed: ${error.message}`, 'high');
    }
  }

  processJestResults(suiteName, jestResults, duration) {
    if (!jestResults || !jestResults.testResults) {
      console.warn(`No test results found for ${suiteName}`);
      return;
    }

    jestResults.testResults.forEach(fileResult => {
      fileResult.assertionResults.forEach(test => {
        const status = test.status === 'passed' ? 'passed' :
                      test.status === 'failed' ? 'failed' : 'skipped';

        // Extract category from file path
        const category = fileResult.name.includes('/api/') ? 'api' :
                        fileResult.name.includes('/ui/') ? 'ui' :
                        fileResult.name.includes('/integration/') ? 'integration' : 'other';

        if (status === 'failed' && test.failureMessages) {
          const error = new Error(test.failureMessages.join('\n'));
          this.globalReporter.addTestResult(category, test.title, status, test.duration || 0, error);
        } else {
          this.globalReporter.addTestResult(category, test.title, status, test.duration || 0);
        }
      });
    });

    // Add suite-level metrics
    this.globalReporter.addPerformanceMetric(`${suiteName} Suite Duration`, duration, 'ms', 120000);
  }

  async generateFinalReport() {
    console.log(chalk.bold.blue('\n📊 Generating Final Report...'));
    console.log('─'.repeat(40));

    const totalDuration = Date.now() - this.startTime;
    this.globalReporter.addPerformanceMetric('Total Test Suite Duration', totalDuration, 'ms', 600000);

    // Add overall analysis and recommendations
    this.addOverallAnalysis();

    const reportFiles = await this.globalReporter.generateReport();

    console.log(chalk.bold.green('\n✅ Test Suite Completed!'));
    console.log('═'.repeat(60));
    console.log(`📁 JSON Report: ${reportFiles.json}`);
    console.log(`🌐 HTML Report: ${reportFiles.html}`);
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    const results = this.globalReporter.finalize();
    const successRate = results.summary.total > 0 ?
      ((results.summary.passed / results.summary.total) * 100).toFixed(1) : 0;

    if (results.summary.failed > 0) {
      console.log(chalk.red(`❌ ${results.summary.failed} tests failed`));
      console.log(chalk.yellow(`⚠️  ${results.issues.length} issues found`));
    }

    console.log(chalk.blue(`📈 Success Rate: ${successRate}%`));
    console.log('═'.repeat(60));

    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
  }

  addOverallAnalysis() {
    const results = this.globalReporter.results;
    const totalTests = results.summary.total;
    const failedTests = results.summary.failed;
    const successRate = totalTests > 0 ? ((results.summary.passed / totalTests) * 100) : 0;

    // Add analysis recommendations
    if (successRate < 70) {
      this.globalReporter.addRecommendation('overall',
        'Test success rate is below 70% - major stability issues need immediate attention', 'critical');
    } else if (successRate < 90) {
      this.globalReporter.addRecommendation('overall',
        'Test success rate could be improved - investigate intermittent failures', 'high');
    }

    // Check for performance issues
    const performanceTests = results.categories.performance;
    if (performanceTests && performanceTests.failed > 0) {
      this.globalReporter.addRecommendation('performance',
        'Performance thresholds exceeded - optimize slow operations', 'high');
    }

    // Check for integration issues
    const integrationTests = results.categories.integration;
    if (integrationTests && integrationTests.failed > 0) {
      this.globalReporter.addRecommendation('integration',
        'Integration test failures indicate system-wide issues', 'critical');
    }

    // Check for API connectivity
    const apiTests = results.categories.api;
    if (apiTests && apiTests.failed > apiTests.passed) {
      this.globalReporter.addRecommendation('api',
        'More API tests failing than passing - check Golem DB connectivity and server health', 'critical');
    }

    // Check for UI issues
    const uiTests = results.categories.ui;
    if (uiTests && uiTests.failed > 0) {
      this.globalReporter.addRecommendation('ui',
        'UI test failures may indicate plugin integration issues or browser compatibility problems', 'medium');
    }

    // Network timeout analysis
    const networkIssues = results.issues.filter(issue =>
      issue.description.toLowerCase().includes('timeout') ||
      issue.description.toLowerCase().includes('network') ||
      issue.description.toLowerCase().includes('connectivity')
    );

    if (networkIssues.length > 3) {
      this.globalReporter.addRecommendation('network',
        'Multiple network timeout issues detected - investigate Golem DB network infrastructure', 'critical');
    }

    // Add summary recommendations
    this.globalReporter.addRecommendation('summary',
      `Test suite completed with ${successRate.toFixed(1)}% success rate. ${results.issues.length} issues found across ${totalTests} tests.`, 'info');
  }
}

// CLI execution
if (require.main === module) {
  const runner = new TestSuiteRunner();
  runner.run().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = TestSuiteRunner;