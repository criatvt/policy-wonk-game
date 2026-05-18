// Avatar manifest helpers — client side.
//
// Source of truth: src/data/avatars.json. Server has a parallel allowlist
// at functions/api/_lib/avatars.ts which must stay in sync (12 slugs,
// monogram placeholders for Phase 1; replaced by curated pixel-art set
// under #18).

import manifest from "../data/avatars.json";

export function listAvatars() {
  return manifest;
}

export function isValidSlug(slug) {
  return manifest.some((a) => a.slug === slug);
}

export function getBySlug(slug) {
  return manifest.find((a) => a.slug === slug) ?? null;
}
