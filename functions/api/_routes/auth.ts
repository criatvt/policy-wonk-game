// /api/auth/* route handlers — magic-link login.

import { Hono } from "hono";
import {
  generateToken,
  storeToken,
  consumeToken,
  checkAndIncrementRate,
  generateOtpCode,
  storeOtp,
  verifyOtp,
} from "../_lib/tokens";
import {
  sendEmail,
  magicLinkHtml,
  magicLinkText,
  otpCodeHtml,
  otpCodeText,
} from "../_lib/email";
import { upsertUserOnLogin, type User } from "../_lib/users";
import {
  issueSessionCookie,
  clearSessionCookie,
  signSessionToken,
} from "../_lib/session";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ENV: string;
  ADMIN_EMAILS: string;
  EMAIL_FROM: string;
  BREVO_API_KEY?: string;
  SESSION_SECRET?: string;
};

const auth = new Hono<{ Bindings: Bindings }>();

// POST /api/auth/send-link
// Body: { email: string }
// Always returns 200 with a generic message even on rate-limit or unknown
// email — never confirm or deny an email's existence at this endpoint.
auth.post("/send-link", async (c) => {
  let body: { email?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(emailRaw)) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }

  // Both halves of the email config are checked before any work happens, and
  // both fail LOUDLY with a 500. This endpoint deliberately returns a generic
  // 200 for per-recipient failures so it never confirms whether an address
  // exists — but that same generic 200 is what hid #51 for weeks. A missing
  // binding is a deployment fault, not a fact about the caller's address, so
  // it has no business hiding behind that response.
  //
  // EMAIL_FROM specifically: it is supplied by [env.*.vars] in wrangler.toml.
  // If that file ever stops being the source of truth for Pages vars, the
  // variable silently becomes undefined, Brevo receives sender.email: null
  // and rejects the send — which is exactly the shape of the original outage.
  if (!c.env.BREVO_API_KEY) {
    console.error("send-link: BREVO_API_KEY not configured");
    return c.json({ ok: false, error: "email_not_configured" }, 500);
  }

  if (!c.env.EMAIL_FROM) {
    console.error("send-link: EMAIL_FROM not configured");
    return c.json({ ok: false, error: "email_not_configured" }, 500);
  }

  // Per-email and per-IP throttles. Both shallow — Phase 1 enough.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const ipRate = await checkAndIncrementRate(c.env.KV, `ip:${ip}`, 10, 900);
  const emailRate = await checkAndIncrementRate(c.env.KV, `email:${emailRaw}`, 3, 900);
  if (!ipRate.allowed || !emailRate.allowed) {
    // Same 200 response — don't surface rate limits to the caller.
    return c.json({ ok: true, message: "If that email is valid, a sign-in link is on its way." });
  }

  const token = generateToken();
  await storeToken(c.env.KV, token, {
    email: emailRaw,
    createdAt: Date.now(),
  });

  const origin = getOrigin(c);
  // Email link goes to the static confirm page (not the API). The user's
  // explicit click POSTs from that page to /api/auth/verify, which is what
  // consumes the token. This keeps email-scanner pre-fetchers from eating
  // single-use tokens before the user gets to click.
  const verifyUrl = `${origin}/auth/confirm?token=${token}`;

  // In dev / preview-without-Brevo, we may want to log instead of sending.
  // For now: always send if BREVO_API_KEY is present.
  const result = await sendEmail({
    apiKey: c.env.BREVO_API_KEY,
    from: c.env.EMAIL_FROM,
    to: emailRaw,
    subject: "Sign in to Policy Wonk",
    html: magicLinkHtml(verifyUrl),
    text: magicLinkText(verifyUrl),
  });

  if (!result.ok) {
    console.error("send-link: Brevo send failed", {
      status: result.status,
      error: result.error,
    });
    // Still respond 200 generically — don't tell the caller which addresses
    // bounce. But log loudly so we notice in real-time.
    return c.json({ ok: true, message: "If that email is valid, a sign-in link is on its way." });
  }

  return c.json({ ok: true, message: "If that email is valid, a sign-in link is on its way." });
});

// GET /api/auth/verify?token=...
//
// Backwards-compat: older emails point straight here. We do NOT consume
// the token on GET — pre-fetchers like Microsoft 365 Safe Links, some
// corporate spam scanners, and Apple Mail link preview will hit this URL
// before the real user clicks, and a one-shot token consumed on GET means
// the user gets a `?error=invalid_or_expired` loop. Instead we redirect
// to the static confirm page; the user clicks "Sign me in" there, which
// POSTs back to this same path and consumes the token.
auth.get("/verify", (c) => {
  const token = c.req.query("token") ?? "";
  if (!token) return c.redirect("/login?error=missing_token");
  return c.redirect(`/auth/confirm?token=${encodeURIComponent(token)}`);
});

// POST /api/auth/verify
//
// The actual consume-and-sign-in path. Fired by the form submit on
// /auth/confirm with the token in the form body. Pre-fetchers don't
// simulate form submissions, so the token survives long enough for the
// real user to click.
//
// On success, issues a session cookie and redirects: new users (no
// nickname) go to /onboarding/nickname; returning users go to /.
auth.post("/verify", async (c) => {
  if (!c.env.SESSION_SECRET) {
    console.error("verify: SESSION_SECRET not configured");
    return c.redirect("/login?error=server");
  }

  const body = await c.req.parseBody().catch(() => ({}));
  const tokenRaw = (body as Record<string, unknown>).token;
  const token = typeof tokenRaw === "string" ? tokenRaw : "";
  if (!token) {
    return c.redirect("/login?error=missing_token");
  }

  const payload = await consumeToken(c.env.KV, token);
  if (!payload) {
    return c.redirect("/login?error=invalid_or_expired");
  }

  const adminEmails = (c.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const user = await upsertUserOnLogin(c.env.DB, payload.email, adminEmails);
  await issueSessionCookie(c, user.id, user.email, c.env.SESSION_SECRET);

  return c.redirect(nextOnboardingStep(user));
});

// POST /api/auth/otp/request — native-app email login, step 1.
// Body: { email: string }
//
// A header-based sibling of /send-link: instead of mailing a clickable link
// (which a native app can't intercept), we mail a 6-digit code the app
// prompts for. Same email validation + same per-IP / per-email rate limits.
// Always returns 200 with a generic message — never confirm or deny that an
// email exists or that a code was sent.
auth.post("/otp/request", async (c) => {
  let body: { email?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(emailRaw)) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }

  // Same reasoning as /send-link: a missing binding is a deployment fault and
  // fails loudly, rather than hiding behind the generic 200 this endpoint
  // uses for per-recipient outcomes.
  if (!c.env.BREVO_API_KEY) {
    console.error("otp/request: BREVO_API_KEY not configured");
    return c.json({ ok: false, error: "email_not_configured" }, 500);
  }

  if (!c.env.EMAIL_FROM) {
    console.error("otp/request: EMAIL_FROM not configured");
    return c.json({ ok: false, error: "email_not_configured" }, 500);
  }

  // Per-email and per-IP throttles — identical limits to /send-link.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const ipRate = await checkAndIncrementRate(c.env.KV, `ip:${ip}`, 10, 900);
  const emailRate = await checkAndIncrementRate(c.env.KV, `email:${emailRaw}`, 3, 900);
  if (!ipRate.allowed || !emailRate.allowed) {
    // Same 200 response — don't surface rate limits to the caller.
    return c.json({ ok: true, message: "If that email is valid, a sign-in code is on its way." });
  }

  const code = generateOtpCode();
  await storeOtp(c.env.KV, emailRaw, code);

  const result = await sendEmail({
    apiKey: c.env.BREVO_API_KEY,
    from: c.env.EMAIL_FROM,
    to: emailRaw,
    subject: "Your Policy Wonk sign-in code",
    html: otpCodeHtml(code),
    text: otpCodeText(code),
  });

  if (!result.ok) {
    console.error("otp/request: Brevo send failed", {
      status: result.status,
      error: result.error,
    });
    // Still respond 200 generically — don't leak which addresses bounce.
    return c.json({ ok: true, message: "If that email is valid, a sign-in code is on its way." });
  }

  return c.json({ ok: true, message: "If that email is valid, a sign-in code is on its way." });
});

// POST /api/auth/otp/verify — native-app email login, step 2.
// Body: { email: string, code: string }
//
// Verifies the 6-digit code against the hashed KV record. On success, issues
// a session cookie AND returns the session JWT in the JSON body so the app
// can store it in Keychain and send it as `Authorization: Bearer` later.
auth.post("/otp/verify", async (c) => {
  if (!c.env.SESSION_SECRET) {
    console.error("otp/verify: SESSION_SECRET not configured");
    return c.json({ ok: false, error: "server_not_configured" }, 500);
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return c.json({ ok: false, error: "invalid_or_expired" }, 400);
  }

  const result = await verifyOtp(c.env.KV, email, code);
  if (!result.ok) {
    return c.json({ ok: false, error: "invalid_or_expired" }, 400);
  }

  const adminEmails = (c.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const user = await upsertUserOnLogin(c.env.DB, email, adminEmails);
  // Set the cookie too (harmless if opened in a webview), but the JSON token
  // below is what the native app stores in Keychain and sends as a Bearer.
  await issueSessionCookie(c, user.id, user.email, c.env.SESSION_SECRET);
  const token = await signSessionToken(user.id, user.email, c.env.SESSION_SECRET);

  return c.json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar_slug: user.avatar_slug,
    },
  });
});

// POST /api/auth/logout
auth.post("/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// GET/POST /api/auth/dev-login?email=... — dev-only bypass for the magic-link
// flow. Gated strictly on ENV === "dev"; returns 404 in preview/production
// so it cannot be invoked even if Workers config drift exposes the route.
// Existence is intentional: the magic-link path requires a Brevo API key,
// which a local checkout typically lacks. This keeps the local test loop fast.
auth.all("/dev-login", async (c) => {
  if (c.env.ENV !== "dev") {
    return c.json({ ok: false, error: "not_found" }, 404);
  }
  if (!c.env.SESSION_SECRET) {
    return c.json({ ok: false, error: "server_not_configured" }, 500);
  }
  const email = (c.req.query("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }
  const adminEmails = (c.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const user = await upsertUserOnLogin(c.env.DB, email, adminEmails);
  await issueSessionCookie(c, user.id, user.email, c.env.SESSION_SECRET);
  // Redirect by default so browser visits walk the same onboarding chain
  // as the real magic-link verify. format=json keeps the JSON response
  // for curl-based testing.
  if (c.req.query("format") === "json") {
    return c.json({ ok: true, user: { id: user.id, email: user.email } });
  }
  return c.redirect(nextOnboardingStep(user));
});

function nextOnboardingStep(user: User): string {
  // Avatar is auto-derived at nickname-set time (#18), so the only
  // remaining onboarding step is the nickname itself.
  if (!user.nickname) return "/onboarding/nickname";
  return "/";
}

function isValidEmail(email: string): boolean {
  // Permissive RFC-ish check — good enough for Phase 1.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getOrigin(c: { req: { header: (name: string) => string | undefined } }): string {
  // Prefer the request's actual origin (preview URLs differ from prod).
  const origin = c.req.header("Origin") ?? c.req.header("Referer");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // fall through
    }
  }
  // Fallback derived from Host header — works for direct curl + browser hits alike.
  const host = c.req.header("Host");
  const proto = c.req.header("X-Forwarded-Proto") ?? "https";
  return host ? `${proto}://${host}` : "https://policywonkgame.aasifj.com";
}

export default auth;
