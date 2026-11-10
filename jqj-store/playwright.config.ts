import { defineConfig, devices } from "@playwright/test";

const fakeEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test_dummy",
  SUPABASE_SERVICE_ROLE_KEY: "test_dummy",
  AIRWALLEX_ENV: "sandbox",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Chromium only. WEB-011 extends this project for the stepped checkout
    // and the sticky pay bar; iPhone/WebKit stays out so the job stays fast.
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: fakeEnv,
  },
});
