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
