import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const skipWebServer = Boolean(process.env.PLAYWRIGHT_SKIP_WEBSERVER);

/**
 * Test end-to-end leggeri (smoke UI). Avvio stack locale:
 *   pnpm dev
 * poi in altro terminale:
 *   set PLAYWRIGHT_SKIP_WEBSERVER=1 && pnpm test:e2e   (Windows)
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm test:e2e       (Unix)
 *
 * Oppure lasciare che Playwright avvii solo il frontend (`next dev` su :3000).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: skipWebServer
    ? undefined
    : {
        command: "corepack pnpm --filter @payday/frontend dev",
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
