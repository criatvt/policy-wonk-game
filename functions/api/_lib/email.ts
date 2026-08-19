// Brevo transactional email helper.
//
// Wraps the Brevo REST API directly via fetch — avoids pulling in an SDK
// (and its dependencies) when a single POST is all we need. Keep this
// file framework-free; route handlers import it.
//
// Why Brevo and not Resend (2026-08-19): Resend's free tier verifies
// exactly ONE sending domain per account, and that slot is held by
// another project (ploca.app). policywonkgame.aasifj.com was therefore
// never verifiable there, so every magic-link send was rejected and
// sign-in was silently dead in production. Brevo's free tier allows
// multiple verified sender domains (300 emails/day, shared across
// transactional and campaigns), which is what this project actually
// needs. Cloudflare Email Sending was considered and rejected: it
// requires the Workers Paid plan, and this account is on the free plan.
//
// The exported surface (SendArgs / SendResult / sendEmail) is unchanged
// from the Resend version, so callers did not have to move.

type SendArgs = {
  apiKey: string;
  /** Envelope sender address. Its domain must be verified in Brevo. */
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

// Display name on the From line. Kept here rather than in config: it is
// product identity, not per-environment configuration.
const FROM_NAME = "Policy Wonk";

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      // Brevo authenticates with a bare `api-key` header — NOT a Bearer
      // token. Sending Authorization instead returns 401.
      "api-key": args.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: args.from, name: FROM_NAME },
      to: [{ email: args.to }],
      subject: args.subject,
      htmlContent: args.html,
      // Brevo requires htmlContent OR textContent; we always send both so
      // plaintext-only clients still get a usable link.
      textContent: args.text,
    }),
  });

  // Brevo returns 201 on an immediate send (202 when scheduled), so test
  // the range rather than equality with 200.
  if (!res.ok) {
    const errorBody = await res.text();
    return { ok: false, status: res.status, error: errorBody };
  }

  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { ok: true, id: json.messageId ?? "" };
}

// Plaintext fallback for the magic-link email. Important for accessibility
// and for email clients that strip or refuse to render HTML.
export function magicLinkText(verifyUrl: string): string {
  return [
    "Sign in to Policy Wonk",
    "",
    "Click the link below to sign in. This link expires in 10 minutes and can only be used once.",
    "",
    verifyUrl,
    "",
    "If you didn't request this email, you can safely ignore it.",
    "",
    "— Policy Wonk",
  ].join("\n");
}

// Plaintext fallback for the OTP code email (native-app login).
export function otpCodeText(code: string): string {
  return [
    "Your Policy Wonk sign-in code",
    "",
    `Enter this code in the app to sign in: ${code}`,
    "",
    "This code expires in 10 minutes and can only be used once.",
    "",
    "If you didn't request this code, you can safely ignore this email.",
    "",
    "— Policy Wonk",
  ].join("\n");
}

// Minimal inline-styled HTML for the OTP code email. Same stripped-down,
// no-images, no-tracking treatment as the magic-link email.
export function otpCodeHtml(code: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 24px;background:#F8F1E4;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;padding:40px 36px;border:1px solid #E8DFC9">
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6B6B">Policy Wonk</p>
    <h1 style="margin:0 0 24px 0;font-size:28px;font-weight:700;line-height:1.2">Your sign-in code</h1>
    <p style="margin:0 0 24px 0;font-size:16px">Enter this code in the app to sign in. It expires in 10 minutes and can only be used once.</p>
    <p style="margin:0 0 32px 0;font-size:34px;font-weight:700;letter-spacing:0.18em;font-family:Helvetica,Arial,sans-serif">${code}</p>
    <hr style="border:none;border-top:1px solid #E8DFC9;margin:0 0 24px 0">
    <p style="margin:0;font-size:12px;color:#6B6B6B">If you didn't request this code, you can safely ignore this email. Someone may have entered your address by mistake.</p>
  </div>
</body>
</html>`;
}

// Minimal inline-styled HTML. No images, no remote fonts, no tracking.
// Matches the editorial-poster aesthetic but stripped down for email clients.
export function magicLinkHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 24px;background:#F8F1E4;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;padding:40px 36px;border:1px solid #E8DFC9">
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6B6B">Policy Wonk</p>
    <h1 style="margin:0 0 24px 0;font-size:28px;font-weight:700;line-height:1.2">Sign in to your account</h1>
    <p style="margin:0 0 24px 0;font-size:16px">Click the button below to sign in. The link expires in 10 minutes and can only be used once.</p>
    <p style="margin:0 0 32px 0"><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#1A1A1A;color:#F8F1E4;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600">Sign in</a></p>
    <p style="margin:0 0 8px 0;font-size:13px;color:#6B6B6B">Or paste this link into your browser:</p>
    <p style="margin:0 0 32px 0;font-size:13px;word-break:break-all"><a href="${verifyUrl}" style="color:#1A1A1A">${verifyUrl}</a></p>
    <hr style="border:none;border-top:1px solid #E8DFC9;margin:0 0 24px 0">
    <p style="margin:0;font-size:12px;color:#6B6B6B">If you didn't request this email, you can safely ignore it. Someone may have entered your address by mistake.</p>
  </div>
</body>
</html>`;
}
