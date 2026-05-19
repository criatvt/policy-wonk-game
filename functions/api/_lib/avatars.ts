// Avatar slug allowlist — server side.
//
// Phase 1 ships 26 letter slugs (a-z). The avatar is the player's
// nickname's first alphabetic character, rendered as a pixelated letter
// in the UI. Auto-assigned at nickname-set time (see deriveAvatarSlug
// and POST /api/me/profile/nickname), so there is no manual picker step.
// Kept inline rather than importing the JSON because Pages Functions
// bundling is simpler when the function module is self-contained.

export const AVATAR_SLUGS = new Set([
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
]);

export function isValidAvatarSlug(slug: string): boolean {
  return AVATAR_SLUGS.has(slug);
}

// Derive an avatar slug from a nickname. First alphabetic character,
// lowercased. Falls back to "a" if the nickname starts with non-alpha
// (numbers, punctuation, an emoji, etc.) — better than rejecting the
// nickname or surfacing an "invalid avatar" error to the user.
export function deriveAvatarSlug(nickname: string): string {
  for (const ch of nickname) {
    const lower = ch.toLowerCase();
    if (lower >= "a" && lower <= "z") return lower;
  }
  return "a";
}
