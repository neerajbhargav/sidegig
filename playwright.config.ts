// End-to-end checks: the built extension in Chromium (e2e/extension.spec.ts) and the
// preview smoke flows (e2e/preview.spec.ts). Build first: `npm run build:chrome && npm run preview`.
// E2E_CHANNEL=chrome runs them in an installed Google Chrome instead of Playwright's Chromium.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { channel: process.env.E2E_CHANNEL ?? 'chromium', headless: true, trace: 'retain-on-failure' },
  // The smoke scripts expect the preview on 127.0.0.1:8765. Never reuse a server already on that
  // port: it may serve another checkout's dist/, and the checks would pass on the wrong build.
  // Stop any preview server first; the run starts its own from this folder's dist/.
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:8765/preview/',
    reuseExistingServer: false,
  },
});
