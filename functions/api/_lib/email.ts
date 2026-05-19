// Resend transactional email helper.
//
// Wraps the Resend REST API directly via fetch — avoids pulling in the
// resend npm package (and its dependencies) when a single POST is all
// we need. Keep this file framework-free; route handlers import it.

type SendArgs = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    return { ok: false, status: res.status, error: errorBody };
  }

  const json = (await res.json()) as { id: string };
  return { ok: true, id: json.id };
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
