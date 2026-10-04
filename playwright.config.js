// Browser checks against the built site (#63). Two suites:
//
//   tests/browser/phone-overflow.spec.js  phones must not scroll sideways
//   tests/browser/layout.spec.js          desktop and tablet must not move
//
// Both run against `astro preview` of a fresh `npm run build`, started and
// stopped by the webServer block below. Set PW_SKIP_BUILD=1 to preview an
// existing dist/ instead (CI builds in its own step so a broken build is
// reported as a build failure, not a test failure).
//
// Playwright is a dev dependency only. Nothing here ships to players.
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PW_PORT || 4391);
const BASE_URL = `http://localhost:${PORT}`;
const CI = !!process.env.CI;

const preview = `npm run preview -- --port ${PORT}`;

// Real phone emulation: isMobile honours the viewport meta tag and hasTouch
// flips `pointer: coarse`, which is what the phone detection in #65 keys on.
// Device scale factors are the real handsets' (iPhone SE, iPhone 15,
// Pixel 7); they do not change CSS layout but do change rounding.
const phones = [
  { name: "phone-375", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  { name: "phone-393", viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
  { name: "phone-412", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 },
];

export default defineConfig({
  testDir: "./tests/browser",
  // Each test drives its own browser context, so tests are independent and
  // the three phone playthroughs can run side by side. Most of their time
  // is spent waiting on the question typewriter, not on CPU.
  fullyParallel: true,
  workers: CI ? 5 : undefined,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    ...phones.map(({ name, viewport, deviceScaleFactor }) => ({
      name,
      testMatch: /phone-(overflow|scroll)\.spec\.js/,
      use: { viewport, deviceScaleFactor, isMobile: true, hasTouch: true },
    })),
    {
      name: "desktop-1280",
      testMatch: /layout\.spec\.js/,
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      // iPad Air portrait. Its short side is over 600px, so it is not a
      // "phone" and must keep the desktop layout.
      name: "tablet-820",
      testMatch: /layout\.spec\.js/,
      use: {
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.PW_SKIP_BUILD ? preview : `npm run build && ${preview}`,
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
