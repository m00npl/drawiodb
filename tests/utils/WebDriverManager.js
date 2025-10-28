const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class WebDriverManager {
  constructor() {
    this.driver = null;
    this.screenshotCounter = 0;
  }

  async initDriver() {
    let options;

    switch (config.BROWSER.toLowerCase()) {
      case 'firefox':
        options = new firefox.Options();
        if (config.HEADLESS) {
          options.addArguments('--headless');
        }
        this.driver = await new Builder()
          .forBrowser('firefox')
          .setFirefoxOptions(options)
          .build();
        break;

      case 'chrome':
      default:
        options = new chrome.Options();
        if (config.HEADLESS) {
          options.addArguments('--headless');
        }
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');

        this.driver = await new Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .build();
        break;
    }

    await this.driver.manage().setTimeouts({
      implicit: config.UI_TIMEOUT,
      pageLoad: config.NETWORK_TIMEOUT,
      script: config.UI_TIMEOUT
    });

    return this.driver;
  }

  async takeScreenshot(testName) {
    if (!this.driver) return null;

    try {
      const screenshot = await this.driver.takeScreenshot();
      const filename = `${testName.replace(/[^a-z0-9]/gi, '_')}_${++this.screenshotCounter}.png`;
      const filepath = path.join(config.SCREENSHOT_DIR, filename);

      await fs.writeFile(filepath, screenshot, 'base64');
      return filename;
    } catch (error) {
      console.warn('Failed to take screenshot:', error.message);
      return null;
    }
  }

  async waitForElement(selector, timeout = config.UI_TIMEOUT) {
    return await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
  }

  async waitForElementVisible(selector, timeout = config.UI_TIMEOUT) {
    const element = await this.waitForElement(selector, timeout);
    await this.driver.wait(until.elementIsVisible(element), timeout);
    return element;
  }

  async waitForText(selector, text, timeout = config.UI_TIMEOUT) {
    return await this.driver.wait(until.elementTextContains(
      await this.waitForElement(selector, timeout),
      text
    ), timeout);
  }

  async clickElement(selector) {
    const element = await this.waitForElementVisible(selector);
    await this.driver.executeScript("arguments[0].scrollIntoView(true);", element);
    await this.driver.sleep(500); // Small delay for scroll
    await element.click();
    return element;
  }

  async typeText(selector, text, clear = true) {
    const element = await this.waitForElementVisible(selector);
    if (clear) {
      await element.clear();
    }
    await element.sendKeys(text);
    return element;
  }

  async getText(selector) {
    const element = await this.waitForElementVisible(selector);
    return await element.getText();
  }

  async isElementPresent(selector) {
    try {
      await this.driver.findElement(By.css(selector));
      return true;
    } catch (error) {
      return false;
    }
  }

  async isElementVisible(selector) {
    try {
      const element = await this.driver.findElement(By.css(selector));
      return await element.isDisplayed();
    } catch (error) {
      return false;
    }
  }

  async executePollScriptWith(script, args, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.driver.executeScript(script, ...args);
        if (result) return result;
      } catch (error) {
        // Continue polling
      }
      await this.driver.sleep(100);
    }

    throw new Error(`Polling script timed out after ${timeout}ms`);
  }

  async waitForAjax(timeout = 10000) {
    return await this.executePollScriptWith(
      'return typeof jQuery !== "undefined" ? jQuery.active === 0 : true',
      [],
      timeout
    );
  }

  async waitForDrawIOLoad(timeout = 30000) {
    return await this.executePollScriptWith(
      'return typeof EditorUi !== "undefined" && typeof window.ui !== "undefined"',
      [],
      timeout
    );
  }

  async waitForGolemPluginLoad(timeout = 15000) {
    return await this.executePollScriptWith(
      'return typeof window.golemPluginLoaded !== "undefined" && window.golemPluginLoaded === true',
      [],
      timeout
    );
  }

  async getNetworkErrors() {
    try {
      const logs = await this.driver.manage().logs().get('browser');
      return logs.filter(log =>
        log.level.name === 'SEVERE' &&
        (log.message.includes('net::') || log.message.includes('Failed to fetch'))
      );
    } catch (error) {
      return [];
    }
  }

  async getConsoleErrors() {
    try {
      const logs = await this.driver.manage().logs().get('browser');
      return logs.filter(log => log.level.name === 'SEVERE');
    } catch (error) {
      return [];
    }
  }

  async close() {
    if (this.driver) {
      await this.driver.quit();
      this.driver = null;
    }
  }

  // Helper method for retrying flaky operations
  async retry(operation, maxRetries = config.MAX_RETRIES) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await this.driver.sleep(config.RETRY_DELAY);
        }
      }
    }

    throw lastError;
  }
}

module.exports = WebDriverManager;