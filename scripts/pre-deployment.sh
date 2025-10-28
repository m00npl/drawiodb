#!/bin/bash

# Pre-Deployment Smoke Tests Script
# Runs smoke tests before deployment to ensure critical functionality works
#
# Usage:
#   ./scripts/pre-deployment.sh
#
# Environment Variables:
#   TEST_BASE_URL - URL to test (default: https://drawiodb.online)
#   SKIP_UI_TESTS - Set to "true" to skip UI tests (default: false)
#   STRICT_MODE - Set to "true" to fail on warnings (default: false)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_BASE_URL=${TEST_BASE_URL:-"https://drawiodb.online"}
SKIP_UI_TESTS=${SKIP_UI_TESTS:-"false"}
STRICT_MODE=${STRICT_MODE:-"false"}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
TEST_DIR="$PROJECT_ROOT/tests"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Pre-Deployment Smoke Tests          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Target URL:${NC} $TEST_BASE_URL"
echo -e "${BLUE}Skip UI Tests:${NC} $SKIP_UI_TESTS"
echo -e "${BLUE}Strict Mode:${NC} $STRICT_MODE"
echo ""

# Check if tests directory exists
if [ ! -d "$TEST_DIR" ]; then
    echo -e "${RED}✗ Tests directory not found: $TEST_DIR${NC}"
    exit 1
fi

cd "$TEST_DIR"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing test dependencies...${NC}"
    bun install
fi

# Run API Smoke Tests
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Running API Smoke Tests...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if TEST_BASE_URL="$TEST_BASE_URL" bun run smoke 2>&1 | tee /tmp/api-smoke-tests.log; then
    API_TESTS_PASSED=true
    echo ""
    echo -e "${GREEN}✓ API Smoke Tests: PASSED${NC}"
else
    API_TESTS_PASSED=false
    echo ""
    echo -e "${RED}✗ API Smoke Tests: FAILED${NC}"
fi

# Count test results from API tests
API_PASSED=$(grep -c "✓" /tmp/api-smoke-tests.log || echo "0")
API_FAILED=$(grep -c "✕" /tmp/api-smoke-tests.log || echo "0")

echo -e "${BLUE}API Tests Summary:${NC} $API_PASSED passed, $API_FAILED failed"
echo ""

# Run UI Smoke Tests (if not skipped)
UI_TESTS_PASSED=true
UI_PASSED=0
UI_FAILED=0

if [ "$SKIP_UI_TESTS" != "true" ]; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Running UI Smoke Tests...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if TEST_HEADLESS=true TEST_BROWSER=chrome TEST_BASE_URL="$TEST_BASE_URL" bun run smoke:ui 2>&1 | tee /tmp/ui-smoke-tests.log; then
        UI_TESTS_PASSED=true
        echo ""
        echo -e "${GREEN}✓ UI Smoke Tests: PASSED${NC}"
    else
        UI_TESTS_PASSED=false
        echo ""
        echo -e "${RED}✗ UI Smoke Tests: FAILED${NC}"
    fi

    # Count test results from UI tests
    UI_PASSED=$(grep -c "✓" /tmp/ui-smoke-tests.log || echo "0")
    UI_FAILED=$(grep -c "✕" /tmp/ui-smoke-tests.log || echo "0")

    echo -e "${BLUE}UI Tests Summary:${NC} $UI_PASSED passed, $UI_FAILED failed"
    echo ""
else
    echo -e "${YELLOW}⚠ Skipping UI Smoke Tests (SKIP_UI_TESTS=true)${NC}"
    echo ""
fi

# Final Summary
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}        DEPLOYMENT READINESS REPORT         ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

TOTAL_PASSED=$((API_PASSED + UI_PASSED))
TOTAL_FAILED=$((API_FAILED + UI_FAILED))
TOTAL_TESTS=$((TOTAL_PASSED + TOTAL_FAILED))

echo -e "${BLUE}Total Tests:${NC}   $TOTAL_TESTS"
echo -e "${GREEN}✓ Passed:${NC}      $TOTAL_PASSED"

if [ $TOTAL_FAILED -gt 0 ]; then
    echo -e "${RED}✗ Failed:${NC}      $TOTAL_FAILED"
else
    echo -e "${GREEN}✓ Failed:${NC}      $TOTAL_FAILED"
fi

echo ""

# Determine deployment readiness
DEPLOYMENT_READY=true

if [ "$API_TESTS_PASSED" != "true" ]; then
    DEPLOYMENT_READY=false
    echo -e "${RED}❌ CRITICAL: API tests failed${NC}"
fi

if [ "$UI_TESTS_PASSED" != "true" ] && [ "$SKIP_UI_TESTS" != "true" ]; then
    if [ "$STRICT_MODE" == "true" ]; then
        DEPLOYMENT_READY=false
        echo -e "${RED}❌ CRITICAL: UI tests failed (STRICT_MODE)${NC}"
    else
        echo -e "${YELLOW}⚠  WARNING: UI tests failed (non-strict mode)${NC}"
    fi
fi

# Check for warnings in strict mode
if [ "$STRICT_MODE" == "true" ]; then
    if grep -q "warning" /tmp/api-smoke-tests.log /tmp/ui-smoke-tests.log 2>/dev/null; then
        DEPLOYMENT_READY=false
        echo -e "${YELLOW}⚠  WARNING: Tests have warnings (STRICT_MODE)${NC}"
    fi
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"

if [ "$DEPLOYMENT_READY" == "true" ]; then
    echo -e "${GREEN}✓ DEPLOYMENT READY${NC}"
    echo -e "${GREEN}All critical tests passed. Safe to deploy.${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ DEPLOYMENT BLOCKED${NC}"
    echo -e "${RED}Critical tests failed. Fix issues before deploying.${NC}"
    echo ""
    echo -e "${YELLOW}Review test logs:${NC}"
    echo -e "  API Tests: /tmp/api-smoke-tests.log"
    if [ "$SKIP_UI_TESTS" != "true" ]; then
        echo -e "  UI Tests:  /tmp/ui-smoke-tests.log"
    fi
    echo ""
    exit 1
fi
