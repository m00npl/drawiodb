const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { table } = require('table');
const config = require('../config');

class TestReporter {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      categories: {
        api: { total: 0, passed: 0, failed: 0, tests: [] },
        ui: { total: 0, passed: 0, failed: 0, tests: [] },
        integration: { total: 0, passed: 0, failed: 0, tests: [] },
        performance: { total: 0, passed: 0, failed: 0, tests: [] }
      },
      issues: [],
      recommendations: []
    };
    this.startTime = Date.now();
  }

  addTestResult(category, testName, status, duration, error = null, screenshot = null) {
    const result = {
      name: testName,
      status,
      duration,
      error: error ? error.message : null,
      screenshot,
      timestamp: new Date().toISOString()
    };

    // Update category stats
    this.results.categories[category].total++;
    this.results.categories[category].tests.push(result);

    if (status === 'passed' || status === 'warning') {
      this.results.categories[category].passed++;
    } else if (status === 'failed') {
      this.results.categories[category].failed++;
      if (error) {
        this.addIssue(category, testName, error.message, 'high');
      }
    }

    // Update summary
    this.results.summary.total++;
    if (status === 'passed' || status === 'warning') this.results.summary.passed++;
    if (status === 'failed') this.results.summary.failed++;
    if (status === 'skipped') this.results.summary.skipped++;
  }

  addIssue(category, testName, description, severity = 'medium') {
    this.results.issues.push({
      category,
      test: testName,
      description,
      severity,
      timestamp: new Date().toISOString()
    });
  }

  addRecommendation(category, description, priority = 'medium') {
    this.results.recommendations.push({
      category,
      description,
      priority,
      timestamp: new Date().toISOString()
    });
  }

  addPerformanceMetric(name, value, unit, threshold = null) {
    const status = threshold && value > threshold ? 'failed' : 'passed';
    this.addTestResult('performance', name, status, 0,
      threshold && value > threshold ? new Error(`Performance threshold exceeded: ${value}${unit} > ${threshold}${unit}`) : null
    );
  }

  finalize() {
    this.results.summary.duration = Date.now() - this.startTime;
    return this.results;
  }

  async generateReport() {
    const results = this.finalize();
    const reportFile = path.join(config.REPORT_DIR, `test-report-${Date.now()}.json`);
    const htmlFile = path.join(config.REPORT_DIR, `test-report-${Date.now()}.html`);

    // Save JSON report
    await fs.writeJson(reportFile, results, { spaces: 2 });

    // Generate HTML report
    const html = this.generateHtmlReport(results);
    await fs.writeFile(htmlFile, html);

    // Print console summary
    this.printConsoleSummary(results);

    return { json: reportFile, html: htmlFile };
  }

  generateHtmlReport(results) {
    const statusColor = (status) => {
      switch (status) {
        case 'passed': return '#28a745';
        case 'failed': return '#dc3545';
        case 'skipped': return '#ffc107';
        default: return '#6c757d';
      }
    };

    const severityColor = (severity) => {
      switch (severity) {
        case 'high': return '#dc3545';
        case 'medium': return '#fd7e14';
        case 'low': return '#ffc107';
        default: return '#6c757d';
      }
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <title>DrawIO Golem DB Plugin - Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #dee2e6; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; border-left: 4px solid #007bff; }
        .metric h3 { margin: 0 0 10px 0; color: #495057; }
        .metric .value { font-size: 24px; font-weight: bold; color: #007bff; }
        .category { margin-bottom: 30px; }
        .category h3 { color: #495057; border-bottom: 1px solid #dee2e6; padding-bottom: 10px; }
        .test-list { background: #f8f9fa; padding: 15px; border-radius: 6px; }
        .test-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #dee2e6; }
        .test-item:last-child { border-bottom: none; }
        .status { padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: bold; }
        .issues { background: #fff3cd; padding: 20px; border-radius: 6px; border-left: 4px solid #ffc107; margin-bottom: 30px; }
        .issue { margin-bottom: 10px; padding: 10px; background: white; border-radius: 4px; }
        .recommendations { background: #d1ecf1; padding: 20px; border-radius: 6px; border-left: 4px solid #17a2b8; }
        .recommendation { margin-bottom: 10px; padding: 10px; background: white; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 DrawIO Golem DB Plugin - Test Report</h1>
            <p><strong>Generated:</strong> ${new Date(results.timestamp).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${(results.summary.duration / 1000).toFixed(2)}s</p>
        </div>

        <div class="summary">
            <div class="metric">
                <h3>Total Tests</h3>
                <div class="value">${results.summary.total}</div>
            </div>
            <div class="metric">
                <h3>Passed</h3>
                <div class="value" style="color: #28a745;">${results.summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div class="value" style="color: #dc3545;">${results.summary.failed}</div>
            </div>
            <div class="metric">
                <h3>Success Rate</h3>
                <div class="value">${results.summary.total > 0 ? ((results.summary.passed / results.summary.total) * 100).toFixed(1) : 0}%</div>
            </div>
        </div>

        ${Object.entries(results.categories).map(([category, data]) => `
            <div class="category">
                <h3>🔧 ${category.toUpperCase()} Tests (${data.passed}/${data.total})</h3>
                <div class="test-list">
                    ${data.tests.map(test => `
                        <div class="test-item">
                            <span>${test.name}</span>
                            <div>
                                <span class="status" style="background-color: ${statusColor(test.status)};">${test.status.toUpperCase()}</span>
                                <small style="margin-left: 10px; color: #6c757d;">${test.duration}ms</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('')}

        ${results.issues.length > 0 ? `
            <div class="issues">
                <h3>⚠️ Issues Found (${results.issues.length})</h3>
                ${results.issues.map(issue => `
                    <div class="issue">
                        <strong style="color: ${severityColor(issue.severity)};">[${issue.severity.toUpperCase()}]</strong>
                        <strong>${issue.category}:</strong> ${issue.test}<br>
                        <small>${issue.description}</small>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        ${results.recommendations.length > 0 ? `
            <div class="recommendations">
                <h3>💡 Recommendations (${results.recommendations.length})</h3>
                ${results.recommendations.map(rec => `
                    <div class="recommendation">
                        <strong>[${rec.priority.toUpperCase()}]</strong> ${rec.category}: ${rec.description}
                    </div>
                `).join('')}
            </div>
        ` : ''}
    </div>
</body>
</html>`;
  }

  printConsoleSummary(results) {
    console.log('\n' + chalk.bold.blue('📊 TEST REPORT SUMMARY'));
    console.log('═'.repeat(50));

    // Summary table
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Tests', results.summary.total],
      ['Passed', chalk.green(results.summary.passed)],
      ['Failed', chalk.red(results.summary.failed)],
      ['Success Rate', `${results.summary.total > 0 ? ((results.summary.passed / results.summary.total) * 100).toFixed(1) : 0}%`],
      ['Duration', `${(results.summary.duration / 1000).toFixed(2)}s`]
    ];

    console.log(table(summaryData));

    // Categories breakdown
    console.log(chalk.bold('\n📋 Categories Breakdown:'));
    Object.entries(results.categories).forEach(([category, data]) => {
      const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : 0;
      console.log(`  ${category.toUpperCase()}: ${chalk.green(data.passed)}/${data.total} (${rate}%)`);
    });

    // Issues summary
    if (results.issues.length > 0) {
      console.log(chalk.bold.yellow('\n⚠️  Issues Found:'));
      const issuesByCategory = results.issues.reduce((acc, issue) => {
        acc[issue.category] = (acc[issue.category] || 0) + 1;
        return acc;
      }, {});

      Object.entries(issuesByCategory).forEach(([category, count]) => {
        console.log(`  ${category}: ${chalk.red(count)} issues`);
      });
    }

    console.log('\n' + '═'.repeat(50));
  }
}

module.exports = TestReporter;