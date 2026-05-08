#!/usr/bin/env node
// Validates the authored question banks against the rules in
// 04-question-schema.md. Two severities:
//   ERROR   — must be fixed before build
//   WARNING — Aasif should look, but not blocking
//
// Usage: npm run validate-questions
//        node scripts/validate-questions.js [--quiet]

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const QUESTIONS_DIR = join(ROOT, "src/data/questions");

const MODULES = [
  "cg-1",
  "cp-10",
  "cp-11",
  "cp-12",
  "cp-13",
  "cp-21",
  "cp-22",
  "cp-23",
  "cp-25",
  "cp-33",
  "cs-11",
];

const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
const STEM_LIMIT = { easy: 150, medium: 300, hard: 500, expert: 500 };
const OPTION_CHAR_LIMIT = 200;
const MIN_PER_MODULE = 40;
const MIN_PER_DIFFICULTY = 8;
const TARGET_DISTRIBUTION = { easy: 0.30, medium: 0.30, hard: 0.25, expert: 0.15 };
const DISTRIBUTION_TOLERANCE = 0.10;

const args = new Set(process.argv.slice(2));
const QUIET = args.has("--quiet");

const errors = [];
const warnings = [];
const seenIds = new Map();      // id -> module
const seenStems = new Map();    // normalised stem -> { module, id }

function err(file, id, msg) {
  errors.push({ file, id, msg });
}

function warn(file, id, msg) {
  warnings.push({ file, id, msg });
}

function normaliseStem(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function validateQuestion(q, file, idx) {
  const fileLabel = `${file}[${idx}]`;
  const id = q?.id ?? `<missing-id @${idx}>`;

  // Required fields
  for (const field of ["id", "module", "difficulty", "question", "options", "correctIndex"]) {
    if (!(field in q)) {
      err(fileLabel, id, `missing required field: ${field}`);
    }
  }

  if (typeof q.id !== "string" || !/^[a-z]+\d*-q\d{3}$/.test(q.id)) {
    err(fileLabel, id, `id "${q.id}" does not match <module-short>-q<3-digit> pattern`);
  }

  // Uniqueness across the entire bank
  if (typeof q.id === "string") {
    if (seenIds.has(q.id)) {
      err(fileLabel, id, `duplicate id — also seen in ${seenIds.get(q.id)}`);
    } else {
      seenIds.set(q.id, fileLabel);
    }
  }

  if (typeof q.module !== "string" || !MODULES.includes(q.module)) {
    err(fileLabel, id, `module "${q.module}" is not a known module`);
  }

  if (!DIFFICULTIES.includes(q.difficulty)) {
    err(fileLabel, id, `difficulty "${q.difficulty}" not in ${DIFFICULTIES.join("|")}`);
  }

  // Question stem
  if (typeof q.question !== "string" || q.question.trim() === "") {
    err(fileLabel, id, `question stem missing or empty`);
  } else {
    const limit = STEM_LIMIT[q.difficulty];
    if (limit && q.question.length > limit) {
      err(fileLabel, id, `${q.difficulty} stem ${q.question.length} chars exceeds limit ${limit}`);
    }
    const normalised = normaliseStem(q.question);
    if (seenStems.has(normalised)) {
      const prev = seenStems.get(normalised);
      err(fileLabel, id, `duplicate question stem — also at ${prev.module} ${prev.id}`);
    } else {
      seenStems.set(normalised, { module: q.module, id: q.id });
    }

    // Bad-pattern soft checks
    if (/\bNOT\b/.test(q.question)) {
      warn(fileLabel, id, `stem contains explicit "NOT" — confirm clarity for timed setting`);
    }
  }

  // Options
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    err(fileLabel, id, `options must be an array of exactly 4 strings`);
  } else {
    const seen = new Set();
    let lengths = [];
    for (let i = 0; i < 4; i++) {
      const opt = q.options[i];
      if (typeof opt !== "string" || opt.trim() === "") {
        err(fileLabel, id, `option[${i}] is empty or not a string`);
        continue;
      }
      if (opt.length > OPTION_CHAR_LIMIT) {
        err(fileLabel, id, `option[${i}] is ${opt.length} chars (limit ${OPTION_CHAR_LIMIT})`);
      }
      const norm = opt.trim().toLowerCase();
      if (seen.has(norm)) {
        err(fileLabel, id, `option[${i}] duplicates an earlier option`);
      }
      seen.add(norm);
      lengths.push(opt.length);

      if (/^all of the above$/i.test(opt.trim()) || /^none of the above$/i.test(opt.trim())) {
        err(fileLabel, id, `option[${i}] uses banned "all/none of the above" pattern`);
      }
    }
    // Length-tell heuristic: warn if longest option is >2x shortest non-empty option
    if (lengths.length === 4) {
      const min = Math.min(...lengths);
      const max = Math.max(...lengths);
      if (min > 0 && max > min * 2.2) {
        warn(fileLabel, id, `option lengths vary widely (${min}-${max} chars) — possible "longest = correct" tell`);
      }
    }
  }

  // correctIndex
  if (![0, 1, 2, 3].includes(q.correctIndex)) {
    err(fileLabel, id, `correctIndex must be 0|1|2|3, got ${q.correctIndex}`);
  } else if (Array.isArray(q.options)) {
    const target = q.options[q.correctIndex];
    if (typeof target !== "string" || target.trim() === "") {
      err(fileLabel, id, `correctIndex points at empty/missing option`);
    }
  }

  // Optional explanation
  if ("explanation" in q && typeof q.explanation !== "string") {
    err(fileLabel, id, `explanation must be a string when present`);
  }
}

function validateModule(moduleId) {
  const file = join(QUESTIONS_DIR, `${moduleId}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    err(file, "-", `failed to parse JSON: ${e.message}`);
    return null;
  }
  if (!Array.isArray(data)) {
    err(file, "-", `top-level value must be an array`);
    return null;
  }

  data.forEach((q, idx) => validateQuestion(q, `${moduleId}.json`, idx));

  const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
  let correctIsLongest = 0;
  let correctPositionCounts = [0, 0, 0, 0];
  let scorable = 0;
  for (const q of data) {
    if (counts[q.difficulty] !== undefined) counts[q.difficulty]++;
    if (Array.isArray(q.options) && q.options.length === 4 && [0, 1, 2, 3].includes(q.correctIndex)) {
      const lengths = q.options.map((o) => (typeof o === "string" ? o.length : 0));
      const maxLen = Math.max(...lengths);
      if (lengths[q.correctIndex] === maxLen) correctIsLongest++;
      correctPositionCounts[q.correctIndex]++;
      scorable++;
    }
  }
  const total = data.length;

  // Module-level minimums
  if (total < MIN_PER_MODULE) {
    err(file, "-", `only ${total} questions in module — minimum ${MIN_PER_MODULE}`);
  }
  for (const d of DIFFICULTIES) {
    if (counts[d] < MIN_PER_DIFFICULTY) {
      err(file, "-", `only ${counts[d]} ${d} questions — minimum ${MIN_PER_DIFFICULTY}`);
    }
  }

  // Distribution warnings (not blocking)
  if (total > 0) {
    for (const d of DIFFICULTIES) {
      const actual = counts[d] / total;
      const target = TARGET_DISTRIBUTION[d];
      if (Math.abs(actual - target) > DISTRIBUTION_TOLERANCE) {
        warn(
          file,
          "-",
          `${d} share ${(actual * 100).toFixed(0)}% deviates from target ${(target * 100).toFixed(0)}% (>${DISTRIBUTION_TOLERANCE * 100}% off)`,
        );
      }
    }
  }

  return {
    moduleId,
    total,
    counts,
    correctIsLongest,
    correctPositionCounts,
    scorable,
  };
}

function main() {
  const present = new Set(
    readdirSync(QUESTIONS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, "")),
  );
  for (const m of MODULES) {
    if (!present.has(m)) {
      err(`${m}.json`, "-", `module file missing`);
    }
  }
  for (const file of present) {
    if (!MODULES.includes(file)) {
      warn(`${file}.json`, "-", `unexpected module file (not in MODULES allowlist)`);
    }
  }

  const summaries = [];
  for (const m of MODULES) {
    if (!present.has(m)) continue;
    const s = validateModule(m);
    if (s) summaries.push(s);
  }

  // Output
  if (!QUIET) {
    console.log("Per-module distribution:");
    console.log("  module    total  easy  med  hard  exp");
    for (const s of summaries) {
      console.log(
        `  ${s.moduleId.padEnd(8)}  ${String(s.total).padStart(5)}  ${String(s.counts.easy).padStart(4)}  ${String(s.counts.medium).padStart(3)}  ${String(s.counts.hard).padStart(4)}  ${String(s.counts.expert).padStart(3)}`,
      );
    }
    const grand = summaries.reduce((acc, s) => acc + s.total, 0);
    console.log(`  ${"TOTAL".padEnd(8)}  ${String(grand).padStart(5)}`);
    console.log("");

    // Tell-detection diagnostics — random baseline for "correct is longest" is ~25%
    console.log("Tell diagnostics (correct-answer position bias):");
    console.log("  module    %longest  posA  posB  posC  posD");
    for (const s of summaries) {
      const pct = s.scorable > 0 ? ((s.correctIsLongest / s.scorable) * 100).toFixed(0) : "  -";
      const [a, b, c, d] = s.correctPositionCounts;
      console.log(
        `  ${s.moduleId.padEnd(8)}    ${String(pct).padStart(4)}%   ${String(a).padStart(3)}   ${String(b).padStart(3)}   ${String(c).padStart(3)}   ${String(d).padStart(3)}`,
      );
    }
    const totalScorable = summaries.reduce((a, s) => a + s.scorable, 0);
    const totalLongest = summaries.reduce((a, s) => a + s.correctIsLongest, 0);
    const overall = totalScorable > 0 ? ((totalLongest / totalScorable) * 100).toFixed(0) : "  -";
    console.log(`  ${"OVERALL".padEnd(8)}    ${String(overall).padStart(4)}%`);
    console.log("  (Random baseline: 25%. >50% indicates the 'longest = correct' tell.)");
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  [${w.file}] ${w.id}: ${w.msg}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.error(`ERRORS (${errors.length}):`);
    for (const e of errors) {
      console.error(`  [${e.file}] ${e.id}: ${e.msg}`);
    }
    console.error("");
    console.error(`Validation FAILED with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`Validation PASSED. ${warnings.length} warning(s) for review.`);
}

main();
