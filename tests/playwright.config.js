const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  fullyParallel: false, // Run one at a time for debugging
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for stability
  reporter: 'html',
  use: {
    baseURL: 'file:///C:/Users/Al/Desktop/Veritas_MVP/pwa', // Direct file access
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Show browser for debugging
      },
    },
  ],
});