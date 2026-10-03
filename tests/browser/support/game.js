// Drives /play through real game states for the browser checks (#63).
//
// Everything here finds things the way a player does: by visible text and
// accessible names, never by Tailwind classes or DOM shape, so the play
// screen can be refactored (#68) without rewriting the tests.
//
// Lessons carried over from the #62 overflow probe:
// - Clicks use dispatchEvent("click"). Playwright's normal click hit-tests
//   the element's centre, which fails when the page overflows sideways,
//   and an overflowing page is exactly what these tests exist to catch.
// - A question is only "ready" once a full stem from the module's bank is
//   on screen and all four options are typed out. The typewriter renders
//   partial text that looks ready to a naive wait.
// - Runtime options are shuffled and the correct answer is hashed, so the
//   right answer is looked up from the authoring bank by stem and option
//   text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const MODULES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/modules.json"), "utf8"),
);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function loadBank(moduleId) {
  const file = path.join(ROOT, "src/data/questions", `${moduleId}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")).map((q) => ({
    id: q.id,
    stem: norm(q.question),
    options: q.options.map(norm),
    correct: norm(q.options[q.correctIndex]),
  }));
}

// Replace Math.random with a seeded PRNG before any app code runs, so a run
// is reproducible: the same seed picks the same questions, poll numbers,
// 50:50 eliminations and professor lines. Re-applied on every navigation,
// including the reloads used by fastForward().
export async function seedRandom(page, seed) {
  await page.addInitScript((seed) => {
    let a = seed >>> 0;
    Math.random = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

// Serve the game a fixed slice of the module's runtime bank: the lowest ids
// in each difficulty, exactly as many as one game needs. The session plan
// then no longer depends on the rest of the bank, so adding or editing
// other questions does not move the layout baselines.
export async function pinQuestionBank(page) {
  const need = { easy: 4, medium: 4, hard: 4, expert: 3 };
  await page.route("**/data/questions/*.json", async (route) => {
    const response = await route.fetch();
    const bank = await response.json();
    if (!Array.isArray(bank)) return route.fulfill({ response });
    const sorted = [...bank].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const pinned = Object.entries(need).flatMap(([difficulty, n]) =>
      sorted.filter((q) => q.difficulty === difficulty).slice(0, n),
    );
    await route.fulfill({ response, json: pinned });
  });
}

export class Game {
  constructor(page, { moduleId = MODULES[0].id, playerName = "Probe Player" } = {}) {
    this.page = page;
    this.module = MODULES.find((m) => m.id === moduleId);
    if (!this.module) throw new Error(`Unknown module ${moduleId}`);
    this.playerName = playerName;
    this.bank = loadBank(moduleId);
    this.byId = new Map(this.bank.map((q) => [q.id, q]));
    this.question = null;
    this.rung = 0;
  }

  button(name, options = {}) {
    return this.page.getByRole("button", { name, ...options });
  }

  async click(locator) {
    await expect(locator).toBeEnabled();
    await locator.dispatchEvent("click");
  }

  // Load /play. `skipRules` marks the rules walkthrough as already seen,
  // which is what a returning player gets.
  async open({ skipRules = false } = {}) {
    if (skipRules) {
      await this.page.addInitScript(() => {
        try {
          localStorage.setItem("policyWonk:rulesSeen", "true");
        } catch {}
      });
    }
    await this.page.goto("/play", { waitUntil: "networkidle" });
    // The island is client:only, so an empty page here means it crashed
    // (the v0.1.5 blank /play).
    await expect(this.page.getByRole("textbox")).toBeVisible();
  }

  async enterName() {
    await this.page.getByRole("textbox").fill(this.playerName);
    await this.click(this.button(/^Continue/));
  }

  // Step through every rules card, calling `onStage` on each one.
  async walkRules(onStage) {
    for (let stage = 1; ; stage++) {
      await expect(this.button(/^(Next|Pick your module)/)).toBeVisible();
      await onStage?.(stage);
      const next = this.button(/^Next/);
      if (await next.count()) {
        await this.click(next);
      } else {
        await this.click(this.button(/^Pick your module/));
        return;
      }
    }
  }

  async waitForModulePick() {
    await expect(this.button("Start the game")).toBeVisible();
  }

  async startGame() {
    await this.click(this.button(this.module.name, { exact: true }));
    await this.click(this.button("Start the game"));
    await this.waitForQuestion();
  }

  // Wait until a question from the bank is fully on screen: the complete
  // stem plus all four options typed out and faded in. Returns the
  // authoring-bank entry, which carries the correct answer.
  async waitForQuestion() {
    const previous = this.question?.id ?? null;
    const entries = this.bank.map((q) => [q.id, q.stem, q.options]);
    const handle = await this.page.waitForFunction(
      ({ entries, previous }) => {
        const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const root = document.querySelector("main") ?? document.body;
        const text = norm(root.textContent);
        const buttons = [...root.querySelectorAll("button")].map((b) => ({
          text: norm(b.textContent),
          shown: getComputedStyle(b).opacity === "1",
        }));
        for (const [id, stem, options] of entries) {
          if (id === previous || !text.includes(stem)) continue;
          const typed = options.every((o) =>
            buttons.some((b) => b.shown && b.text.endsWith(o) && b.text.length <= o.length + 2),
          );
          if (typed) return id;
        }
        return null;
      },
      { entries, previous },
      { timeout: 90_000, polling: 100 },
    );
    const id = await handle.jsonValue();
    this.question = this.byId.get(id);
    this.rung += 1;
    return this.question;
  }

  // Click an option: the correct one, or the first wrong one still on offer
  // (50:50 may have struck some out).
  async choose({ correct }) {
    const { options, correct: answer } = this.question;
    const picked = await this.page.evaluate(
      ({ options, answer, correct }) => {
        const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const root = document.querySelector("main") ?? document.body;
        const want = correct ? [answer] : options.filter((o) => o !== answer);
        for (const o of want) {
          const b = [...root.querySelectorAll("button")].find((b) => {
            const t = norm(b.textContent);
            return t.endsWith(o) && t.length <= o.length + 2;
          });
          if (b && !b.disabled) {
            b.click();
            return o;
          }
        }
        return null;
      },
      { options, answer, correct },
    );
    if (!picked) {
      throw new Error(
        `No ${correct ? "correct" : "wrong"} option was clickable for ${this.question.id}`,
      );
    }
    return picked;
  }

  // Lock the selected answer and wait for the reveal. Returns true when the
  // game called it correct.
  async lock() {
    await this.click(this.button("Lock answer"));
    const next = this.button(/^(Continue to Q\d+|See result)/);
    await expect(next.first()).toBeVisible();
    return (await this.button(/^Continue to Q\d+/).count()) > 0;
  }

  async continueToNext() {
    await this.click(this.button(/^Continue to Q\d+/));
  }

  // Skip the typewriter for the next question by reloading. The game
  // persists to sessionStorage and a rehydrated question renders fully
  // composed, the same as a player refreshing mid-game. Saves about fifteen
  // seconds per question on the way to Q6.
  async fastForward() {
    const rung = this.rung + 1;
    await this.continueToNext();
    // Reload only once the next rung has been persisted, or the reload
    // would land back on the reveal.
    await this.page.waitForFunction(
      (rung) =>
        Object.keys(sessionStorage).some((k) => {
          const v = sessionStorage.getItem(k) || "";
          return (
            new RegExp(`"currentRung":${rung}[,}]`).test(v) &&
            v.includes('"status":"reveal-question"')
          );
        }),
      rung,
    );
    await this.page.reload({ waitUntil: "networkidle" });
    return this.waitForQuestion();
  }

  // Answer correctly and move on, typing the next question out in full.
  async answerCorrectlyAndContinue({ fast = true } = {}) {
    await this.choose({ correct: true });
    const right = await this.lock();
    if (!right) throw new Error(`The game marked the correct answer to ${this.question.id} wrong`);
    if (fast) return this.fastForward();
    await this.continueToNext();
    return this.waitForQuestion();
  }

  lifeline(which) {
    const names = {
      fiftyFifty: /50\s*:\s*50/,
      poll: /Audience|Poll/i,
      professor: /Professor|Prof\./i,
    };
    return this.button(names[which]).first();
  }

  async useFiftyFifty() {
    await this.click(this.lifeline("fiftyFifty"));
    const { options } = this.question;
    await this.page.waitForFunction((options) => {
      const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
      const root = document.querySelector("main") ?? document.body;
      const struck = [...root.querySelectorAll("button")].filter((b) => {
        const t = norm(b.textContent);
        return b.disabled && options.some((o) => t.endsWith(o) && t.length <= o.length + 2);
      });
      return struck.length === 2;
    }, options);
  }

  // Poll and professor open a panel that the player closes.
  async openLifelinePanel(which) {
    await this.click(this.lifeline(which));
    await expect(this.button(/^Close$/i)).toBeVisible();
  }

  async closeLifelinePanel() {
    await this.click(this.button(/^Close$/i));
    await expect(this.button(/^Close$/i)).toHaveCount(0);
  }

  async openWalkAway() {
    await this.click(this.button("Walk away", { exact: true }));
    await expect(this.button("Stay in the game")).toBeVisible();
  }

  async stayInGame() {
    await this.click(this.button("Stay in the game"));
    await expect(this.button("Lock answer")).toBeVisible();
  }

  async seeResult() {
    await this.click(this.button("See result"));
    await expect(this.button(/^Play/).first()).toBeVisible();
  }
}

// Wait for the page to stop changing: network idle, web fonts loaded and
// any finite CSS transition or animation finished. Infinite ones (the
// typewriter caret) are ignored.
export async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.race([
      Promise.allSettled(finite.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  });
}
