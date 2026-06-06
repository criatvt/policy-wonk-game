// Build-time index of which revision notes actually exist on disk.
//
// The question banks carry a `topic` slug per question, but that slug doesn't
// always have a 1:1 note file in src/content/notes/<module>/<topic>.md — the
// three lead modules (cg-1 / cp-10 / cp-22) still have kebab-mismatches from
// the question-bank authoring shortcut. Linking blindly to
// `/notes/<module>/<topic>` for an uncovered slug lands the player on a
// dead path (#39). This module is the source of truth the UI gates on.
//
// import.meta.glob enumerates the note files at build time. We don't pass
// `eager: true`, so the markdown content is never bundled — we only read the
// keys (file paths) to derive the slug set. Stays in sync automatically as
// notes are added or renamed; no committed manifest to drift.

const noteFiles = import.meta.glob("/src/content/notes/*/*.md");

// "<module>/<topic>" for every real note, excluding the per-module _index.md.
export const noteSlugs = new Set();
// modules that ship at least one note (used for the module-index fallback).
export const modulesWithNotes = new Set();

for (const path of Object.keys(noteFiles)) {
  // path looks like "/src/content/notes/cp-10/realism.md"
  const parts = path.split("/");
  const topic = parts[parts.length - 1].replace(/\.md$/, "");
  const moduleId = parts[parts.length - 2];
  if (!moduleId || !topic) continue;
  modulesWithNotes.add(moduleId);
  if (topic === "_index") continue;
  noteSlugs.add(`${moduleId}/${topic}`);
}

// True when /notes/<module>/<topic> resolves to a real note page.
export function hasNote(moduleId, topic) {
  if (!moduleId || !topic) return false;
  return noteSlugs.has(`${moduleId}/${topic}`);
}

// True when /notes/<module>/ resolves (the module has at least one note).
export function moduleHasNotes(moduleId) {
  return Boolean(moduleId) && modulesWithNotes.has(moduleId);
}
