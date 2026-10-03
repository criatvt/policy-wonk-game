// Desktop and tablet must not move (#63, #5).
//
// Phone-only UI work (M1 to M3) promises that 1280×800 desktop and an
// 820×1180 touch tablet look exactly as they did. This records the
// geometry of every visible text run and painted box, in both themes, and
// compares it with the committed baselines in layout-baselines/.
//
// Intended layout change? `npm run test:layout:update`, then review and
// commit the JSON diff alongside the change that caused it.
import { expect, test } from "@playwright/test";
import { Game, MODULES, pinQuestionBank, seedRandom, settle } from "./support/game.js";
import { captureThemes, expectLayout, expectWebFonts } from "./support/geometry.js";

const STATIC_PAGES = [
  "/",
  "/notes/",
  `/notes/${MODULES[0].id}/`,
  "/login",
  "/login?show=email",
  "/privacy",
  "/search",
  "/this-page-does-not-exist",
];

test("static pages keep their desktop and tablet layout", async ({ page }, testInfo) => {
  const snapshot = {};
  for (const path of STATIC_PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    // The email form is revealed client-side; measure it, not the chooser.
    if (path.includes("show=email")) await expect(page.locator('input[type="email"]')).toBeVisible();
    await expectWebFonts(page);
    Object.assign(snapshot, await captureThemes(page, path, settle));
  }
  await expectLayout(snapshot, testInfo, "pages");
});

test("/play keeps its desktop and tablet layout", async ({ page }, testInfo) => {
  await seedRandom(page, 63);
  await pinQuestionBank(page);
  const game = new Game(page);
  const snapshot = {};
  const capture = async (state) => Object.assign(snapshot, await captureThemes(page, state, settle));

  await game.open({ skipRules: true });
  await expectWebFonts(page);
  await capture("name");
  await game.enterName();
  await game.waitForModulePick();
  await capture("module pick");

  await game.startGame();
  await capture("question Q1");
  await game.choose({ correct: true });
  await capture("answer selected");
  await game.lock();
  await capture("correct reveal");

  await game.fastForward();
  while (game.rung < 6) await game.answerCorrectlyAndContinue();
  await capture("question Q6");
  await game.useFiftyFifty();
  await capture("50:50 used");
  await game.openLifelinePanel("poll");
  await capture("audience poll panel");
  await game.closeLifelinePanel();
  await game.openLifelinePanel("professor");
  await capture("professor panel");
  await game.closeLifelinePanel();
  await game.openWalkAway();
  await capture("walk-away confirm");
  await game.stayInGame();

  await game.choose({ correct: false });
  await game.lock();
  await capture("wrong reveal");
  await game.seeResult();
  await capture("end screen");

  await expectLayout(snapshot, testInfo, "play");
});
