// Horizontal overflow check for phone widths (#63).
//
// The rule is the one a player feels: the page must not scroll sideways,
// i.e. document.documentElement.scrollWidth <= window.innerWidth. When it
// does, the message names the outermost elements that stick out past the
// viewport, so the cause is in the CI log rather than in a debugging
// session. #62 (a 2,353px play screen) reads like this:
//
//   375×667 /play question: page is 2353px wide in a 375px viewport.
//   Outermost offenders:
//     div.grid.grid-cols-1.md:grid-cols-[1fr_240px] (x 24 to 2353, 2329px wide)
import { expect } from "@playwright/test";

export async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
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
    return { innerWidth: vw, scrollWidth, offenders };
  });
}

export function overflowMessage(label, viewport, { innerWidth, scrollWidth, offenders }) {
  const where = `${viewport.width}×${viewport.height} ${label}`;
  if (scrollWidth <= innerWidth) return `${where}: fits (${scrollWidth}px)`;
  const list = offenders.length
    ? offenders.slice(0, 8).map((o) => `    ${o}`).join("\n") +
      (offenders.length > 8 ? `\n    …and ${offenders.length - 8} more` : "")
    : "    (none found outside a clipping container; look for negative margins or 100vw widths)";
  return (
    `${where}: page is ${scrollWidth}px wide in a ${innerWidth}px viewport, so it scrolls sideways.\n` +
    `  Outermost offenders:\n${list}`
  );
}

// Soft assertion, so one run reports every overflowing screen at once.
export async function expectNoOverflow(page, label) {
  const result = await measureOverflow(page);
  const viewport = page.viewportSize();
  expect
    .soft(result.scrollWidth, overflowMessage(label, viewport, result))
    .toBeLessThanOrEqual(result.innerWidth);
  return result;
}
