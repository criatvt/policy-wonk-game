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

// Mint a signed session JWT. Shared by issueSessionCookie (web cookie) and
// the native-app sign-in endpoint, which returns the same token in the JSON
// body so an app-stored token is interchangeable with the web cookie.
export async function signSessionToken(
  userId: string,
  email: string,
  secret: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  return sign({ sub: userId, email, exp }, secret, "HS256");
}

export async function issueSessionCookie(
  c: Context,
  userId: string,
  email: string,
  secret: string,
): Promise<void> {
  const token = await signSessionToken(userId, email, secret);

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
  // Cookie first — this is what the web uses, and its behaviour is unchanged.
  //
  // We also accept the same JWT via an Authorization: Bearer header, for
  // callers that can't hold an HttpOnly cookie. NOTHING USES THIS TODAY: it
  // arrived with an email-OTP flow for the iOS app, and that app is
  // deliberately login-free, so the OTP endpoints were removed on 2026-08-19.
  // The header path is kept because it is inert until something sends the
  // header, and it is the seam any future non-browser client would need.
  // If no such client ever appears, delete it rather than let it rot.
  let token: string | null = null;
  const cookieHeader = c.req.header("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (match) {
    token = match[1];
  } else {
    const authHeader = c.req.header("Authorization") ?? "";
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearer) token = bearer[1].trim();
  }
  if (!token) return null;

  try {
    const decoded = (await verify(token, secret, "HS256")) as SessionClaims;
    return decoded;
  } catch {
    return null;
  }
}
