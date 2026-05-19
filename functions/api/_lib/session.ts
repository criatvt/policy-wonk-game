// Session cookie management.
//
// Sessions are stateless: the cookie carries a signed JWT with the user
// id and expiry. Signed with SESSION_SECRET via HMAC-SHA256 (Hono's jwt
// helper). No server-side session table to maintain. Logout clears the
// cookie; a leaked cookie remains valid until expiry (acceptable for a
// quiz game; rotate SESSION_SECRET if we ever need a global invalidation).

import { sign, verify } from "hono/jwt";
import type { Context } from "hono";

const COOKIE_NAME = "pwg_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionClaims = {
  sub: string; // user id
  email: string;
  exp: number;
};

export async function issueSessionCookie(
  c: Context,
  userId: string,
  email: string,
  secret: string,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const token = await sign({ sub: userId, email, exp }, secret, "HS256");

  const isProd = c.env.ENV === "production";
  const cookieAttrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
  ];
  if (isProd) cookieAttrs.push("Secure");

  c.header("Set-Cookie", cookieAttrs.join("; "));
}

export function clearSessionCookie(c: Context): void {
  const isProd = c.env.ENV === "production";
  const cookieAttrs = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) cookieAttrs.push("Secure");
  c.header("Set-Cookie", cookieAttrs.join("; "));
}

export async function readSession(
  c: Context,
  secret: string,
): Promise<SessionClaims | null> {
  const cookieHeader = c.req.header("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  try {
    const decoded = (await verify(match[1], secret, "HS256")) as SessionClaims;
    return decoded;
  } catch {
    return null;
  }
}
