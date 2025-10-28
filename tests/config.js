module.exports = {
  // Test environment configuration
  BASE_URL: process.env.TEST_BASE_URL || 'https://drawiodb.online',
  API_BASE_URL: process.env.TEST_API_URL || 'https://drawiodb.online/api',

  // Test timeouts
  DEFAULT_TIMEOUT: 30000,
  NETWORK_TIMEOUT: 60000,
  UI_TIMEOUT: 15000,

  // Browser configuration
  BROWSER: process.env.TEST_BROWSER || 'chrome',
  HEADLESS: process.env.TEST_HEADLESS !== 'false',

  // Test data
  TEST_WALLET_ADDRESS: '0x742d35Cc6638C0532C3C3e4Af96E0e4c3E8A93E2',
  TEST_CUSTODIAL_ID: 'test_custodial_user_123',

  // Test diagram data
  TEST_DIAGRAM: {
    title: 'Test Diagram',
    content: `<mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Test Shape" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>`
  },

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,

  // Report configuration
  REPORT_DIR: './test-reports',
  SCREENSHOT_DIR: './test-reports/screenshots'
};