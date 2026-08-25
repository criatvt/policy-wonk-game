// Build-time index of which revision notes actually exist on disk.
//
// Note files are named for humans (e.g. "Cultural Determinism.md"), but
// Astro's glob content loader auto-generates each entry's routable slug by
// running the filename through github-slugger (see getContentEntryIdAndSlug
// in astro/dist/content/utils.js) — "Cultural Determinism" becomes
// "cultural-determinism". The question banks carry a `topic` field per
// question that should match a note's *filename*, but the real URL at
// /notes/<module>/<topic> only resolves against the *slugified* form. Using
// the raw topic string for the href 404s even when hasNote() (which used to
// compare raw filenames too) reports a match. Slugifying consistently on
// both sides — the index we build here, and the lookup/href helpers below —
// keeps this in sync with whatever Astro actually generates as a route.
//
// import.meta.glob enumerates the note files at build time. We don't pass
// `eager: true`, so the markdown content is never bundled — we only read the
// keys (file paths) to derive the slug set. Stays in sync automatically as
// notes are added or renamed; no committed manifest to drift.

// Astro's content loader (getContentEntryIdAndSlug in astro/dist/content/
// utils.js) uses the stateless `slug` export, not the stateful `GithubSlugger`
// class — matching that exactly (rather than the class, which dedupes
// repeats with a `-1`/`-2` suffix) is what keeps our slugs identical to the
// routes Astro actually generates.
import { slug as githubSlug } from "github-slugger";

// "<module>/<slug>" for every real note, excluding the per-module _index.md.
export const noteSlugs = new Set();
// modules that ship at least one note (used for the module-index fallback).
export const modulesWithNotes = new Set();

// Slugify a raw topic/filename the same way Astro's content loader does, so
// this always matches the routes Astro actually generates.
export function noteSlug(topic) {
  if (!topic) return "";
  return githubSlug(topic);
}

const noteFiles = import.meta.glob("/src/content/notes/*/*.md");

for (const path of Object.keys(noteFiles)) {
  // path looks like "/src/content/notes/cp-10/Realism and Neorealism.md"
  const parts = path.split("/");
  const rawTopic = parts[parts.length - 1].replace(/\.md$/, "");
  const moduleId = parts[parts.length - 2];
  if (!moduleId || !rawTopic) continue;
  modulesWithNotes.add(moduleId);
  if (rawTopic === "_index") continue;
  noteSlugs.add(`${moduleId}/${noteSlug(rawTopic)}`);
}

// True when /notes/<module>/<topic> resolves to a real note page.
export function hasNote(moduleId, topic) {
  if (!moduleId || !topic) return false;
  return noteSlugs.has(`${moduleId}/${noteSlug(topic)}`);
}

// True when /notes/<module>/ resolves (the module has at least one note).
export function moduleHasNotes(moduleId) {
  return Boolean(moduleId) && modulesWithNotes.has(moduleId);
}
