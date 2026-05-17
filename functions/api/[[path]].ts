// Pages Functions catch-all route.
//
// Cloudflare Pages routes every request matching /api/* through this file.
// We use Hono internally to dispatch by path + method. As Phase 1 progresses,
// route handlers move into `functions/api/_routes/` and get mounted on this app.

import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ENV: string;
  ADMIN_EMAILS: string;
  RESEND_FROM: string;
  RESEND_API_KEY?: string;
  SESSION_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

app.get("/health", (c) => {
  return c.json({
    ok: true,
    env: c.env.ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});

export const onRequest = handle(app);
