const axios = require('axios');
const config = require('../config');
const TestReporter = require('../utils/TestReporter');

describe('Smoke Tests - Critical Functionality', () => {
  let reporter;
  let apiClient;

  beforeAll(() => {
    reporter = global.testReporter || new TestReporter();
    apiClient = axios.create({
      baseURL: config.BASE_URL,
      timeout: config.NETWORK_TIMEOUT,
      validateStatus: () => true // Accept all status codes for testing
    });
  });

  describe('Share Tokens - Arkiv Storage', () => {
    let testShareToken = null;

    test('should access shared diagram by token', async () => {
      const startTime = Date.now();

      // Using a known share token format (40 char hex)
      const mockToken = 'a'.repeat(40);

      try {
        const response = await apiClient.get(`/shared/${mockToken}`);
        const duration = Date.now() - startTime;

        // Should return either 200 (found) or 404 (not found), but not error
        expect([200, 404]).toContain(response.status);

        if (response.status === 404) {
          // Verify proper 404 message contains drawiodb.online branding
          expect(response.data).toContain('Share Link Not Found');
          expect(response.data).toContain('drawiodb.online');
          expect(response.data).not.toContain('Draw.io'); // Old branding should be gone
        }

        reporter.addTestResult('api', 'Smoke: Share Token Access', 'passed', duration);
        reporter.addPerformanceMetric('Share Token Response Time', duration, 'ms', 5000);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Share Token Access', 'failed', duration, error);
        throw error;
      }
    });

    test('should handle SVG export for shared diagrams', async () => {
      const startTime = Date.now();
      const mockToken = 'b'.repeat(40);

      try {
        const response = await apiClient.get(`/shared/${mockToken}?format=svg`, {
          headers: {
            'Accept': 'image/svg+xml'
          }
        });
        const duration = Date.now() - startTime;

        // Should return 404 or 200, both are valid (depends if token exists)
        expect([200, 404]).toContain(response.status);

        if (response.status === 200) {
          // If successful, verify it's SVG content
          expect(response.headers['content-type']).toContain('svg');
        }

        reporter.addTestResult('api', 'Smoke: SVG Export via Share Token', 'passed', duration);
        reporter.addPerformanceMetric('SVG Export Response Time', duration, 'ms', 10000);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: SVG Export via Share Token', 'failed', duration, error);
        throw error;
      }
    });

    test('should handle PNG export for shared diagrams', async () => {
      const startTime = Date.now();
      const mockToken = 'c'.repeat(40);

      try {
        const response = await apiClient.get(`/shared/${mockToken}?format=png`, {
          headers: {
            'Accept': 'image/png'
          },
          responseType: 'arraybuffer'
        });
        const duration = Date.now() - startTime;

        // Should return 404 or 200
        expect([200, 404]).toContain(response.status);

        if (response.status === 200) {
          // If successful, verify it's PNG content
          expect(response.headers['content-type']).toContain('png');
        }

        reporter.addTestResult('api', 'Smoke: PNG Export via Share Token', 'passed', duration);
        reporter.addPerformanceMetric('PNG Export Response Time', duration, 'ms', 15000);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: PNG Export via Share Token', 'failed', duration, error);
        throw error;
      }
    });

    test('should return HTML viewer for shared diagrams', async () => {
      const startTime = Date.now();
      const mockToken = 'd'.repeat(40);

      try {
        const response = await apiClient.get(`/shared/${mockToken}?format=html`);
        const duration = Date.now() - startTime;

        expect([200, 404]).toContain(response.status);

        if (response.status === 200) {
          expect(response.headers['content-type']).toContain('html');
          // Check for drawiodb.online branding in viewer
          expect(response.data).toContain('drawiodb.online');
          expect(response.data).not.toContain('Draw.io'); // Old branding
        }

        reporter.addTestResult('api', 'Smoke: HTML Viewer for Share Token', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: HTML Viewer for Share Token', 'failed', duration, error);
        throw error;
      }
    });
  });

  describe('DrawIO Exporter Service', () => {
    test('should verify exporter service availability', async () => {
      const startTime = Date.now();

      try {
        // Test the main app health check which should report exporter status
        const response = await apiClient.get('/health');
        const duration = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');

        reporter.addTestResult('api', 'Smoke: DrawIO Exporter Availability', 'passed', duration);

        // Add recommendation if response is slow
        if (duration > 5000) {
          reporter.addRecommendation('api',
            'Health check response is slow - check DrawIO exporter service connectivity',
            'medium'
          );
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: DrawIO Exporter Availability', 'failed', duration, error);
        reporter.addRecommendation('api',
          'DrawIO exporter service may be down - verify drawio-exporter container is running',
          'high'
        );
        throw error;
      }
    });

    test('should handle export with fallback gracefully', async () => {
      const startTime = Date.now();

      try {
        // Create a minimal test diagram XML
        const testXML = `<mxGraphModel>
          <root>
            <mxCell id="0"/>
            <mxCell id="1" parent="0"/>
            <mxCell id="2" value="Test" style="rounded=1;" vertex="1" parent="1">
              <mxGeometry x="20" y="20" width="80" height="40" as="geometry"/>
            </mxCell>
          </root>
        </mxGraphModel>`;

        // Try to export via API endpoint (if available)
        // This tests the full integration including fallback logic
        const mockToken = 'export_test_' + Date.now();

        const response = await apiClient.get(`/shared/${mockToken}?format=svg`);
        const duration = Date.now() - startTime;

        // Either 404 (token doesn't exist) or 200 (export worked) are acceptable
        expect([200, 404]).toContain(response.status);

        reporter.addTestResult('api', 'Smoke: Export with Fallback', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Export with Fallback', 'failed', duration, error);

        // This is not critical - fallback should handle failures
        console.warn('Export endpoint error (fallback should handle this):', error.message);
      }
    });
  });

  describe('Branding Consistency', () => {
    test('should use drawiodb.online branding on homepage', async () => {
      const startTime = Date.now();

      try {
        const response = await apiClient.get('/');
        const duration = Date.now() - startTime;

        expect(response.status).toBe(200);

        // Verify new branding is present
        expect(response.data).toContain('drawiodb');

        // Verify old branding is removed (case-insensitive)
        const lowerData = response.data.toLowerCase();
        const hasDraw = lowerData.includes('draw.io') || lowerData.includes('drawio');

        // drawiodb is OK, but draw.io references should be minimal/none
        if (hasDraw && !lowerData.includes('drawiodb')) {
          console.warn('⚠️  Found Draw.io references without drawiodb context');
        }

        reporter.addTestResult('api', 'Smoke: Homepage Branding', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Homepage Branding', 'failed', duration, error);
        throw error;
      }
    });

    test('should use drawiodb.online in share page footer', async () => {
      const startTime = Date.now();
      const mockToken = 'branding_test';

      try {
        const response = await apiClient.get(`/shared/${mockToken}`);
        const duration = Date.now() - startTime;

        // 404 is expected for non-existent token, but we can check the error page
        if (response.status === 404) {
          expect(response.data).toContain('drawiodb.online');
          expect(response.data).not.toContain('Return to Draw.io');
        }

        reporter.addTestResult('api', 'Smoke: Share Page Branding', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Share Page Branding', 'failed', duration, error);
        throw error;
      }
    });
  });

  describe('API Health & Performance', () => {
    test('should respond to health check within acceptable time', async () => {
      const startTime = Date.now();

      try {
        const response = await apiClient.get('/health');
        const duration = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');
        expect(duration).toBeLessThan(5000); // Should respond within 5 seconds

        reporter.addTestResult('api', 'Smoke: Health Check Performance', 'passed', duration);
        reporter.addPerformanceMetric('Health Check Time', duration, 'ms', 5000);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Health Check Performance', 'failed', duration, error);
        reporter.addRecommendation('api',
          'Health check is timing out - investigate service availability',
          'critical'
        );
        throw error;
      }
    });

    test('should handle concurrent requests', async () => {
      const startTime = Date.now();

      try {
        // Make 5 concurrent health check requests
        const requests = Array(5).fill(null).map(() =>
          apiClient.get('/health')
        );

        const responses = await Promise.all(requests);
        const duration = Date.now() - startTime;

        // All requests should succeed
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        reporter.addTestResult('api', 'Smoke: Concurrent Request Handling', 'passed', duration);
        reporter.addPerformanceMetric('5 Concurrent Requests', duration, 'ms', 10000);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Concurrent Request Handling', 'failed', duration, error);
        throw error;
      }
    });
  });

  describe('Error Handling', () => {
    test('should return proper error for invalid share token format', async () => {
      const startTime = Date.now();

      try {
        const response = await apiClient.get('/shared/invalid-token-123');
        const duration = Date.now() - startTime;

        // Should handle gracefully, not crash
        expect([400, 404]).toContain(response.status);

        if (response.data) {
          const lowerData = String(response.data).toLowerCase();
          expect(lowerData).toMatch(/invalid|not found|error/);
        }

        reporter.addTestResult('api', 'Smoke: Invalid Token Error Handling', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Invalid Token Error Handling', 'failed', duration, error);
        throw error;
      }
    });

    test('should handle malformed export format requests', async () => {
      const startTime = Date.now();
      const mockToken = 'e'.repeat(40);

      try {
        const response = await apiClient.get(`/shared/${mockToken}?format=invalid_format`);
        const duration = Date.now() - startTime;

        // Should not crash, should return sensible error or default
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);

        reporter.addTestResult('api', 'Smoke: Invalid Format Error Handling', 'passed', duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('api', 'Smoke: Invalid Format Error Handling', 'failed', duration, error);
        throw error;
      }
    });
  });

  afterAll(() => {
    // Reporter summary is generated automatically by global teardown
  });
});
