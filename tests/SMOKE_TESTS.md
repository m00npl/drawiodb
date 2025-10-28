# Smoke Tests - DrawIO DB

## Overview

Smoke tests are lightweight, fast tests that verify critical functionality is working. They run quickly and provide immediate feedback on whether the system is fundamentally operational.

## Test Coverage

### API Smoke Tests (`api/smoke.test.js`)

**Share Tokens & Arkiv Storage**
- ✅ Share token access via `/shared/:token`
- ✅ SVG export for shared diagrams
- ✅ PNG export for shared diagrams
- ✅ HTML viewer for shared diagrams
- ✅ Branding consistency (drawiodb.online)

**DrawIO Exporter Service**
- ✅ Service availability check
- ✅ Export with fallback handling
- ✅ Integration with main application

**Branding Verification**
- ✅ Homepage branding (drawiodb.online)
- ✅ Share page branding
- ✅ No "Draw.io" references in error pages

**Performance & Health**
- ✅ Health check response time (< 5 seconds)
- ✅ Concurrent request handling
- ✅ Error handling for invalid tokens
- ✅ Malformed export format handling

### UI Smoke Tests (`ui/smoke-ui.test.js`)

**Application Loading**
- ✅ drawiodb.online loads successfully
- ✅ Arkiv plugin scripts load
- ✅ Canvas/graph element present

**Auto-Save Functionality**
- ✅ Auto-save system initialization
- ✅ Graph model change listeners setup
- ✅ Silent save functions available

**Branding Verification**
- ✅ drawiodb.online branding present
- ✅ No old "Draw.io" text in UI

**Core Editor Functions**
- ✅ Basic shape creation works
- ✅ XML serialization functional

**Arkiv Integration**
- ✅ SDK or backend mode available
- ✅ Encryption functions (CryptoJS) loaded

## Running Smoke Tests

### Quick Start

```bash
cd tests

# Install dependencies (first time only)
bun install

# Run API smoke tests only (fast, no browser)
bun run smoke

# Run UI smoke tests (requires browser)
bun run smoke:ui

# Run all smoke tests
bun run smoke:all
```

### With Different Browsers

```bash
# Chrome (default)
TEST_BROWSER=chrome bun run smoke:ui

# Firefox
TEST_BROWSER=firefox bun run smoke:ui

# Visible browser (non-headless)
TEST_HEADLESS=false bun run smoke:ui
```

### Environment Variables

```bash
# Test environment
TEST_BASE_URL=https://drawiodb.online
TEST_API_URL=https://drawiodb.online/api

# Browser settings
TEST_BROWSER=chrome              # chrome or firefox
TEST_HEADLESS=true              # true or false

# Timeouts
NETWORK_TIMEOUT=60000           # 60 seconds
UI_TIMEOUT=15000                # 15 seconds
```

## Test Expectations

### Performance Benchmarks

| Metric | Target | Critical |
|--------|--------|----------|
| Health Check | < 5s | < 10s |
| Share Token Access | < 5s | < 10s |
| SVG Export | < 10s | < 20s |
| PNG Export | < 15s | < 30s |
| App Load Time | < 20s | < 40s |

### Success Criteria

- ✅ **Pass Rate**: > 90% of tests should pass
- ✅ **Performance**: No critical timeouts
- ✅ **Availability**: All endpoints accessible
- ✅ **Functionality**: Core features operational

## Understanding Results

### Test Status

- **passed** ✅ - Test completed successfully
- **failed** ❌ - Test failed (critical issue)
- **warning** ⚠️ - Test passed with concerns (non-critical)

### Common Issues

**API Tests Failing**
```bash
# Check if service is running
docker compose ps

# Check service logs
docker compose logs drawiodb
docker compose logs drawio-exporter

# Verify network connectivity
curl https://drawiodb.online/health
```

**UI Tests Failing**
```bash
# Install browser drivers
# Chrome: automatically managed by selenium-webdriver
# Firefox: automatically managed by selenium-webdriver

# Run with visible browser to debug
TEST_HEADLESS=false bun run smoke:ui

# Check screenshots in tests/screenshots/
ls -la screenshots/
```

**Timeout Issues**
```bash
# Increase timeout values
export NETWORK_TIMEOUT=120000
export UI_TIMEOUT=30000

# Or run tests individually
bun run smoke  # API only, faster
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Smoke Tests

on: [push, pull_request]

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: |
          cd tests
          bun install

      - name: Run API smoke tests
        run: |
          cd tests
          bun run smoke

      - name: Run UI smoke tests
        run: |
          cd tests
          TEST_HEADLESS=true bun run smoke:ui

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: smoke-test-results
          path: tests/reports/
```

### Docker Example

```bash
# Build test container
docker compose -f docker-compose.yml up tests

# Or run specific smoke tests
docker compose run tests bun run smoke
```

## Smoke Test Philosophy

### What Smoke Tests Check

✅ **DO check:**
- Service is up and responding
- Critical endpoints are accessible
- Core features work at basic level
- No major regressions
- Performance is acceptable

❌ **DON'T check:**
- Edge cases and corner scenarios
- Complex user workflows
- Detailed business logic
- Data validation rules
- Comprehensive error handling

### When to Run

- **Before deployment** - Verify build is deployable
- **After deployment** - Confirm deployment success
- **On every commit** - Catch regressions early
- **Scheduled checks** - Monitor production health
- **Before deep testing** - Don't waste time if basics fail

## Adding New Smoke Tests

### API Test Example

```javascript
test('should verify new feature works', async () => {
  const startTime = Date.now();

  try {
    const response = await apiClient.get('/new-endpoint');
    const duration = Date.now() - startTime;

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('expectedField');

    reporter.addTestResult('smoke', 'New Feature', 'passed', duration);
    reporter.addPerformanceMetric('New Feature Time', duration, 'ms', 5000);
  } catch (error) {
    const duration = Date.now() - startTime;
    reporter.addTestResult('smoke', 'New Feature', 'failed', duration, error);
    throw error;
  }
});
```

### UI Test Example

```javascript
test('should verify new UI element appears', async () => {
  const startTime = Date.now();

  try {
    await driver.sleep(2000);

    const elementPresent = await webDriver.isElementPresent('#new-element');
    const duration = Date.now() - startTime;

    expect(elementPresent).toBe(true);
    reporter.addTestResult('ui-smoke', 'New UI Element', 'passed', duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    const screenshot = await webDriver.takeScreenshot('new_element_missing');
    reporter.addTestResult('ui-smoke', 'New UI Element', 'failed', duration, error, screenshot);
    throw error;
  }
});
```

## Troubleshooting

### Permission Errors

```bash
# Fix script permissions
chmod +x scripts/*.sh

# Check file ownership
ls -la tests/
```

### Network Timeouts

```bash
# Check service connectivity
curl -v https://drawiodb.online/health

# Check drawio-exporter connectivity (from within drawiodb container)
docker exec drawiodb curl -v http://drawio-exporter:5000/
```

### Browser Driver Issues

```bash
# Clear driver cache
rm -rf ~/.cache/selenium/

# Update drivers
cd tests
bun install
```

## Reporting

Test results are automatically saved to:
- `tests/reports/` - HTML and JSON reports
- `tests/screenshots/` - Failure screenshots (UI tests only)

View reports:
```bash
cd tests
open reports/test-report.html  # macOS
xdg-open reports/test-report.html  # Linux
start reports/test-report.html  # Windows
```

## Support

For issues or questions:
1. Check test logs in `tests/reports/`
2. Review screenshots in `tests/screenshots/`
3. Verify service status: `docker compose ps`
4. Check service logs: `docker compose logs`
5. Open issue on GitHub with test output

---

**Last Updated**: 2025-10-22
**Maintained By**: DrawIO DB Team
