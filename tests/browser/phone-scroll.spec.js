// Each new question must start on screen on a phone.
//
// The reveal card and its explanation sit below the question, so a player
// on a phone scrolls down to reach Continue. Before the fix the next
// question then typed out above the viewport and had to be scrolled back
// up to every time. Runs once per phone project in playwright.config.js.
import { test, expect } from "@playwright/test";
import { Game, seedRandom } from "./support/game.js";

test("Continue brings the next question into view", async ({ page }, testInfo) => {
  await seedRandom(page, Number(process.env.PW_SEED || 1));
  const game = new Game(page);
  await game.open({ skipRules: true });
  await game.enterName();
  await game.waitForModulePick();
  await game.startGame();

  await game.choose({ correct: true });
  expect(await game.lock(), `correct answer to ${game.question.id} marked wrong`).toBe(true);

  // Where a player is when they tap Continue: scrolled down to it.
  const status = (rung) => page.getByText(new RegExp(`^Question ${rung} of 15`));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const before = await status(1).boundingBox();
  // Otherwise this screen fits without scrolling and the check proves nothing.
  expect(before.y, "Q1 status line should be above the viewport before Continue").toBeLessThan(0);

  await page.getByRole("button", { name: /^Continue to Q2/ }).tap();
  await expect(status(2)).toBeVisible();

  const viewport = page.viewportSize();
  await expect
    .poll(async () => (await status(2).boundingBox()).y, {
      message: "Q2 status line should be on screen after Continue",
    })
    .toBeGreaterThanOrEqual(0);
  expect((await status(2).boundingBox()).y).toBeLessThan(viewport.height / 2);
  testInfo.annotations.push({ type: "question", description: game.question.id });
});
