import { defineConfig } from '@playwright/test'

export default defineConfig({
  workers: 2,
  testDir: './test/browser',
  testMatch: '**/*.browser.ts',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    ...(process.env.PW_BROWSER_CHANNEL ? { channel: process.env.PW_BROWSER_CHANNEL } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177/test/browser/form.html',
    reuseExistingServer: !process.env.CI,
  },
})
