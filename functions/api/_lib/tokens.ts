// Magic-link token generation, hashing, and KV storage.
//
// Tokens are random 32-byte hex strings (256 bits of entropy). We store the
// SHA-256 hash in KV, never the plaintext — so a KV dump (e.g. from a
// future incident) doesn't hand out working sign-in links.

const TOKEN_TTL_SECONDS = 600; // 10 minutes
const TOKEN_KEY_PREFIX = "magic:";

export type TokenPayload = {
  email: string;
  createdAt: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function storeToken(
  kv: KVNamespace,
  token: string,
  payload: TokenPayload,
): Promise<void> {
  const key = TOKEN_KEY_PREFIX + (await hashToken(token));
  await kv.put(key, JSON.stringify(payload), {
    expirationTtl: TOKEN_TTL_SECONDS,
  });
}

// Returns the payload if the token is valid and unconsumed, null otherwise.
// On success, the token is deleted (single-use).
export async function consumeToken(
  kv: KVNamespace,
  token: string,
): Promise<TokenPayload | null> {
  const key = TOKEN_KEY_PREFIX + (await hashToken(token));
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    return JSON.parse(raw) as TokenPayload;
  } catch {
    return null;
  }
}

// Rate-limiting helpers — per-email and per-IP throttles for /send-link.
// Stored in KV with short TTLs; lightweight enough not to need a separate
// table.

const RATE_PREFIX = "rate:";

export async function checkAndIncrementRate(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; current: number }> {
  const fullKey = RATE_PREFIX + key;
  const raw = await kv.get(fullKey);
  const current = raw ? parseInt(raw, 10) : 0;
  if (current >= limit) {
    return { allowed: false, current };
  }
  await kv.put(fullKey, String(current + 1), {
    expirationTtl: windowSeconds,
  });
  return { allowed: true, current: current + 1 };
}

// Email OTP codes — the native-app login flow. Same single-use, hash-in-KV
// discipline as magic-link tokens: we store sha256(code), never the plaintext
// code, keyed by sha256(email). Codes are six numeric digits (matched to the
// 10-minute TTL — low entropy, so we also cap verify attempts).

const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_KEY_PREFIX = "otp:";
const OTP_MAX_ATTEMPTS = 5;

type OtpRecord = {
  codeHash: string;
  attempts: number;
  createdAt: number;
};

// Six-digit numeric code, zero-padded, drawn from a CSPRNG.
export function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return n.toString().padStart(6, "0");
}

export async function storeOtp(
  kv: KVNamespace,
  email: string,
  code: string,
): Promise<void> {
  const key = OTP_KEY_PREFIX + (await hashToken(email));
  const record: OtpRecord = {
    codeHash: await hashToken(code),
    attempts: 0,
    createdAt: Date.now(),
  };
  await kv.put(key, JSON.stringify(record), {
    expirationTtl: OTP_TTL_SECONDS,
  });
}

// Verify a submitted code. Increments the attempt counter and deletes the
// record on success or once attempts are exhausted (so a code can't be
// brute-forced within the TTL window). Returns { ok: true } only on an exact
// hash match.
export async function verifyOtp(
  kv: KVNamespace,
  email: string,
  code: string,
): Promise<{ ok: boolean }> {
  const key = OTP_KEY_PREFIX + (await hashToken(email));
  const raw = await kv.get(key);
  if (!raw) return { ok: false };

  let record: OtpRecord;
  try {
    record = JSON.parse(raw) as OtpRecord;
  } catch {
    await kv.delete(key);
    return { ok: false };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await kv.delete(key);
    return { ok: false };
  }

  const submittedHash = await hashToken(code);
  if (!timingSafeEqual(submittedHash, record.codeHash)) {
    record.attempts += 1;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await kv.delete(key);
    } else {
      // Preserve the original TTL window — don't extend it on a wrong guess.
      const elapsed = Math.floor((Date.now() - record.createdAt) / 1000);
      const remaining = Math.max(1, OTP_TTL_SECONDS - elapsed);
      await kv.put(key, JSON.stringify(record), { expirationTtl: remaining });
    }
    return { ok: false };
  }

  await kv.delete(key);
  return { ok: true };
}

// Constant-time string compare. Both inputs here are fixed-length sha256 hex
// digests, so length never leaks the code; the loop still avoids early-out.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
