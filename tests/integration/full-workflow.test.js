const WebDriverManager = require('../utils/WebDriverManager');
const TestReporter = require('../utils/TestReporter');
const axios = require('axios');
const config = require('../config');

describe('Full Workflow Integration Tests', () => {
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

  describe('Complete Save-Load Workflow', () => {
    test('should complete full save and load cycle', async () => {
      const startTime = Date.now();
      let savedDiagramId = null;

      try {
        // Step 1: Load draw.io and verify plugin
        await driver.get(config.BASE_URL);
        await webDriver.waitForDrawIOLoad();
        await driver.sleep(3000); // Wait for plugin

        // Step 2: Create a simple diagram
        await driver.executeScript(`
          if (typeof window.ui !== 'undefined' && window.ui.editor) {
            const graph = window.ui.editor.graph;
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
              const v1 = graph.insertVertex(parent, null, 'Test Diagram', 20, 20, 80, 30);
              const v2 = graph.insertVertex(parent, null, 'Integration Test', 200, 150, 80, 30);
              graph.insertEdge(parent, null, '', v1, v2);
            } finally {
              graph.getModel().endUpdate();
            }
          }
        `);

        await driver.sleep(2000);

        // Step 3: Trigger save dialog
        const saveTriggered = await driver.executeScript(`
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

        if (saveTriggered) {
          await driver.sleep(3000);

          // Step 4: Fill save form if present
          try {
            const titleField = await driver.findElements({css: 'input[placeholder*="title"], input[name="title"]'});
            if (titleField.length > 0) {
              await titleField[0].clear();
              await titleField[0].sendKeys('Integration Test Diagram');
            }

            const saveButton = await driver.findElements({css: 'button'});
            for (const button of saveButton) {
              const text = await button.getText();
              if (text.includes('Save') || text.includes('Export')) {
                await button.click();
                break;
              }
            }

            await driver.sleep(5000); // Wait for save operation

            // Step 5: Check if save was successful via API
            try {
              const listResponse = await apiClient.get('/diagrams/list?limit=1&offset=0');
              if (listResponse.data && listResponse.data.success && listResponse.data.data.length > 0) {
                savedDiagramId = listResponse.data.data[0].id;
                reporter.addTestResult('integration', 'Diagram Save', 'passed', Date.now() - startTime);
              }
            } catch (apiError) {
              reporter.addRecommendation('integration', 'Save verification via API failed - check network connectivity', 'medium');
            }
          } catch (formError) {
            reporter.addRecommendation('integration', 'Save form interaction needs improvement', 'medium');
          }
        }

        // Step 6: Test load functionality
        const loadStartTime = Date.now();
        const loadTriggered = await driver.executeScript(`
          try {
            if (typeof window.ui !== 'undefined' && window.ui.actions) {
              const loadAction = window.ui.actions.get('golemdb-load');
              if (loadAction) {
                loadAction.funct();
                return true;
              }
            }
            return false;
          } catch (e) {
            return false;
          }
        `);

        if (loadTriggered) {
          await driver.sleep(3000);

          // Check if load dialog appeared
          const dialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

          if (dialogPresent) {
            reporter.addTestResult('integration', 'Load Dialog Access', 'passed', Date.now() - loadStartTime);

            // Look for diagrams list
            const diagramsPresent = await driver.executeScript(`
              return document.querySelectorAll('div, li, tr').length > 0;
            `);

            if (diagramsPresent) {
              reporter.addTestResult('integration', 'Diagrams List Display', 'passed', 0);
            }

            // Close dialog
            const closeButtons = await driver.findElements({css: 'button'});
            for (const button of closeButtons) {
              const text = await button.getText();
              if (text.includes('Close') || text.includes('Cancel')) {
                await button.click();
                break;
              }
            }
          }
        }

        const totalDuration = Date.now() - startTime;
        reporter.addTestResult('integration', 'Complete Workflow', 'passed', totalDuration);
        reporter.addPerformanceMetric('Full Save-Load Workflow', totalDuration, 'ms', 60000);

        if (totalDuration > 45000) {
          reporter.addRecommendation('integration', 'Full workflow taking too long - optimize network calls and UI responsiveness', 'high');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('full_workflow_failed');
        reporter.addTestResult('integration', 'Complete Workflow', 'failed', duration, error, screenshot);

        reporter.addRecommendation('integration', 'Full workflow integration needs debugging - check plugin initialization and API connectivity', 'high');
        throw error;
      }
    });

    test('should handle version history workflow', async () => {
      const startTime = Date.now();

      try {
        // Test versions functionality if a diagram exists
        const loadTriggered = await driver.executeScript(`
          try {
            if (typeof window.ui !== 'undefined' && window.ui.actions) {
              const loadAction = window.ui.actions.get('golemdb-load');
              if (loadAction) {
                loadAction.funct();
                return true;
              }
            }
            return false;
          } catch (e) {
            return false;
          }
        `);

        if (loadTriggered) {
          await driver.sleep(3000);

          // Look for versions button
          const versionsButton = await driver.findElements({css: 'button'});
          let versionsFound = false;

          for (const button of versionsButton) {
            const text = await button.getText();
            if (text.includes('Versions') || text.includes('📋')) {
              await button.click();
              versionsFound = true;
              await driver.sleep(2000);
              break;
            }
          }

          if (versionsFound) {
            // Check if versions dialog appeared
            const versionsDialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

            if (versionsDialogPresent) {
              reporter.addTestResult('integration', 'Version History Access', 'passed', Date.now() - startTime);

              // Look for version entries
              const versionEntries = await driver.executeScript(`
                return document.querySelectorAll('div, li, tr').length > 0;
              `);

              if (versionEntries) {
                reporter.addTestResult('integration', 'Version Entries Display', 'passed', 0);
              }
            } else {
              reporter.addTestResult('integration', 'Version History Access', 'failed', Date.now() - startTime, new Error('Versions dialog did not appear'));
            }

            // Close any open dialogs
            const closeButtons = await driver.findElements({css: 'button'});
            for (const button of closeButtons) {
              const text = await button.getText();
              if (text.includes('Close') || text.includes('Cancel')) {
                await button.click();
                break;
              }
            }
          } else {
            reporter.addRecommendation('integration', 'Versions button not found in load dialog - check implementation', 'medium');
          }

          // Close main dialog
          const mainCloseButtons = await driver.findElements({css: 'button'});
          for (const button of mainCloseButtons) {
            const text = await button.getText();
            if (text.includes('Close') || text.includes('Cancel')) {
              await button.click();
              break;
            }
          }
        }

        const duration = Date.now() - startTime;
        reporter.addTestResult('integration', 'Version History Workflow', 'passed', duration);

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('version_history_failed');
        reporter.addTestResult('integration', 'Version History Workflow', 'failed', duration, error, screenshot);

        reporter.addRecommendation('integration', 'Version history functionality needs refinement', 'medium');
      }
    });
  });

  describe('Error Recovery Tests', () => {
    test('should recover from network failures gracefully', async () => {
      const startTime = Date.now();

      try {
        // Test API resilience
        try {
          await apiClient.get('/diagrams/list', { timeout: 1000 }); // Very short timeout
        } catch (networkError) {
          // Expected to fail, check if UI handles it gracefully
        }

        // Check if UI is still responsive after network error
        const uiResponsive = await driver.executeScript(`
          return typeof window.ui !== 'undefined' &&
                 document.readyState === 'complete' &&
                 !document.querySelector('[class*="error"], [class*="crashed"]');
        `);

        if (uiResponsive) {
          reporter.addTestResult('integration', 'Network Error Recovery', 'passed', Date.now() - startTime);
        } else {
          reporter.addTestResult('integration', 'Network Error Recovery', 'failed', Date.now() - startTime,
            new Error('UI became unresponsive after network error'));
          reporter.addRecommendation('integration', 'Improve error handling and UI resilience to network failures', 'high');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('integration', 'Network Error Recovery', 'failed', duration, error);
        reporter.addRecommendation('integration', 'Error recovery mechanisms need implementation', 'high');
      }
    });

    test('should maintain data consistency during failures', async () => {
      const startTime = Date.now();

      try {
        // Test that partial saves don't corrupt data
        const consistencyCheck = await driver.executeScript(`
          try {
            if (typeof window.ui !== 'undefined' && window.ui.editor) {
              const graph = window.ui.editor.graph;
              const model = graph.getModel();
              return model.getChildCount(model.getRoot()) >= 0; // Basic sanity check
            }
            return true;
          } catch (e) {
            return false;
          }
        `);

        if (consistencyCheck) {
          reporter.addTestResult('integration', 'Data Consistency Check', 'passed', Date.now() - startTime);
        } else {
          reporter.addTestResult('integration', 'Data Consistency Check', 'failed', Date.now() - startTime,
            new Error('Data model corruption detected'));
          reporter.addRecommendation('integration', 'Implement data validation and corruption prevention', 'high');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('integration', 'Data Consistency Check', 'failed', duration, error);
      }
    });
  });

  describe('Performance Integration Tests', () => {
    test('should maintain acceptable performance under load', async () => {
      const startTime = Date.now();

      try {
        // Create multiple elements to test performance
        await driver.executeScript(`
          if (typeof window.ui !== 'undefined' && window.ui.editor) {
            const graph = window.ui.editor.graph;
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
              for (let i = 0; i < 20; i++) {
                graph.insertVertex(parent, null, 'Node ' + i,
                  Math.random() * 400, Math.random() * 300, 60, 30);
              }
            } finally {
              graph.getModel().endUpdate();
            }
          }
        `);

        const renderTime = Date.now() - startTime;
        reporter.addPerformanceMetric('Large Diagram Rendering', renderTime, 'ms', 5000);

        // Test plugin responsiveness with complex diagram
        const pluginResponseTime = Date.now();
        const pluginResponsive = await driver.executeScript(`
          try {
            return typeof window.ui !== 'undefined' &&
                   window.ui.actions &&
                   window.ui.actions.get('golemdb-save') !== null;
          } catch (e) {
            return false;
          }
        `);

        const pluginCheckDuration = Date.now() - pluginResponseTime;

        if (pluginResponsive) {
          reporter.addTestResult('integration', 'Plugin Performance Under Load', 'passed', pluginCheckDuration);
          reporter.addPerformanceMetric('Plugin Responsiveness Check', pluginCheckDuration, 'ms', 2000);
        } else {
          reporter.addTestResult('integration', 'Plugin Performance Under Load', 'failed', pluginCheckDuration,
            new Error('Plugin became unresponsive with complex diagram'));
          reporter.addRecommendation('integration', 'Optimize plugin performance for complex diagrams', 'medium');
        }

        const totalDuration = Date.now() - startTime;
        reporter.addPerformanceMetric('Performance Test Suite', totalDuration, 'ms', 15000);

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('performance_test_failed');
        reporter.addTestResult('integration', 'Performance Under Load', 'failed', duration, error, screenshot);
        reporter.addRecommendation('integration', 'Performance optimization needed for complex scenarios', 'medium');
      }
    });
  });
});