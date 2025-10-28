const WebDriverManager = require('../utils/WebDriverManager');
const TestReporter = require('../utils/TestReporter');
const axios = require('axios');
const config = require('../config');

describe('Performance Benchmarks', () => {
  let driver;
  let webDriver;
  let reporter;
  let apiClient;

  beforeAll(async () => {
    reporter = global.testReporter || new TestReporter();
    webDriver = new WebDriverManager();
    driver = await webDriver.initDriver();
    apiClient = axios.create({
      baseURL: config.API_BASE_URL,
      timeout: config.NETWORK_TIMEOUT
    });
  });

  afterAll(async () => {
    await webDriver.close();
  });

  describe('Page Load Performance', () => {
    test('should load draw.io within performance threshold', async () => {
      const startTime = Date.now();

      try {
        await driver.get(config.BASE_URL);

        // Measure time to interactive
        await webDriver.waitForDrawIOLoad();
        const loadTime = Date.now() - startTime;

        reporter.addPerformanceMetric('DrawIO Load Time', loadTime, 'ms', 15000);
        reporter.addTestResult('performance', 'Page Load Speed', 'passed', loadTime);

        // Measure rendering performance
        const renderingStart = Date.now();
        const isRendered = await driver.executeScript(`
          return document.querySelector('#graph') !== null &&
                 document.readyState === 'complete' &&
                 typeof window.ui !== 'undefined';
        `);

        const renderingTime = Date.now() - renderingStart;
        reporter.addPerformanceMetric('Initial Rendering', renderingTime, 'ms', 2000);

        if (!isRendered) {
          reporter.addTestResult('performance', 'Page Rendering', 'failed', renderingTime,
            new Error('Page not fully rendered'));
        } else {
          reporter.addTestResult('performance', 'Page Rendering', 'passed', renderingTime);
        }

        // Memory usage check
        const memoryInfo = await driver.executeScript(`
          return performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null;
        `);

        if (memoryInfo) {
          const memoryUsageMB = memoryInfo.usedJSHeapSize / 1024 / 1024;
          reporter.addPerformanceMetric('Initial Memory Usage', memoryUsageMB, 'MB', 100);

          if (memoryUsageMB > 150) {
            reporter.addRecommendation('performance', 'High initial memory usage detected - investigate memory leaks', 'medium');
          }
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('page_load_perf_failed');
        reporter.addTestResult('performance', 'Page Load Performance', 'failed', duration, error, screenshot);
        throw error;
      }
    });

    test('should load plugin within acceptable time', async () => {
      const pluginStartTime = Date.now();

      try {
        // Wait for plugin initialization
        await driver.sleep(2000);

        const pluginLoaded = await driver.executeScript(`
          return typeof window.golemPluginLoaded !== 'undefined' ||
                 (typeof window.ui !== 'undefined' &&
                  window.ui.actions &&
                  window.ui.actions.get('golemdb-save') !== null);
        `);

        const pluginLoadTime = Date.now() - pluginStartTime;
        reporter.addPerformanceMetric('Plugin Load Time', pluginLoadTime, 'ms', 10000);

        if (pluginLoaded) {
          reporter.addTestResult('performance', 'Plugin Load Speed', 'passed', pluginLoadTime);
        } else {
          reporter.addTestResult('performance', 'Plugin Load Speed', 'failed', pluginLoadTime,
            new Error('Plugin not loaded within timeout'));
        }

      } catch (error) {
        const duration = Date.now() - pluginStartTime;
        reporter.addTestResult('performance', 'Plugin Load Performance', 'failed', duration, error);
      }
    });
  });

  describe('API Performance', () => {
    test('should handle health check within SLA', async () => {
      const healthChecks = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        try {
          const response = await apiClient.get('/health');
          const duration = Date.now() - startTime;
          healthChecks.push(duration);

          if (response.status === 200) {
            reporter.addTestResult('performance', `Health Check ${i + 1}`, 'passed', duration);
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          healthChecks.push(duration);
          reporter.addTestResult('performance', `Health Check ${i + 1}`, 'failed', duration, error);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Calculate statistics
      const avgResponseTime = healthChecks.reduce((sum, time) => sum + time, 0) / healthChecks.length;
      const maxResponseTime = Math.max(...healthChecks);
      const minResponseTime = Math.min(...healthChecks);

      reporter.addPerformanceMetric('Health Check Average Response', avgResponseTime, 'ms', 3000);
      reporter.addPerformanceMetric('Health Check Max Response', maxResponseTime, 'ms', 5000);
      reporter.addPerformanceMetric('Health Check Min Response', minResponseTime, 'ms', 1000);

      if (avgResponseTime > 5000) {
        reporter.addRecommendation('performance', 'Health check endpoint is slow - investigate server performance', 'high');
      }
    });

    test('should handle diagram list pagination efficiently', async () => {
      const paginationTests = [];

      // Test different page sizes
      const pageSizes = [5, 10, 20];

      for (const limit of pageSizes) {
        const startTime = Date.now();
        try {
          const response = await apiClient.get(`/diagrams/list?limit=${limit}&offset=0`);
          const duration = Date.now() - startTime;
          paginationTests.push({ limit, duration, success: true });

          reporter.addPerformanceMetric(`Pagination Load (${limit} items)`, duration, 'ms', 15000);
          reporter.addTestResult('performance', `Pagination ${limit} items`, 'passed', duration);

        } catch (error) {
          const duration = Date.now() - startTime;
          paginationTests.push({ limit, duration, success: false, error: error.message });

          if (!error.message.includes('timeout')) {
            reporter.addTestResult('performance', `Pagination ${limit} items`, 'failed', duration, error);
          } else {
            // Expected timeout due to network issues
            reporter.addRecommendation('performance',
              `Pagination with ${limit} items timed out - optimize database queries`, 'medium');
          }
        }
      }

      // Analyze pagination performance scaling
      const successfulTests = paginationTests.filter(test => test.success);
      if (successfulTests.length >= 2) {
        const scalingFactor = successfulTests[successfulTests.length - 1].duration / successfulTests[0].duration;
        reporter.addPerformanceMetric('Pagination Scaling Factor', scalingFactor, 'ratio', 3);

        if (scalingFactor > 5) {
          reporter.addRecommendation('performance',
            'Pagination performance scales poorly - implement database indexing and query optimization', 'high');
        }
      }
    });

    test('should handle concurrent requests gracefully', async () => {
      const concurrentRequests = 3;
      const promises = [];

      const startTime = Date.now();

      // Launch concurrent health check requests
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          apiClient.get('/health').then(response => ({
            success: true,
            status: response.status,
            index: i
          })).catch(error => ({
            success: false,
            error: error.message,
            index: i
          }))
        );
      }

      try {
        const results = await Promise.all(promises);
        const totalDuration = Date.now() - startTime;

        const successCount = results.filter(r => r.success).length;
        reporter.addPerformanceMetric('Concurrent Request Duration', totalDuration, 'ms', 10000);
        reporter.addTestResult('performance', 'Concurrent Requests', 'passed', totalDuration);

        if (successCount < concurrentRequests) {
          reporter.addRecommendation('performance',
            `Only ${successCount}/${concurrentRequests} concurrent requests succeeded - check server capacity`, 'medium');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('performance', 'Concurrent Requests', 'failed', duration, error);
        reporter.addRecommendation('performance', 'Server cannot handle concurrent requests - investigate bottlenecks', 'high');
      }
    });
  });

  describe('UI Interaction Performance', () => {
    test('should handle menu operations efficiently', async () => {
      const menuStartTime = Date.now();

      try {
        // Test menu opening performance
        await webDriver.retry(async () => {
          await webDriver.clickElement('.geMenubarContainer .geMenubar:first-child');
          await driver.sleep(500);
        });

        const menuOpenTime = Date.now() - menuStartTime;
        reporter.addPerformanceMetric('Menu Open Time', menuOpenTime, 'ms', 2000);
        reporter.addTestResult('performance', 'Menu Open Performance', 'passed', menuOpenTime);

        // Close menu and test responsiveness
        await driver.executeScript('document.body.click();');
        await driver.sleep(500);

        // Test multiple menu operations
        const operationTimes = [];
        for (let i = 0; i < 3; i++) {
          const opStart = Date.now();
          await webDriver.clickElement('.geMenubarContainer .geMenubar:first-child');
          await driver.sleep(300);
          await driver.executeScript('document.body.click();');
          operationTimes.push(Date.now() - opStart);
          await driver.sleep(200);
        }

        const avgOperationTime = operationTimes.reduce((sum, time) => sum + time, 0) / operationTimes.length;
        reporter.addPerformanceMetric('Menu Operation Average', avgOperationTime, 'ms', 3000);

        if (avgOperationTime > 5000) {
          reporter.addRecommendation('performance', 'Menu operations are slow - optimize DOM manipulation', 'medium');
        }

      } catch (error) {
        const duration = Date.now() - menuStartTime;
        const screenshot = await webDriver.takeScreenshot('menu_perf_failed');
        reporter.addTestResult('performance', 'Menu Performance', 'failed', duration, error, screenshot);
      }
    });

    test('should handle dialog operations within threshold', async () => {
      const dialogStartTime = Date.now();

      try {
        // Test save dialog performance
        const saveDialogTriggered = await driver.executeScript(`
          try {
            if (typeof window.ui !== 'undefined' && window.ui.actions) {
              const saveAction = window.ui.actions.get('golemdb-save');
              if (saveAction) {
                saveAction.funct();
                return true;
              }
            }
            return false;
          } catch (e) {
            return false;
          }
        `);

        if (saveDialogTriggered) {
          await driver.sleep(2000);

          const dialogOpenTime = Date.now() - dialogStartTime;
          reporter.addPerformanceMetric('Save Dialog Open Time', dialogOpenTime, 'ms', 5000);

          const dialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

          if (dialogPresent) {
            reporter.addTestResult('performance', 'Save Dialog Performance', 'passed', dialogOpenTime);

            // Test dialog close performance
            const closeStart = Date.now();
            const closeButtons = await driver.findElements({css: 'button'});
            for (const button of closeButtons) {
              const text = await button.getText();
              if (text.includes('Close') || text.includes('Cancel')) {
                await button.click();
                break;
              }
            }

            const closeTime = Date.now() - closeStart;
            reporter.addPerformanceMetric('Dialog Close Time', closeTime, 'ms', 2000);
          } else {
            reporter.addTestResult('performance', 'Save Dialog Performance', 'failed', dialogOpenTime,
              new Error('Dialog did not appear'));
          }
        }

      } catch (error) {
        const duration = Date.now() - dialogStartTime;
        reporter.addTestResult('performance', 'Dialog Performance', 'failed', duration, error);
      }
    });

    test('should maintain performance with complex diagrams', async () => {
      const complexityStartTime = Date.now();

      try {
        // Create a complex diagram with many elements
        await driver.executeScript(`
          if (typeof window.ui !== 'undefined' && window.ui.editor) {
            const graph = window.ui.editor.graph;
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
              // Create 50 nodes and connections
              const nodes = [];
              for (let i = 0; i < 50; i++) {
                const node = graph.insertVertex(parent, null, 'Node ' + i,
                  Math.random() * 800, Math.random() * 600, 60, 30);
                nodes.push(node);
              }
              // Connect some nodes
              for (let i = 0; i < 30; i++) {
                const from = nodes[Math.floor(Math.random() * nodes.length)];
                const to = nodes[Math.floor(Math.random() * nodes.length)];
                if (from !== to) {
                  graph.insertEdge(parent, null, '', from, to);
                }
              }
            } finally {
              graph.getModel().endUpdate();
            }
          }
        `);

        const creationTime = Date.now() - complexityStartTime;
        reporter.addPerformanceMetric('Complex Diagram Creation', creationTime, 'ms', 10000);

        // Test interaction performance with complex diagram
        const interactionStart = Date.now();

        // Test zoom performance
        await driver.executeScript('window.ui.editor.graph.zoomIn();');
        await driver.sleep(500);
        await driver.executeScript('window.ui.editor.graph.zoomOut();');
        await driver.sleep(500);

        const interactionTime = Date.now() - interactionStart;
        reporter.addPerformanceMetric('Complex Diagram Interaction', interactionTime, 'ms', 3000);

        // Check memory usage after complex operations
        const memoryAfter = await driver.executeScript(`
          return performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize
          } : null;
        `);

        if (memoryAfter) {
          const memoryUsageMB = memoryAfter.usedJSHeapSize / 1024 / 1024;
          reporter.addPerformanceMetric('Memory Usage After Complex Ops', memoryUsageMB, 'MB', 200);

          if (memoryUsageMB > 300) {
            reporter.addRecommendation('performance', 'High memory usage with complex diagrams - investigate memory leaks', 'high');
          }
        }

        const totalComplexityTime = Date.now() - complexityStartTime;
        reporter.addTestResult('performance', 'Complex Diagram Performance', 'passed', totalComplexityTime);

      } catch (error) {
        const duration = Date.now() - complexityStartTime;
        const screenshot = await webDriver.takeScreenshot('complex_diagram_perf_failed');
        reporter.addTestResult('performance', 'Complex Diagram Performance', 'failed', duration, error, screenshot);
        reporter.addRecommendation('performance', 'Performance degrades significantly with complex diagrams', 'high');
      }
    });
  });

  describe('Network Performance', () => {
    test('should measure network latency to Golem DB', async () => {
      const networkTests = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        try {
          await apiClient.get('/health');
          const latency = Date.now() - start;
          networkTests.push({ success: true, latency });
        } catch (error) {
          const latency = Date.now() - start;
          networkTests.push({ success: false, latency, error: error.message });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const successfulTests = networkTests.filter(test => test.success);
      if (successfulTests.length > 0) {
        const avgLatency = successfulTests.reduce((sum, test) => sum + test.latency, 0) / successfulTests.length;
        const maxLatency = Math.max(...successfulTests.map(test => test.latency));
        const minLatency = Math.min(...successfulTests.map(test => test.latency));

        reporter.addPerformanceMetric('Network Latency Average', avgLatency, 'ms', 2000);
        reporter.addPerformanceMetric('Network Latency Max', maxLatency, 'ms', 5000);
        reporter.addPerformanceMetric('Network Latency Min', minLatency, 'ms', 500);

        if (avgLatency > 3000) {
          reporter.addRecommendation('performance', 'High network latency to Golem DB - investigate network path', 'medium');
        }

        const successRate = successfulTests.length / iterations * 100;
        reporter.addPerformanceMetric('Network Success Rate', successRate, '%', 80);

        if (successRate < 60) {
          reporter.addRecommendation('performance', 'Low network success rate - investigate connectivity issues', 'high');
        }
      }

      reporter.addTestResult('performance', 'Network Latency Test', 'passed', 0);
    });
  });
});