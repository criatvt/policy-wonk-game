#!/usr/bin/env node
// Build-time pipeline:
//   1. Read authoring banks from src/data/questions/<module>.json
//   2. Validate (delegates to validate-questions.js)
//   3. For each question: hash the correct answer with a per-build salt,
//      shuffle options deterministically per question id, strip
//      `correctIndex` and `explanation`
//   4. Write runtime questions to dist/data/questions/<module>.json
//   5. Write explanations separately to dist/data/explanations/<module>.json
//
// The salt is generated fresh per build and embedded in the bundle via
// dist/data/_salt.json (loaded by the runtime hashing helper). It is
// casual obfuscation — not crypto.
//
// Usage: node scripts/transform-questions.js [--out=dist]

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const QUESTIONS_DIR = join(ROOT, "src/data/questions");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
);
const OUT_DIR = resolve(ROOT, args.out || "dist");
const SKIP_VALIDATE = args["skip-validate"] === true || args["skip-validate"] === "true";

function sha256(str) {
  return createHash("sha256").update(str).digest("hex");
}

// Mulberry32 PRNG — deterministic, seeded by question id so the same
// player sees a stable order across reloads, but different builds with
// the same content produce the same shuffle (option order is content-stable).
function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOptions(options, seed) {
  const indices = [0, 1, 2, 3];
  const rand = seededRandom(seed);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map((i) => options[i]);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function runValidator() {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/validate-questions.js"), "--quiet"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error("transform aborted: validation failed.");
    process.exit(result.status ?? 1);
  }
}

function main() {
  if (!SKIP_VALIDATE) runValidator();

  const salt = randomBytes(16).toString("hex");
  const moduleFiles = readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith(".json"));

  const questionsOut = join(OUT_DIR, "data/questions");
  const explanationsOut = join(OUT_DIR, "data/explanations");
  ensureDir(questionsOut);
  ensureDir(explanationsOut);

  let totalQuestions = 0;
  for (const file of moduleFiles) {
    const moduleId = file.replace(/\.json$/, "");
    const data = JSON.parse(readFileSync(join(QUESTIONS_DIR, file), "utf8"));

    const runtime = [];
    const explanations = {};

    for (const q of data) {
      const shuffled = shuffleOptions(q.options, q.id);
      const correctText = q.options[q.correctIndex];
      const correctHash = sha256(q.id + correctText + salt);

      const runtimeQ = {
        id: q.id,
        module: q.module,
        difficulty: q.difficulty,
        question: q.question,
        options: shuffled,
        correctHash,
      };
      if (q.topic) runtimeQ.topic = q.topic;
      if (q.source) runtimeQ.source = q.source;
      if (q.timerOverride) runtimeQ.timerOverride = q.timerOverride;
      runtime.push(runtimeQ);

      if (q.explanation) explanations[q.id] = q.explanation;
    }

    writeFileSync(
      join(questionsOut, file),
      JSON.stringify(runtime, null, 0),
    );
    writeFileSync(
      join(explanationsOut, file),
      JSON.stringify(explanations, null, 0),
    );
    totalQuestions += runtime.length;
  }

  // Salt embedded as a separate JSON file. Runtime hashing util reads it
  // at startup. Casual obfuscation, not crypto — see CLAUDE.md.
  writeFileSync(
    join(OUT_DIR, "data/_salt.json"),
    JSON.stringify({ salt, builtAt: new Date().toISOString() }, null, 2),
  );

  console.log(
    `transform: ${totalQuestions} questions across ${moduleFiles.length} modules → ${OUT_DIR}/data/{questions,explanations}/`,
  );
}

main();
