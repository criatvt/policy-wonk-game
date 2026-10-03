// Phones must not scroll sideways (#63, after #62).
//
// Runs once per phone project in playwright.config.js (375×667, 393×852,
// 412×915, all with touch and mobile emulation). Every screen is checked
// with a soft assertion, so a failing run lists every overflowing screen
// and the elements responsible, not just the first.
import { test, expect } from "@playwright/test";
import { Game, MODULES, seedRandom } from "./support/game.js";
import { expectNoOverflow } from "./support/overflow.js";

const STATIC_PAGES = [
  { path: "/", status: 200 },
  { path: "/notes/", status: 200 },
  { path: `/notes/${MODULES[0].id}/`, status: 200 },
  { path: "/login", status: 200 },
  // The email form, shown client-side; #65 resized its input on phones.
  { path: "/login?show=email", status: 200, ready: 'input[type="email"]' },
  { path: "/privacy", status: 200 },
  { path: "/search", status: 200 },
  { path: "/this-page-does-not-exist", status: 404 },
];

// A different seed per phone, so the three runs between them see three
// different sets of questions. Deterministic per commit; set PW_SEED to
// reproduce or vary a run.
const SEEDS = { "phone-375": 375, "phone-393": 393, "phone-412": 412 };

function watchPageErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("static pages fit a phone screen", async ({ page }) => {
  const errors = watchPageErrors(page);
  for (const { path, status, ready } of STATIC_PAGES) {
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect.soft(response?.status(), `${path} HTTP status`).toBe(status);
    if (ready) await expect(page.locator(ready)).toBeVisible();
    await expectNoOverflow(page, path);
  }
  expect(errors, "Uncaught errors in the page").toEqual([]);
});

test("/play fits a phone screen in every game state", async ({ page }, testInfo) => {
  const seed = Number(process.env.PW_SEED || SEEDS[testInfo.project.name] || 1);
  testInfo.annotations.push({ type: "seed", description: String(seed) });
  await seedRandom(page, seed);
  const errors = watchPageErrors(page);
  const game = new Game(page);
  const at = (state) => `/play ${state}`;

  // First visit: name, then each rules card.
  await game.open();
  await expectNoOverflow(page, at("name"));
  await game.enterName();
  await game.walkRules((stage) => expectNoOverflow(page, at(`rules ${stage}`)));
  await game.waitForModulePick();
  await expectNoOverflow(page, at("module pick"));

  // Q1 typed out in full, the way a player first sees it.
  await game.startGame();
  await expectNoOverflow(page, at(`question Q1 (${game.question.id})`));
  await game.choose({ correct: true });
  await expectNoOverflow(page, at("answer selected"));
  expect(await game.lock(), `correct answer to ${game.question.id} marked wrong`).toBe(true);
  await expectNoOverflow(page, at("correct reveal"));

  // Through to Q6, where lifelines and walk-away unlock.
  // Every question and reveal on the way, since the rung messages differ
  // (tier clear at Q4, safety net at Q5).
  await game.fastForward();
  while (game.rung < 6) {
    await expectNoOverflow(page, at(`question Q${game.rung} (${game.question.id})`));
    await game.choose({ correct: true });
    expect(await game.lock(), `correct answer to ${game.question.id} marked wrong`).toBe(true);
    await expectNoOverflow(page, at(`Q${game.rung} correct reveal`));
    await game.fastForward();
  }
  await expectNoOverflow(page, at(`question Q6 (${game.question.id})`));

  await game.useFiftyFifty();
  await expectNoOverflow(page, at("50:50 used"));
  await game.openLifelinePanel("poll");
  await expectNoOverflow(page, at("audience poll panel"));
  await game.closeLifelinePanel();
  await game.openLifelinePanel("professor");
  await expectNoOverflow(page, at("professor panel"));
  await game.closeLifelinePanel();

  await game.openWalkAway();
  await expectNoOverflow(page, at("walk-away confirm"));
  await game.stayInGame();

  await game.choose({ correct: false });
  expect(await game.lock(), `wrong answer to ${game.question.id} marked correct`).toBe(false);
  await expectNoOverflow(page, at("wrong reveal"));
  await game.seeResult();
  await expectNoOverflow(page, at("end screen"));

  expect(errors, "Uncaught errors in the page").toEqual([]);
});
