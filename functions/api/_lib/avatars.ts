// Avatar slug allowlist — server side.
//
// Phase 1 ships 12 monogram placeholders. Real pixel-art set lands with
// #18; when it does, update both this list and src/data/avatars.json
// together. Kept inline rather than importing the JSON because Pages
// Functions bundling is simpler when the function module is self-contained.

export const AVATAR_SLUGS = new Set([
  "m-a",
  "m-b",
  "m-c",
  "m-d",
  "m-e",
  "m-f",
  "m-g",
  "m-h",
  "m-i",
  "m-j",
  "m-k",
  "m-l",
]);

export function isValidAvatarSlug(slug: string): boolean {
  return AVATAR_SLUGS.has(slug);
}
