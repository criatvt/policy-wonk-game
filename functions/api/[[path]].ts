// Pages Functions catch-all route.
//
// Cloudflare Pages routes every request matching /api/* through this file.
// We use Hono internally to dispatch by path + method. Route handlers
// for individual feature areas live in `_routes/<area>.ts` and are mounted
// here on a basePath.

import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";

import auth from "./_routes/auth";
import me from "./_routes/me";
import events from "./_routes/events";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ENV: string;
  ADMIN_EMAILS: string;
  RESEND_FROM: string;
  RESEND_API_KEY?: string;
  SESSION_SECRET?: string;
  // Workers Analytics Engine dataset for first-party funnel events (#12).
  // Optional so a build without the binding still runs (route no-ops).
  EVENTS?: AnalyticsEngineDataset;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

app.get("/health", (c) => {
  return c.json({
    ok: true,
    env: c.env.ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

app.route("/auth", auth);
app.route("/me", me);
app.route("/events", events);

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});

export const onRequest = handle(app);
