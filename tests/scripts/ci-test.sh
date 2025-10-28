#!/bin/bash

# CI/CD Test Runner for DrawIO Golem DB Plugin
# This script runs the complete test suite in a CI environment

set -e  # Exit on any error

echo "🚀 Starting DrawIO Golem DB Plugin CI Test Suite"
echo "=================================================="

# Environment variables with defaults
export TEST_ENV=${TEST_ENV:-ci}
export TEST_BROWSER=${TEST_BROWSER:-chrome}
export TEST_HEADLESS=${TEST_HEADLESS:-true}
export TEST_BASE_URL=${TEST_BASE_URL:-https://drawiodb.online}
export TEST_API_URL=${TEST_API_URL:-https://drawiodb.online/api}

echo "Environment Configuration:"
echo "  TEST_ENV: $TEST_ENV"
echo "  TEST_BROWSER: $TEST_BROWSER"
echo "  TEST_HEADLESS: $TEST_HEADLESS"
echo "  TEST_BASE_URL: $TEST_BASE_URL"
echo "  TEST_API_URL: $TEST_API_URL"
echo "=================================================="

# Check dependencies
echo "📦 Checking dependencies..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm: $(npm --version)"

# Check browser availability
if [ "$TEST_BROWSER" = "chrome" ]; then
    if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null && ! command -v chromium &> /dev/null; then
        echo "⚠️  Chrome/Chromium not found, attempting to install..."

        # Try to install Chrome in CI environment
        if [ "$CI" = "true" ] || [ "$TEST_ENV" = "ci" ]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get update
                sudo apt-get install -y wget gnupg
                wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
                echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
                sudo apt-get update
                sudo apt-get install -y google-chrome-stable
            fi
        else
            echo "❌ Chrome/Chromium is required for tests"
            exit 1
        fi
    fi
    echo "✅ Chrome browser available"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --silent

# Create required directories
mkdir -p reports screenshots

# Clean previous test results
echo "🧹 Cleaning previous test results..."
npm run test:clean || true

# Run pre-test health checks
echo "🏥 Running pre-test health checks..."
TEST_TIMEOUT=10000 node -e "
const axios = require('axios');
const config = require('./config');

async function healthCheck() {
  try {
    console.log('Checking base URL:', config.BASE_URL);
    await axios.get(config.BASE_URL, { timeout: 10000 });
    console.log('✅ Base URL accessible');

    console.log('Checking API URL:', config.API_BASE_URL + '/health');
    await axios.get(config.API_BASE_URL + '/health', { timeout: 10000 });
    console.log('✅ API endpoint accessible');
  } catch (error) {
    console.log('⚠️  Health check failed:', error.message);
    console.log('Tests will continue but may have failures due to connectivity issues');
  }
}

healthCheck();
" || echo "⚠️  Health check completed with warnings"

# Run the test suite
echo "🧪 Running test suite..."
export CI=true
export JEST_JUNIT_OUTPUT_DIR=./reports
export JEST_JUNIT_OUTPUT_NAME=junit.xml

# Set test timeouts for CI environment
export JEST_TIMEOUT=180000  # 3 minutes per test
export PAGE_LOAD_TIMEOUT=60000  # 1 minute for page loads
export NETWORK_TIMEOUT=30000  # 30 seconds for API calls

# Run tests with proper error handling
TEST_EXIT_CODE=0

# Run main test suite
echo "🏃 Executing main test suite..."
node runner.js || TEST_EXIT_CODE=$?

# Generate additional reports
echo "📊 Generating additional reports..."
if [ -f "./reports/raw-jest-results.json" ]; then
    echo "✅ Jest results found, processing..."
    node utils/test-processor.js || echo "⚠️  Test processor completed with warnings"
fi

# Archive test artifacts
echo "📦 Archiving test artifacts..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_DIR="test-results-${TIMESTAMP}"
mkdir -p "$ARCHIVE_DIR"

# Copy reports
cp -r reports/* "$ARCHIVE_DIR/" 2>/dev/null || echo "No reports to archive"

# Copy screenshots
cp -r screenshots/* "$ARCHIVE_DIR/" 2>/dev/null || echo "No screenshots to archive"

# Create summary file
cat > "$ARCHIVE_DIR/test-summary.txt" << EOF
DrawIO Golem DB Plugin Test Results
===================================
Timestamp: $(date)
Environment: $TEST_ENV
Browser: $TEST_BROWSER
Headless: $TEST_HEADLESS
Base URL: $TEST_BASE_URL
API URL: $TEST_API_URL
Exit Code: $TEST_EXIT_CODE

EOF

if [ -f "./reports/raw-jest-results.json" ]; then
    echo "Test Summary:" >> "$ARCHIVE_DIR/test-summary.txt"
    node -e "
    try {
      const results = require('./reports/raw-jest-results.json');
      console.log('Total Tests:', results.numTotalTests);
      console.log('Passed:', results.numPassedTests);
      console.log('Failed:', results.numFailedTests);
      console.log('Skipped:', results.numPendingTests);
      console.log('Success Rate:', results.numTotalTests > 0 ? ((results.numPassedTests / results.numTotalTests) * 100).toFixed(1) + '%' : '0%');
    } catch (e) {
      console.log('Could not read test results');
    }
    " >> "$ARCHIVE_DIR/test-summary.txt" 2>/dev/null || echo "Could not generate summary"
fi

# Compress archive
if command -v tar &> /dev/null; then
    tar -czf "${ARCHIVE_DIR}.tar.gz" "$ARCHIVE_DIR"
    echo "📦 Test results archived: ${ARCHIVE_DIR}.tar.gz"
fi

# Print final summary
echo ""
echo "🏁 CI Test Suite Completed"
echo "=================================================="
echo "Exit Code: $TEST_EXIT_CODE"
echo "Archives: ${ARCHIVE_DIR}.tar.gz"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed successfully!"
else
    echo "❌ Some tests failed. Check the reports for details."
    echo "Common issues:"
    echo "  - Network connectivity to Golem DB"
    echo "  - Browser compatibility issues"
    echo "  - Plugin initialization timeouts"
fi

echo "=================================================="

exit $TEST_EXIT_CODE