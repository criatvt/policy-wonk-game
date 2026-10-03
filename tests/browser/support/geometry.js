// Layout-geometry snapshots for the desktop and tablet regression guard
// (#63, #5: "desktop and tablets do not change").
//
// Pixel screenshots differ between macOS and the Linux CI runner and fall
// over whenever a web font is slow, so this records where things are
// instead. A snapshot is two kinds of item, both keyed by what a reader
// sees rather than by DOM shape:
//
//   text   each run of text, grouped by its nearest block box, measured by
//          the glyphs' own rectangles (Range.getClientRects). Wrapping text
//          in a span, or swapping a div for a section, changes nothing.
//   box    every element that paints something: a background, a border, a
//          shadow, or a replaced element (svg, img, canvas, input).
//
// Values are [x, y, width, height] in document pixels, rounded. Compared
// with a small tolerance so sub-pixel font rasterisation differences
// between platforms do not fail the run. A deliberate 10px change does.
//
// Two kinds of text have a width that is not layout, so they record an
// anchor instead of x and width: [anchor, y, null, height], with the key
// suffixed @left, @centre or @right after the block's text-align.
//   - The footer credit line carries the release version, so its width
//     changes every release.
//   - Emoji come from the system font (Apple Color Emoji on macOS, Noto
//     Color Emoji on the Linux runner), so text holding one varies in
//     width by platform. A box whose own text holds an emoji (the ✨
//     lifeline button) keeps its left edge and drops only its width.
// Centred text anchors on its centre, so padding on a centred line still
// moves the anchor and still fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "layout-baselines",
);
export const TOLERANCE_PX = 2;

function collectInPage() {
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const sx = window.scrollX;
  const sy = window.scrollY;

  // The countdown digits and the shrinking bar fill change every frame;
  // the track they sit in is layout and stays measured.
  const skip = new Set();
  for (const digits of document.querySelectorAll('[aria-label*="seconds remaining" i]')) {
    skip.add(digits);
    for (const fill of digits.parentElement?.querySelectorAll('[style*="width"]') ?? []) {
      skip.add(fill);
    }
  }
  const skipped = (el) => {
    for (let p = el; p; p = p.parentElement) {
      if (skip.has(p)) return true;
      const cs = getComputedStyle(p);
      // Decorative overlays such as the confetti canvas.
      if (cs.position === "fixed" && cs.pointerEvents === "none") return true;
    }
    return false;
  };

  const union = (rects) => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of rects) {
      if (q.width === 0 && q.height === 0) continue;
      l = Math.min(l, q.left);
      t = Math.min(t, q.top);
      r = Math.max(r, q.right);
      b = Math.max(b, q.bottom);
    }
    if (l === Infinity) return null;
    return [l + sx, t + sy, r - l, b - t].map(Math.round);
  };

  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && el.getClientRects().length > 0;
  };

  const blockOf = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const d = getComputedStyle(p).display;
      if (!d.startsWith("inline") && d !== "contents") return p;
    }
    return document.body;
  };

  // Text, grouped per block box.
  const blocks = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!norm(node.nodeValue)) continue;
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(parent.tagName)) continue;
    if (!isVisible(parent) || skipped(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const block = blockOf(parent);
    const entry = blocks.get(block) ?? { text: [], rects: [] };
    entry.text.push(node.nodeValue);
    entry.rects.push(...range.getClientRects());
    blocks.set(block, entry);
  }

  const alpha = (c) => {
    if (!c || c === "transparent") return 0;
    const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = c.match(/^rgba\((.+)\)$/);
    if (rgba) return parseFloat(rgba[1].split(",")[3]);
    return 1;
  };
  const REPLACED = new Set(["IMG", "SVG", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "VIDEO", "IFRAME", "HR"]);
  const paints = (el, cs) =>
    REPLACED.has(el.tagName.toUpperCase()) ||
    alpha(cs.backgroundColor) > 0 ||
    cs.backgroundImage !== "none" ||
    cs.boxShadow !== "none" ||
    ["Top", "Right", "Bottom", "Left"].some(
      (side) => parseFloat(cs[`border${side}Width`]) > 0 && alpha(cs[`border${side}Color`]) > 0,
    );

  const VERSION = /\bv\d+\.\d+\.\d+\b/;
  const EMOJI = /\p{Extended_Pictographic}/u;
  const anchorOf = (el) => {
    const align = getComputedStyle(el).textAlign;
    if (align === "center") return "centre";
    if (align === "right" || align === "end") return "right";
    return "left";
  };

  const items = [];
  for (const [block, { text, rects }] of blocks) {
    const rect = union(rects);
    if (!rect) continue;
    const label = norm(text.join(""));
    const anchor = VERSION.test(label) || EMOJI.test(label) ? anchorOf(block) : null;
    items.push({ kind: "text", label, rect, anchor });
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!isVisible(el) || skipped(el)) continue;
    const cs = getComputedStyle(el);
    if (!paints(el, cs)) continue;
    const rect = union([el.getBoundingClientRect()]);
    if (!rect) continue;
    const tag = el.tagName.toLowerCase();
    const kind = REPLACED.has(el.tagName.toUpperCase()) ? tag : "box";
    // innerText, not textContent: inline <script> bodies are not labels.
    const label = norm(
      el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder"),
    );
    // Only the element's own text nodes count: a footer that merely
    // contains the ❤️ line keeps its full width.
    const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    const emojiSized = kind === "box" && own.some((n) => EMOJI.test(n.nodeValue));
    items.push({ kind, label, rect, anchor: emojiSized ? "left" : null });
  }

  // Document order would shift every key when one element is added, so
  // sort by position and number repeats within each key.
  items.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
  const seen = new Map();
  const out = {};
  for (const { kind, label, rect, anchor } of items) {
    const text = label.replace(new RegExp(VERSION.source, "g"), "v#").slice(0, 60);
    const base = `${kind}: ${text}${anchor ? ` @${anchor}` : ""}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const [x, y, w, h] = rect;
    const ax = anchor === "centre" ? Math.round(x + w / 2) : anchor === "right" ? x + w : x;
    out[n === 1 ? base : `${base} (${n})`] = anchor ? [ax, y, null, h] : rect;
  }
  return {
    doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    items: out,
  };
}

async function collectStable(page) {
  let previous = JSON.stringify(await page.evaluate(collectInPage));
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    const next = JSON.stringify(await page.evaluate(collectInPage));
    if (next === previous) return JSON.parse(next);
    previous = next;
  }
  throw new Error("Layout did not settle within 2 seconds; something keeps moving.");
}

export async function expectWebFonts(page) {
  const loaded = await page.evaluate(async () => {
    await Promise.allSettled([
      document.fonts.load('16px "Inter"'),
      document.fonts.load('600 16px "Playfair Display"'),
    ]);
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => f.family.replace(/["']/g, ""));
  });
  for (const family of ["Inter", "Playfair Display"]) {
    expect(
      loaded,
      `The ${family} web font did not load, so every text measurement would be wrong. ` +
        "The layout guard needs network access to fonts.googleapis.com and fonts.gstatic.com.",
    ).toContain(family);
  }
}

// Record the current screen in both themes. Light and dark set data-theme
// explicitly and emulate the matching colour scheme, which is what the
// header's appearance switch does.
export async function captureThemes(page, label, settle) {
  const out = {};
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await settle(page);
    out[`${label} · ${theme}`] = await collectStable(page);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.emulateMedia({ colorScheme: "light" });
  return out;
}

// Baselines live in layout-baselines/<project>.<suite>.json. A per-platform
// copy in layout-baselines/<platform>/ (process.platform: "linux",
// "darwin") wins if one exists, and --update-snapshots then rewrites that
// copy. It is the escape hatch should the Linux runner ever render text
// differently from macOS beyond the tolerance:
//   1. Download the playwright-report artefact from the failing CI run.
//   2. For each failing layout test, save its "<project>.<suite>.json
//      (actual)" attachment as layout-baselines/linux/<project>.<suite>.json.
//   3. Commit them. CI then compares against those; macOS keeps using the
//      shared files. From then on, update both copies for intended changes.
function baselinePath(file) {
  const platformFile = path.join(BASELINE_DIR, process.platform, file);
  return fs.existsSync(platformFile) ? platformFile : path.join(BASELINE_DIR, file);
}

function serialise(snapshot) {
  const states = Object.entries(snapshot).map(([state, { doc, items }]) => {
    const lines = Object.entries(items).map(
      ([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
    );
    return (
      `  ${JSON.stringify(state)}: {\n    "doc": ${JSON.stringify(doc)},\n` +
      `    "items": {\n${lines.join(",\n")}\n    }\n  }`
    );
  });
  return `{\n${states.join(",\n")}\n}\n`;
}

const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= TOLERANCE_PX);
const fmt = (v) => `[${v.map((n) => (n == null ? "-" : n)).join(", ")}]`;

function diff(expected, actual) {
  const lines = [];
  for (const state of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const e = expected[state];
    const a = actual[state];
    if (!e) { lines.push(`${state}: new screen, not in the baseline`); continue; }
    if (!a) { lines.push(`${state}: in the baseline but not captured`); continue; }
    if (!e.doc.every((v, i) => near(v, a.doc[i]))) {
      lines.push(`${state}: page size ${e.doc.join("×")} → ${a.doc.join("×")}`);
    }
    for (const key of new Set([...Object.keys(e.items), ...Object.keys(a.items)])) {
      const ev = e.items[key];
      const av = a.items[key];
      if (!ev) lines.push(`${state}: + ${key} ${fmt(av)}`);
      else if (!av) lines.push(`${state}: - ${key} ${fmt(ev)}`);
      else if (!ev.every((v, i) => near(v, av[i]))) lines.push(`${state}: ${key} ${fmt(ev)} → ${fmt(av)}`);
    }
  }
  return lines;
}

// Compare against the committed baseline, or rewrite it when run with
// --update-snapshots (npm run test:layout:update).
export async function expectLayout(snapshot, testInfo, suite) {
  const file = `${testInfo.project.name}.${suite}.json`;
  const target = baselinePath(file);
  const body = serialise(snapshot);
  await testInfo.attach(`${file} (actual)`, { body, contentType: "application/json" });

  const update = testInfo.config.updateSnapshots;
  const exists = fs.existsSync(target);
  if (update === "all" || update === "changed" || (!exists && update === "missing" && !process.env.CI)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    test.info().annotations.push({ type: "layout baseline", description: `wrote ${path.relative(process.cwd(), target)}` });
    return;
  }
  if (!exists) {
    throw new Error(
      `No layout baseline at ${path.relative(process.cwd(), target)}. ` +
        "Run `npm run test:layout:update` and commit the result.",
    );
  }

  const lines = diff(JSON.parse(fs.readFileSync(target, "utf8")), JSON.parse(body));
  const shown = lines.slice(0, 40).map((l) => `  ${l}`).join("\n");
  const more = lines.length > 40 ? `\n  …and ${lines.length - 40} more` : "";
  expect(
    lines.length,
    `${testInfo.project.name} layout moved (${lines.length} difference${lines.length === 1 ? "" : "s"} ` +
      `beyond ${TOLERANCE_PX}px; values are [x, y, width, height]):\n${shown}${more}\n\n` +
      "If the change is intended, run `npm run test:layout:update` and commit the new baseline. " +
      "The full captured geometry is attached to this test in the HTML report.",
  ).toBe(0);
}
