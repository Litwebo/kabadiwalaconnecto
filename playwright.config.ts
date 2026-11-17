import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
        '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
      args: ['--no-sandbox'],
    },
  },
});
