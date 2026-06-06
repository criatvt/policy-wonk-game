// /api/events — first-party funnel events (#12).
//
// Cloudflare Web Analytics has no custom-event API, so the quiz funnel is
// logged here and written to a Cloudflare Workers Analytics Engine dataset
// (the EVENTS binding). Aggregate only: we store the event name, module,
// and outcome, never any PII. No auth — these are anonymous gameplay events
// — but inputs are strictly allowlisted so the dataset can't be polluted
// with arbitrary blobs.
//
// The EVENTS binding is optional at the type level: in local `wrangler pages
// dev` without the binding configured, the route degrades to a no-op 204
// rather than 500ing, so gameplay is never affected by analytics config.

import { Hono } from "hono";

type Bindings = {
  EVENTS?: AnalyticsEngineDataset;
};

const events = new Hono<{ Bindings: Bindings }>();

// Keep in sync with the client allowlist in src/lib/analytics.js.
const VALID_EVENTS = new Set(["game_started", "module_chosen", "game_completed"]);
const VALID_MODULES = new Set([
  "cg-1", "cp-10", "cp-11", "cp-12", "cp-13", "cp-21",
  "cp-22", "cp-23", "cp-25", "cp-33", "cs-11",
]);
const VALID_OUTCOMES = new Set(["won", "lost", "walked_away"]);

events.post("/", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event : "";
  if (!VALID_EVENTS.has(event)) {
    return c.json({ ok: false, error: "invalid_event" }, 400);
  }

  // Normalise the optional dimensions, dropping anything not allowlisted so
  // a tampered client can't write arbitrary strings into the dataset.
  const module =
    typeof body.module === "string" && VALID_MODULES.has(body.module)
      ? body.module
      : "";
  const outcome =
    typeof body.outcome === "string" && VALID_OUTCOMES.has(body.outcome)
      ? body.outcome
      : "";
  const value = typeof body.value === "number" && Number.isFinite(body.value)
    ? body.value
    : 0;

  // No binding (e.g. local dev without Analytics Engine) → accept and no-op.
  if (!c.env.EVENTS) {
    return c.body(null, 204);
  }

  // indexes is the sampling key (max 1, ≤ 32 bytes) — index by event name so
  // each funnel step can be counted independently. blobs carry the
  // dimensions; doubles carry the numeric score.
  c.env.EVENTS.writeDataPoint({
    indexes: [event],
    blobs: [event, module, outcome],
    doubles: [value],
  });

  return c.body(null, 204);
});

export default events;
