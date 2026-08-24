// Celebratory confetti for clearing a milestone rung. No third-party
// library — the whole point of this project is zero third-party scripts
// (see the package.json description) — so this is a small canvas particle
// system tuned to the site's own functional palette (read from the CSS
// custom properties at fire time, so it's automatically correct in light
// and dark) rather than a bespoke "confetti gold" that would fight the
// game's deliberate no-glossy-chrome guardrail (see game.css).
//
// Five types, one per milestone GameContainer.jsx already treats as
// distinct in rungMessage(): a single-hue star burst — bigger on the
// second — for the two safety nets, visually distinct from every other
// type's green-and-marigold mix; ribbon bursts, contained on screen, that
// widen for each of the three tier clears; and a flashing, twinkling,
// two-wave finale for clearing the whole ladder. An ordinary rung (per
// Aasif's call, 2026-08-24) gets nothing — confetti stays reserved for
// the moments that already get special copy.

let canvas = null;
let ctx = null;
let particles = [];
let rafId = null;
let lastTime = null;
let resizeHandler = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "90",
  });
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  resizeHandler = sizeCanvas;
  sizeCanvas();
  window.addEventListener("resize", resizeHandler);
}

function sizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  lastTime = null;
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  resizeHandler = null;
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
  canvas = null;
  ctx = null;
  particles = [];
}

function colorVar(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || "#1A1A1A";
}

function palette() {
  return {
    marigold: colorVar("--color-functional-marigold"),
    green: colorVar("--color-functional-green"),
    charcoal: colorVar("--color-charcoal"),
  };
}

// Blends a #rrggbb colour toward white (amount > 0) or black (amount < 0).
// Used to build a single-hue tonal set out of one CSS token instead of
// hardcoding a new brand colour — stays theme-correct since it's derived
// from the live token at fire time.
function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c) => Math.round(c + (target - c) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// --- particles ------------------------------------------------------

function addBurst({
  count, x, y, angleMin, angleMax, speedMin, speedMax,
  gravity, drag, life, shapes, colors, sizeMin, sizeMax, twinkle,
}) {
  for (let i = 0; i < count; i++) {
    const angle = angleMin + Math.random() * (angleMax - angleMin);
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity, drag,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      life, age: 0,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      twinkle: !!twinkle,
      twinklePhase: Math.random() * Math.PI * 2,
    });
  }
}

// A single soft radial pulse at screen centre — the "impact" beat right as
// the finale opens. Not a particle that moves or falls; it just blooms and
// fades in place, so it gets its own entry in the particles array with a
// linear (not sustain-then-fade) alpha curve and a capped peak opacity —
// a glow, not a whiteout.
function addFlash(pal) {
  particles.push({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    vx: 0, vy: 0,
    gravity: 0, drag: 1,
    rotation: 0, spin: 0,
    life: 420, age: 0,
    shape: "flash",
    color: pal.marigold,
    size: Math.max(window.innerWidth, window.innerHeight) * 1.1,
    fadeMode: "linear",
    peakAlpha: 0.4,
    twinkle: false,
  });
}

function drawShape(shape, size, color) {
  if (shape === "flash") {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "ribbon") {
    ctx.fillRect(-size / 2, -size / 5, size, size / 2.5);
  } else if (shape === "star") {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outer = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const inner = outer + Math.PI / 5;
      const ox = Math.cos(outer) * (size / 2);
      const oy = Math.sin(outer) * (size / 2);
      const ix = Math.cos(inner) * (size / 4);
      const iy = Math.sin(inner) * (size / 4);
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function tick(dt) {
  const step = dt / 16.67; // normalize to a ~60fps baseline
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.age < p.life);
  for (const p of particles) {
    p.age += dt;
    p.vy += p.gravity * step;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.rotation += p.spin * step;
    const t = p.age / p.life;
    let alpha =
      p.fadeMode === "linear"
        ? Math.max(0, 1 - t) * (p.peakAlpha ?? 1)
        : t < 0.7
          ? 1
          : Math.max(0, 1 - (t - 0.7) / 0.3);
    // A gentle shimmer on finale stars — reads as glinting rather than a
    // plain fade, the extra bit of sparkle for the biggest win.
    if (p.twinkle) alpha *= 0.6 + 0.4 * Math.sin(p.age / 90 + p.twinklePhase);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    drawShape(p.shape, p.size, p.color);
    ctx.restore();
  }
  if (particles.length === 0) {
    teardown();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function loop(now) {
  if (lastTime == null) lastTime = now;
  const dt = now - lastTime;
  lastTime = now;
  tick(dt);
}

function start() {
  if (rafId) return; // a loop is already running; new particles just join it
  lastTime = null;
  rafId = requestAnimationFrame(loop);
}

// --- per-milestone shapes --------------------------------------------

// The two safety nets (Q5, Q10) get a radial star burst from mid-screen —
// a "badge unlocked" read rather than a falling one — in a single-hue
// tonal set (marigold plus a lighter and a darker shade of it) so it
// reads as visually distinct from every other milestone's green-and-
// marigold mix. The second net is bigger and adds the darkest shade,
// echoing how rungMessage() calls Q10's net the bigger of the two.
function fireSafetyNet(pal, big) {
  const colors = big
    ? [pal.marigold, shade(pal.marigold, 0.45), shade(pal.marigold, -0.35)]
    : [pal.marigold, shade(pal.marigold, 0.45)];
  addBurst({
    count: big ? 50 : 30,
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.32,
    angleMin: 0,
    angleMax: Math.PI * 2,
    speedMin: big ? 4 : 3,
    speedMax: big ? 9 : 6.5,
    gravity: 0.09,
    drag: 0.985,
    life: big ? 1600 : 1250,
    shapes: ["star"],
    colors,
    sizeMin: big ? 11 : 9,
    sizeMax: big ? 18 : 14,
  });
}

// The three tier clears (Q4, Q8, Q12) get a spread of small ribbon bursts
// across the width — contained on screen, not rain trailing off the
// bottom edge (per Aasif's call, 2026-08-24: low gravity and drag keep
// each burst hovering and fluttering near where it popped until it fades,
// rather than falling out of view). Widens and thickens with each tier —
// the ladder getting harder reads as the celebration getting bigger too.
function fireTierBurst(pal, intensity) {
  const origins = 4 + intensity * 2;
  const colors =
    intensity === 3
      ? [pal.marigold, pal.green, pal.charcoal]
      : intensity === 2
        ? [pal.marigold, pal.green]
        : [pal.marigold, pal.charcoal];
  for (let i = 0; i < origins; i++) {
    addBurst({
      count: 6 + intensity * 2,
      x: (window.innerWidth * (i + 0.5)) / origins,
      y: window.innerHeight * (0.22 + (i % 2) * 0.14),
      angleMin: 0,
      angleMax: Math.PI * 2,
      speedMin: 1,
      speedMax: 2.4 + intensity * 0.3,
      gravity: 0.045,
      drag: 0.965,
      life: 1300 + intensity * 200,
      shapes: ["ribbon"],
      colors,
      sizeMin: 7,
      sizeMax: 12,
    });
  }
}

// One wave of the finale: five staggered radial bursts spread edge to
// edge (a fireworks cadence), using every shape and every colour in the
// palette, with a shimmer on top so the stars glint instead of just
// fading. `boost` scales count/speed so a later wave can land bigger —
// a crescendo rather than a repeat.
function fireFinaleWave(pal, delayOffset, boost) {
  [0.1, 0.3, 0.5, 0.7, 0.9].forEach((px, i) => {
    window.setTimeout(() => {
      ensureCanvas();
      addBurst({
        count: Math.round(38 * boost),
        x: window.innerWidth * px,
        y: window.innerHeight * (0.26 + (i % 2) * 0.14),
        angleMin: 0,
        angleMax: Math.PI * 2,
        speedMin: 3.5,
        speedMax: 8.5 * boost,
        gravity: 0.07,
        drag: 0.985,
        life: 1900,
        shapes: ["star", "circle", "ribbon"],
        colors: [pal.marigold, pal.green, pal.charcoal],
        sizeMin: 7,
        sizeMax: 16,
        twinkle: true,
      });
      start();
    }, delayOffset + i * 170);
  });
}

// Clearing the whole ladder: a flash of impact, then two waves of the
// fireworks cadence above (the second bigger — a crescendo), each riding
// its own tier-burst layer. Per Aasif's call (2026-08-24) — "should feel
// like a phenomenal victory" — this is the biggest, longest, and only
// type that flashes or twinkles. Longest-running of the five.
function fireFinale(pal) {
  ensureCanvas();
  addFlash(pal);
  fireTierBurst(pal, 2);
  fireFinaleWave(pal, 0, 1);
  window.setTimeout(() => {
    ensureCanvas();
    addFlash(pal);
    fireTierBurst(pal, 2);
    start();
  }, 900);
  fireFinaleWave(pal, 900, 1.3);
}

// --- public API --------------------------------------------------------

/**
 * Fire a confetti burst. `type` is one of "safetyNet1", "safetyNet2",
 * "tier1", "tier2", "tier3", "finale" — see typeForRung() for the
 * rung-number → type mapping used by the game itself. An unrecognised
 * (or falsy) type is a deliberate no-op — see typeForRung().
 * No-ops server-side and when the reader prefers reduced motion.
 */
export function fireConfetti(type) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const pal = palette();
  switch (type) {
    case "safetyNet1":
      ensureCanvas();
      fireSafetyNet(pal, false);
      break;
    case "safetyNet2":
      ensureCanvas();
      fireSafetyNet(pal, true);
      break;
    case "tier1":
      ensureCanvas();
      fireTierBurst(pal, 1);
      break;
    case "tier2":
      ensureCanvas();
      fireTierBurst(pal, 2);
      break;
    case "tier3":
      ensureCanvas();
      fireTierBurst(pal, 3);
      break;
    case "finale":
      ensureCanvas();
      fireFinale(pal);
      break;
    default:
      return; // ordinary rung — no confetti
  }
  start();
}

// Mirrors the milestone rungs rungMessage() (GameContainer.jsx) already
// treats specially: the two safety nets and the three tier clears. Every
// other cleared rung returns null — no confetti. Rung 15 doesn't route
// through here — a won game skips straight to EndScreen, which fires
// "finale" itself.
export function typeForRung(cleared) {
  if (cleared === 5) return "safetyNet1";
  if (cleared === 10) return "safetyNet2";
  if (cleared === 4) return "tier1";
  if (cleared === 8) return "tier2";
  if (cleared === 12) return "tier3";
  return null;
}
