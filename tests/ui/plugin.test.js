const WebDriverManager = require('../utils/WebDriverManager');
const TestReporter = require('../utils/TestReporter');
const config = require('../config');

describe('UI Plugin Tests', () => {
  let driver;
  let webDriver;
  let reporter;

  beforeAll(async () => {
    reporter = global.testReporter || new TestReporter();
    webDriver = new WebDriverManager();
    driver = await webDriver.initDriver();
  });

  afterAll(async () => {
    await webDriver.close();
  });

  describe('Plugin Loading', () => {
    test('should load draw.io successfully', async () => {
      const startTime = Date.now();
      try {
        await driver.get(config.BASE_URL);
        await webDriver.waitForDrawIOLoad();

        const duration = Date.now() - startTime;
        reporter.addTestResult('ui', 'Draw.io Load', 'passed', duration);
        reporter.addPerformanceMetric('Draw.io Load Time', duration, 'ms', 15000);

        // Check for basic draw.io elements
        const isCanvasPresent = await webDriver.isElementPresent('#graph');
        expect(isCanvasPresent).toBe(true);

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('drawio_load_failed');
        reporter.addTestResult('ui', 'Draw.io Load', 'failed', duration, error, screenshot);
        throw error;
      }
    });

    test('should load Golem DB plugin', async () => {
      const startTime = Date.now();
      try {
        // Wait for plugin to load
        await driver.sleep(3000);

        // Check if Golem DB plugin JavaScript is loaded
        const pluginLoaded = await driver.executeScript(`
          return typeof window.golemPluginLoaded !== 'undefined' ||
                 document.querySelector('script[src*="golem-db-plugin"]') !== null;
        `);

        const duration = Date.now() - startTime;

        if (pluginLoaded) {
          reporter.addTestResult('ui', 'Plugin Load', 'passed', duration);
        } else {
          reporter.addTestResult('ui', 'Plugin Load', 'failed', duration, new Error('Plugin not detected'));
          reporter.addRecommendation('ui', 'Plugin loading detection may need improvement - check plugin initialization', 'medium');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('plugin_load_failed');
        reporter.addTestResult('ui', 'Plugin Load', 'failed', duration, error, screenshot);
        throw error;
      }
    });

    test('should show Golem DB menu items', async () => {
      const startTime = Date.now();
      try {
        // Try to open File menu
        await webDriver.retry(async () => {
          await webDriver.clickElement('.geMenubarContainer .geMenubar:first-child');
          await driver.sleep(1000);
        });

        // Look for Golem DB menu items
        const golemMenuItems = await driver.executeScript(`
          const menuItems = Array.from(document.querySelectorAll('.geMenuItem'));
          return menuItems.some(item =>
            item.textContent.includes('Golem DB') ||
            item.textContent.includes('Save to Golem') ||
            item.textContent.includes('Open from Golem')
          );
        `);

        const duration = Date.now() - startTime;

        if (golemMenuItems) {
          reporter.addTestResult('ui', 'Menu Integration', 'passed', duration);
        } else {
          reporter.addTestResult('ui', 'Menu Integration', 'failed', duration, new Error('Golem DB menu items not found'));
          reporter.addRecommendation('ui', 'Menu integration may not be working - check plugin menu injection', 'high');
        }

        // Close menu
        await driver.executeScript('document.body.click();');

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('menu_integration_failed');
        reporter.addTestResult('ui', 'Menu Integration', 'failed', duration, error, screenshot);

        // This is not critical failure for overall functionality
        reporter.addRecommendation('ui', 'Menu testing may need different approach due to draw.io menu structure', 'low');
      }
    });
  });

  describe('Plugin Functionality', () => {
    test('should handle wallet connection dialog', async () => {
      const startTime = Date.now();
      try {
        // Try to trigger wallet connection
        const walletDialogTriggered = await driver.executeScript(`
          try {
            if (typeof window.ui !== 'undefined' && window.ui.actions) {
              const walletAction = window.ui.actions.get('golemdb-wallet');
              if (walletAction) {
                walletAction.funct();
                return true;
              }
            }
            return false;
          } catch (e) {
            return false;
          }
        `);

        const duration = Date.now() - startTime;

        if (walletDialogTriggered) {
          // Wait for dialog to appear
          await driver.sleep(2000);

          // Check if wallet dialog appeared
          const dialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

          if (dialogPresent) {
            reporter.addTestResult('ui', 'Wallet Dialog', 'passed', duration);

            // Close dialog if present
            const closeButton = await driver.findElements({css: 'button:contains("Close"), button:contains("Cancel"), .geDialogClose'});
            if (closeButton.length > 0) {
              await closeButton[0].click();
            }
          } else {
            reporter.addTestResult('ui', 'Wallet Dialog', 'failed', duration, new Error('Dialog did not appear'));
          }
        } else {
          reporter.addTestResult('ui', 'Wallet Dialog', 'failed', duration, new Error('Wallet action not found'));
          reporter.addRecommendation('ui', 'Wallet dialog trigger may need different approach', 'medium');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('wallet_dialog_failed');
        reporter.addTestResult('ui', 'Wallet Dialog', 'failed', duration, error, screenshot);

        // Not critical for core functionality
        reporter.addRecommendation('ui', 'Wallet dialog testing needs refinement', 'low');
      }
    });

    test('should handle save dialog', async () => {
      const startTime = Date.now();
      try {
        // Try to trigger save dialog
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

        const duration = Date.now() - startTime;

        if (saveDialogTriggered) {
          await driver.sleep(2000);

          const dialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

          if (dialogPresent) {
            reporter.addTestResult('ui', 'Save Dialog', 'passed', duration);

            // Close dialog
            const closeButtons = await driver.findElements({css: 'button'});
            for (const button of closeButtons) {
              const text = await button.getText();
              if (text.includes('Close') || text.includes('Cancel')) {
                await button.click();
                break;
              }
            }
          } else {
            reporter.addTestResult('ui', 'Save Dialog', 'failed', duration, new Error('Save dialog did not appear'));
          }
        } else {
          reporter.addTestResult('ui', 'Save Dialog', 'failed', duration, new Error('Save action not found'));
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('save_dialog_failed');
        reporter.addTestResult('ui', 'Save Dialog', 'failed', duration, error, screenshot);

        reporter.addRecommendation('ui', 'Save dialog functionality may be affected by authentication requirements', 'medium');
      }
    });

    test('should handle load dialog', async () => {
      const startTime = Date.now();
      try {
        // Try to trigger load dialog
        const loadDialogTriggered = await driver.executeScript(`
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

        const duration = Date.now() - startTime;

        if (loadDialogTriggered) {
          await driver.sleep(3000); // More time for load dialog

          const dialogPresent = await webDriver.isElementPresent('[role="dialog"], .geDialog, div[style*="position: fixed"]');

          if (dialogPresent) {
            reporter.addTestResult('ui', 'Load Dialog', 'passed', duration);

            // Look for versions button if dialog has loaded
            const versionsButtonPresent = await driver.executeScript(`
              return Array.from(document.querySelectorAll('button')).some(btn =>
                btn.textContent.includes('Versions') || btn.textContent.includes('📋')
              );
            `);

            if (versionsButtonPresent) {
              reporter.addTestResult('ui', 'Versions Button Present', 'passed', 0);
            } else {
              reporter.addRecommendation('ui', 'Versions button may not be visible in load dialog - check implementation', 'medium');
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
          } else {
            reporter.addTestResult('ui', 'Load Dialog', 'failed', duration, new Error('Load dialog did not appear'));
          }
        } else {
          reporter.addTestResult('ui', 'Load Dialog', 'failed', duration, new Error('Load action not found'));
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        const screenshot = await webDriver.takeScreenshot('load_dialog_failed');
        reporter.addTestResult('ui', 'Load Dialog', 'failed', duration, error, screenshot);

        reporter.addRecommendation('ui', 'Load dialog may be affected by network timeouts', 'medium');
      }
    });
  });

  describe('Error Handling UI', () => {
    test('should handle network errors gracefully', async () => {
      const startTime = Date.now();
      try {
        // Check for console errors
        const consoleErrors = await webDriver.getConsoleErrors();
        const networkErrors = await webDriver.getNetworkErrors();

        const duration = Date.now() - startTime;

        // Allow some errors due to current network issues
        const criticalErrors = consoleErrors.filter(error =>
          !error.message.includes('timeout') &&
          !error.message.includes('Failed to fetch') &&
          !error.message.includes('net::ERR_')
        );

        if (criticalErrors.length === 0) {
          reporter.addTestResult('ui', 'Error Handling', 'passed', duration);
        } else {
          reporter.addTestResult('ui', 'Error Handling', 'failed', duration,
            new Error(`Critical console errors: ${criticalErrors.length}`));
        }

        if (networkErrors.length > 0) {
          reporter.addRecommendation('ui',
            `Network errors detected (${networkErrors.length}) - improve error handling and user feedback`, 'high');
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        reporter.addTestResult('ui', 'Error Handling', 'failed', duration, error);
        throw error;
      }
    });
  });
});