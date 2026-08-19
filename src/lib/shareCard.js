// Renders the shareable result card to a canvas.
//
// This is a deliberate port of the iOS app's
// PolicyWonk/Features/Share/ShareCardView.swift, so a result shared from the
// web and one shared from the phone are the same picture. Keep the two in
// step: same logical size, same palette, same copy, same layout order.
//
// Like the iOS card, the palette here is FIXED light. The exported image has
// to look the same whatever theme the reader's device is in, so this file
// deliberately does not read the --color-* custom properties.

import { formatIndianNumber } from "./gameEngine.js";

// Logical size; rendered at scale 3 to 1080x1350 (Instagram-friendly portrait).
export const CARD_W = 360;
export const CARD_H = 450;
export const CARD_SCALE = 3;

const PAD = 28;

const INK = "#1A1A1A";
const CREAM = "#F8F1E4";
const MUTED = "#6B6B6B";
const TEAL = "#006D77";
// Darker than the functional green (#7CB342) so it holds up against cream.
// Matches ShareCardView's `green`.
const GREEN = "#6FA436";
const RED = "#C73E1D";

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const SANS = '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif';

const SITE_LABEL = "policywonkgame.aasifj.com";

// --- copy, mirroring ShareCardView's computed properties -------------------

function accentFor(status) {
  if (status === "won") return GREEN;
  if (status === "walked-away") return TEAL;
  return RED;
}

function eyebrowFor(status) {
  if (status === "won") return "All fifteen · a perfect ladder";
  if (status === "walked-away") return "Walked away";
  return "Game over";
}

function bigLineFor(status, score) {
  if (status === "won") return "1,00,00,000 credibility points";
  return `${formatIndianNumber(score)} credibility points`;
}

function subLineFor(status, fellOnRung) {
  if (status === "won") return "All fifteen questions, clean. A crore of credibility.";
  if (status === "walked-away") return "Banked it and walked, nerve intact.";
  return fellOnRung
    ? `Fell at Q${fellOnRung}. Climbing back next time.`
    : "Climbing back next time.";
}

// --- text helpers ----------------------------------------------------------

// Canvas letter-spacing (ctx.letterSpacing) is not available everywhere, so
// tracked text is drawn a glyph at a time. Returns the advance width.
function drawTracked(ctx, text, x, y, tracking) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  return cursor - x - tracking;
}

// Greedy word wrap at the given font size.
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Ellipsise the final line if the text outran the line budget.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      while (last && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

// Shrink the font until the text fits maxLines, mirroring SwiftUI's
// minimumScaleFactor. Returns { lines, size }.
function fitText(ctx, text, { maxWidth, maxLines, size, minScale, weight, family }) {
  let current = size;
  const floor = Math.max(1, Math.floor(size * minScale));
  for (;;) {
    ctx.font = `${weight} ${current}px ${family}`;
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = wrap(ctx, text, maxWidth, maxLines);
    const rendered = lines.join(" ").replace(/…$/, "").split(/\s+/).length;
    const fits = lines.every((l) => ctx.measureText(l).width <= maxWidth) && rendered >= words.length;
    if (fits || current <= floor) {
      ctx.font = `${weight} ${current}px ${family}`;
      return { lines: wrap(ctx, text, maxWidth, maxLines), size: current };
    }
    current -= 1;
  }
}

// Webfonts must be resident before the first measureText, or the layout is
// computed against a fallback and the drawn card is subtly wrong.
async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 18px "Playfair Display"'),
      document.fonts.load('800 46px "Playfair Display"'),
      document.fonts.load('700 13px "Inter"'),
      document.fonts.load('400 15px "Inter"'),
      document.fonts.load('600 12px "Inter"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fall back to the system stack rather than failing the render.
  }
}

// --- render ----------------------------------------------------------------

/**
 * Draw the result card into `canvas`.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{status: string, score: number, fellOnRung: number|null, moduleName: string}} result
 */
export async function drawShareCard(canvas, result) {
  await ensureFonts();

  const { status, score, fellOnRung, moduleName } = result;
  const inner = CARD_W - PAD * 2;

  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = CARD_H * CARD_SCALE;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Ground: white to cream on the leading diagonal, as in ShareCardView.
  const gradient = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  gradient.addColorStop(0, "#FFFFFF");
  gradient.addColorStop(1, CREAM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // --- measure ---
  // The SwiftUI original is a VStack with a Spacer above and below the middle
  // block, so that block sits centred in whatever space the top and footer
  // leave. Measure all three, then distribute the slack.

  ctx.font = `700 18px ${SERIF}`;
  const moduleFit = fitText(ctx, moduleName, {
    maxWidth: inner,
    maxLines: 2,
    size: 18,
    minScale: 0.7,
    weight: 700,
    family: SERIF,
  });
  const moduleLead = Math.round(moduleFit.size * 1.25);
  const topH = 13 + 5 + moduleFit.lines.length * moduleLead;

  const bigSize = status === "won" ? 46 : 40;
  const bigFit = fitText(ctx, bigLineFor(status, score), {
    maxWidth: inner,
    maxLines: 2,
    size: bigSize,
    minScale: 0.5,
    weight: 800,
    family: SERIF,
  });
  const bigLead = Math.round(bigFit.size * 1.08);

  ctx.font = `400 15px ${SANS}`;
  const subLines = wrap(ctx, subLineFor(status, fellOnRung), inner, 3);
  const subLead = 20;

  const midH = 13 + 8 + bigFit.lines.length * bigLead + 8 + subLines.length * subLead;
  const footH = 12;

  const slack = CARD_H - PAD * 2 - topH - midH - footH;
  const spacer = Math.max(0, slack / 2);

  // --- draw: top block ---
  let y = PAD + 13;
  ctx.fillStyle = MUTED;
  ctx.font = `700 13px ${SANS}`;
  drawTracked(ctx, "POLICY WONK", PAD, y, 3);

  ctx.fillStyle = INK;
  ctx.font = `700 ${moduleFit.size}px ${SERIF}`;
  y += 5;
  for (const line of moduleFit.lines) {
    y += moduleLead;
    ctx.fillText(line, PAD, y);
  }

  // --- draw: middle block ---
  y = PAD + topH + spacer + 13;
  ctx.fillStyle = accentFor(status);
  ctx.font = `700 13px ${SANS}`;
  drawTracked(ctx, eyebrowFor(status).toUpperCase(), PAD, y, 2);

  ctx.fillStyle = INK;
  ctx.font = `800 ${bigFit.size}px ${SERIF}`;
  y += 8;
  for (const line of bigFit.lines) {
    y += bigLead;
    ctx.fillText(line, PAD, y);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `400 15px ${SANS}`;
  y += 8;
  for (const line of subLines) {
    y += subLead;
    ctx.fillText(line, PAD, y);
  }

  // --- draw: footer ---
  const footY = CARD_H - PAD;
  ctx.fillStyle = MUTED;
  ctx.font = `400 12px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("The public-policy quiz", PAD, footY);

  ctx.fillStyle = TEAL;
  ctx.font = `600 12px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(SITE_LABEL, CARD_W - PAD, footY);
  ctx.textAlign = "left";
}

/** Render the card and hand back a PNG blob. */
export async function shareCardBlob(result) {
  const canvas = document.createElement("canvas");
  await drawShareCard(canvas, result);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
