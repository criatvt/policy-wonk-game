// Browser-side sha256 wrapper. Mirrors the algorithm in
// scripts/transform-questions.js so frontend hash matches build-time hash.
//   correctHash = sha256(id + correctOptionText + SALT)
// At runtime we hash (id + selectedOptionText + SALT) and compare.

import { SALT } from "./_salt.js";

const encoder = new TextEncoder();

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function isCorrect(question, selectedOptionText) {
  const candidate = await sha256Hex(question.id + selectedOptionText + SALT);
  return candidate === question.correctHash;
}

// Post-lock helper: scan options and return the index of the correct
// one. Only call this AFTER the player has locked — the salt + hashes
// are in the bundle, so this is information they could derive too. We
// use it solely to drive the reveal highlight.
export async function findCorrectIndex(question) {
  for (let i = 0; i < question.options.length; i++) {
    const candidate = await sha256Hex(question.id + question.options[i] + SALT);
    if (candidate === question.correctHash) return i;
  }
  return -1;
}
