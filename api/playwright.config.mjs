import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  timeout: 15000,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    timezoneId: 'Europe/Paris',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  webServer: {
    command: 'node browser-server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1000 },
  },
});
