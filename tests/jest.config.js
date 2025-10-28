module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/setup.js'],

  // Test patterns
  testMatch: [
    '<rootDir>/**/*.test.js'
  ],

  // Coverage settings
  collectCoverage: false,
  collectCoverageFrom: [
    'utils/**/*.js',
    '!utils/**/*.test.js',
    '!**/node_modules/**'
  ],

  // Timeout settings
  testTimeout: 120000, // 2 minutes per test

  // Reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './reports',
      outputName: 'junit.xml',
      suiteName: 'DrawIO Golem DB Plugin Tests'
    }]
  ],

  // Global setup/teardown
  globalSetup: '<rootDir>/global-setup.js',
  globalTeardown: '<rootDir>/global-teardown.js',

  // Module paths
  modulePaths: ['<rootDir>'],

  // Verbose output
  verbose: true,

  // Force exit to prevent hanging
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Maximum concurrent tests
  maxConcurrency: 1, // Run tests sequentially to avoid browser conflicts

  // Note: retry option not supported in this Jest version
  // retry: 1,

  // Test result processor for custom reporting
  testResultsProcessor: '<rootDir>/utils/test-processor.js'
};