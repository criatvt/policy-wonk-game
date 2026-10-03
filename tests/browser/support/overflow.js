// Horizontal overflow check for phone widths (#63).
//
// The rule is the one a player feels: the page must not scroll sideways,
// i.e. document.documentElement.scrollWidth <= the screen width. When it
// does, the message names the outermost elements that stick out past the
// viewport, so the cause is in the CI log rather than in a debugging
// session. With the #62 fix reverted it reads:
//
//   375×667 /play question Q1 (cp10-q008): page is 2353px wide in a 375px
//   viewport, so it scrolls sideways.
//     Outermost offenders:
//       section.flex.flex-col.gap-5 "Question 1 of 15 — easy15sWhat is the La" (x 24 to 2353, 2329px wide)
//       aside.md:order-2 "Ladder11,00022,00035,000410,000525,000•6" (x 24 to 2353, 2329px wide)
import { expect, test } from "@playwright/test";

// Measured against the emulated screen width, not window.innerWidth. With
// mobile emulation, Chromium zooms out to fit an overflowing page and
// innerWidth grows with it (1500px on a 375px phone for the #62 page), so
// a smaller overflow could hide behind a naive check.
export async function measureOverflow(page) {
  const { width } = page.viewportSize();
  return page.evaluate((vw) => {
    const scrollWidth = document.documentElement.scrollWidth;
    const outside = (r) => r.right > vw + 0.5 || r.left < -0.5;

    // Content inside a scroll or clip container that itself fits is fine:
    // that is how the phone ladder strip is meant to work.
    const clippedByFittingAncestor = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible" && !outside(p.getBoundingClientRect())) {
          return true;
        }
      }
      return false;
    };

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : "";
      const cls = [...el.classList].slice(0, 4).map((c) => `.${c}`).join("");
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
    };

    const flagged = new Set();
    const offenders = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (!outside(r) || clippedByFittingAncestor(el)) continue;
      flagged.add(el);
      // Report the outermost offender of each subtree only. Its children
      // are usually just along for the ride.
      if (flagged.has(el.parentElement)) continue;
      offenders.push(
        `${describe(el)} (x ${Math.round(r.left)} to ${Math.round(r.right)}, ${Math.round(r.width)}px wide)`,
      );
    }
    return { screenWidth: vw, scrollWidth, offenders };
  }, width);
}

export function overflowMessage(label, viewport, { screenWidth, scrollWidth, offenders }) {
  const where = `${viewport.width}×${viewport.height} ${label}`;
  if (scrollWidth <= screenWidth) return `${where}: fits (${scrollWidth}px)`;
  const list = offenders.length
    ? offenders.slice(0, 8).map((o) => `    ${o}`).join("\n") +
      (offenders.length > 8 ? `\n    …and ${offenders.length - 8} more` : "")
    : "    (none found outside a clipping container; look for negative margins or 100vw widths)";
  return (
    `${where}: page is ${scrollWidth}px wide in a ${screenWidth}px viewport, so it scrolls sideways.\n` +
    `  Outermost offenders:\n${list}`
  );
}

// Soft assertion, so one run reports every overflowing screen at once. Each
// check is its own step, so the report lists every screen that was checked.
export async function expectNoOverflow(page, label) {
  return test.step(`no overflow: ${label}`, async () => {
    const result = await measureOverflow(page);
    const viewport = page.viewportSize();
    expect
      .soft(result.scrollWidth, overflowMessage(label, viewport, result))
      .toBeLessThanOrEqual(result.screenWidth);
    return result;
  });
}
