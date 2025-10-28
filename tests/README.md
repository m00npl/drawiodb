# DrawIO Golem DB Plugin - Test Suite

Comprehensive test suite for the DrawIO Golem DB Plugin using Selenium WebDriver and Jest.

## Overview

This test suite provides complete coverage for:
- **API Testing**: Backend endpoint validation and performance
- **UI Testing**: Plugin integration and user interface functionality
- **Integration Testing**: End-to-end workflow validation
- **Performance Testing**: Load testing and benchmarking
- **Error Handling**: Network failure and edge case testing

## Features

- 🚀 **Selenium WebDriver** automation for real browser testing
- 📊 **Comprehensive Reporting** with HTML and JSON output
- 🎯 **Performance Metrics** and benchmarking
- 🐛 **Screenshot Capture** on test failures
- 🔄 **Retry Logic** for flaky operations
- 🐳 **Docker Support** for CI/CD environments
- 📈 **Test Analytics** with recommendations

## Quick Start

### Local Development

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run specific test suites
bun run test:api
bun run test:ui
bun run test:integration
bun run test:performance

# Run with different browsers
bun run browser:chrome
bun run browser:firefox

# Run with visible browser (non-headless)
bun run headless:false
```

### Docker (Recommended for CI/CD)

```bash
# Build and run tests
docker-compose up --build tests

# Run specific test suite
docker-compose run tests npm run test:api

# View reports
docker-compose up report-server
# Open http://localhost:8080
```

## Configuration

### Environment Variables

```bash
# URLs
TEST_BASE_URL=https://drawiodb.online
TEST_API_URL=https://drawiodb.online/api

# Browser Settings
TEST_BROWSER=chrome          # chrome, firefox
TEST_HEADLESS=true          # true, false

# Timeouts (milliseconds)
UI_TIMEOUT=30000
NETWORK_TIMEOUT=45000
PAGE_LOAD_TIMEOUT=60000

# Test Behavior
MAX_RETRIES=3
RETRY_DELAY=2000
SCREENSHOT_ON_FAILURE=true
```

### Test Configuration

Edit `config.js` to customize test settings:

```javascript
module.exports = {
  BASE_URL: process.env.TEST_BASE_URL || 'https://drawiodb.online',
  API_BASE_URL: process.env.TEST_API_URL || 'https://drawiodb.online/api',
  BROWSER: process.env.TEST_BROWSER || 'chrome',
  HEADLESS: process.env.TEST_HEADLESS !== 'false',
  // ... more settings
};
```

## Test Structure

```
tests/
├── api/                    # API endpoint tests
│   └── backend.test.js
├── ui/                     # User interface tests
│   └── plugin.test.js
├── integration/            # End-to-end workflow tests
│   └── full-workflow.test.js
├── performance/            # Performance benchmarks
│   └── benchmarks.test.js
├── utils/                  # Test utilities
│   ├── WebDriverManager.js
│   ├── TestReporter.js
│   └── test-processor.js
└── scripts/                # Execution scripts
    └── ci-test.sh
```

## Test Categories

### API Tests (`tests/api/`)
- Health check endpoints
- Diagram CRUD operations
- Retry queue functionality
- Error handling
- Response time validation

### UI Tests (`tests/ui/`)
- Plugin loading verification
- Menu integration testing
- Dialog functionality
- Error message display
- Browser compatibility

### Integration Tests (`tests/integration/`)
- Complete save/load workflows
- Version history management
- Error recovery testing
- Data consistency validation
- Performance under load

### Performance Tests (`tests/performance/`)
- Page load benchmarks
- API response time testing
- Memory usage monitoring
- Network latency measurement
- Complex diagram handling

## Reporting

The test suite generates multiple report formats:

### HTML Report
- Visual dashboard with test results
- Performance metrics and charts
- Issue summary and recommendations
- Screenshot gallery for failures

### JSON Report
- Machine-readable test data
- Performance metrics
- Detailed error information
- Test execution timeline

### JUnit XML
- CI/CD integration format
- Test result summaries
- Compatible with most CI systems

### Console Output
- Real-time test progress
- Summary tables with statistics
- Color-coded results
- Performance warnings

## CI/CD Integration

### GitHub Actions

```yaml
name: DrawIO Plugin Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: |
          cd tests
          chmod +x scripts/ci-test.sh
          ./scripts/ci-test.sh
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: tests/test-results-*.tar.gz
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                dir('tests') {
                    sh 'chmod +x scripts/ci-test.sh'
                    sh './scripts/ci-test.sh'
                }
            }
            post {
                always {
                    archiveArtifacts 'tests/test-results-*.tar.gz'
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'tests/reports',
                        reportFiles: '*.html',
                        reportName: 'Test Report'
                    ])
                }
            }
        }
    }
}
```

## Troubleshooting

### Common Issues

**Browser not found:**
```bash
# Install Chrome on Ubuntu/Debian
sudo apt-get install google-chrome-stable

# Install Firefox
sudo apt-get install firefox
```

**Permission denied:**
```bash
# Fix script permissions
chmod +x scripts/*.sh
```

**Network timeouts:**
```bash
# Increase timeout values
export NETWORK_TIMEOUT=60000
export UI_TIMEOUT=45000
```

**Docker issues:**
```bash
# Increase shared memory
docker run --shm-size=2g ...

# Check logs
docker-compose logs tests
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment
export DEBUG=true
export JEST_VERBOSE=true

# Run with additional logging
bun run test:ui --verbose
```

### Screenshot Analysis

Failed tests automatically capture screenshots saved to `screenshots/`:
- Timestamped filenames
- Test case identification
- Browser viewport capture
- Error state visualization

## Performance Expectations

### Benchmarks
- Page load: < 15 seconds
- Plugin initialization: < 10 seconds
- API response: < 5 seconds
- Dialog operations: < 3 seconds
- Memory usage: < 200MB

### Success Criteria
- Test success rate: > 90%
- API availability: > 95%
- Performance thresholds: < 10% failures
- Zero critical errors

## Contributing

1. Add new tests to appropriate directories
2. Follow existing naming conventions
3. Update configuration as needed
4. Test both locally and in Docker
5. Update documentation

## Support

For issues and questions:
- Check test logs in `reports/`
- Review screenshot evidence
- Verify network connectivity
- Confirm browser compatibility
- Check Golem DB service status