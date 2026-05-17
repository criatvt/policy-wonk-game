#!/usr/bin/env node
// scripts/clean-and-structure.js
//
// Stage 2 of the notes pipeline (CLAUDE.md, 03-content-pipeline.md).
//
// Reads the per-source-file Markdown from working-content/<module-id>/
// (produced by scripts/ingest.js) and reorganises the content into
// per-topic files at src/content/notes/<module-id>/<topic-slug>.md,
// plus an _index.md per module.
//
// Why per-topic instead of per-source-file: players come to notes via the
// question topic after a wrong answer. They should land on a topic page,
// not a fragment of someone's lecture deck.
//
// Topic mapping (in priority order):
//   1. If working-content/<module-id>/_topics.json exists, use it. Shape:
//        {
//          "moduleName": "Public Economics - Markets",
//          "topics": [
//            {
//              "slug": "price-mechanism",
//              "title": "The Price Mechanism",
//              "order": 1,
//              "summary": "How prices coordinate decentralised decisions.",
//              "sources": ["I_rose.md", "Where_Do_Prices_Come_From.md"]
//            },
//            ...
//          ]
//        }
//   2. Otherwise, fall back to one topic per source file. The topic title
//      and slug are derived from the source filename; the order comes from
//      alphabetical sort. This is a useful first pass for Aasif to review
//      before authoring _topics.json.
//
// Usage:
//   node scripts/clean-and-structure.js              # all modules
//   node scripts/clean-and-structure.js cp-22 cg-1   # selected modules
//   node scripts/clean-and-structure.js --dry-run    # log only, no writes
//   node scripts/clean-and-structure.js --quiet
//
// The module display name (used in frontmatter) is read from
// src/data/modules.json so it stays consistent with the rest of the app.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, rmSync } from "node:fs";
import { join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WORKING_DIR = join(ROOT, "working-content");
const NOTES_DIR = join(ROOT, "src/content/notes");
const MODULES_FILE = join(ROOT, "src/data/modules.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const QUIET = args.includes("--quiet");
const requested = args.filter((a) => !a.startsWith("--"));

function log(...a) { if (!QUIET) console.log("structure:", ...a); }
function warn(...a) { console.warn("structure WARN:", ...a); }
function die(...a) { console.error("structure ERROR:", ...a); process.exit(1); }

const MODULES_META = JSON.parse(readFileSync(MODULES_FILE, "utf8"));
const MODULE_IDS = MODULES_META.map((m) => m.id);
const MODULE_NAMES = Object.fromEntries(MODULES_META.map((m) => [m.id, m.name]));

for (const m of requested) {
  if (!MODULE_IDS.includes(m)) {
    die("unknown module \"" + m + "\". Known: " + MODULE_IDS.join(", "));
  }
}
const targets = requested.length > 0 ? requested : MODULE_IDS;

// ---------- Helpers ----------

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromSlug(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Strip the ingest-stage frontmatter (between leading --- ... ---) and
// return just the body. Idempotent if no frontmatter is present.
function stripFrontmatter(md) {
  if (md.startsWith("---\n")) {
    const end = md.indexOf("\n---\n", 4);
    if (end > 0) return md.slice(end + 5).replace(/^\n+/, "");
  }
  return md;
}

// Single-line summary heuristic: first non-empty paragraph, truncated.
function deriveSummary(body) {
  const para = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p.length > 40 && !/^<!--/.test(p));
  if (!para) return "";
  const oneLine = para.slice(0, 220);
  const lastDot = oneLine.lastIndexOf(". ");
  return (lastDot > 80 ? oneLine.slice(0, lastDot + 1) : oneLine).trim();
}

function frontmatter(meta) {
  const lines = ["---"];
  lines.push("title: " + JSON.stringify(meta.title));
  lines.push("module: " + JSON.stringify(meta.module));
  lines.push("moduleName: " + JSON.stringify(meta.moduleName));
  lines.push("order: " + meta.order);
  if (meta.summary) lines.push("summary: " + JSON.stringify(meta.summary));
  if (meta.sources && meta.sources.length) {
    lines.push("sources:");
    for (const s of meta.sources) lines.push("  - " + JSON.stringify(s));
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

// ---------- Topic plan ----------

// A "topic plan" maps slug -> { title, summary, order, sources[] }.
// If _topics.json exists for a module, use it; else derive a default plan
// by treating each source file as its own topic.
function loadTopicPlan(moduleId, sourceFiles) {
  const explicitPath = join(WORKING_DIR, moduleId, "_topics.json");
  if (existsSync(explicitPath)) {
    const parsed = JSON.parse(readFileSync(explicitPath, "utf8"));
    if (!Array.isArray(parsed.topics)) {
      throw new Error("_topics.json for " + moduleId + " must have a top-level topics:[].");
    }
    const sourceSet = new Set(sourceFiles);
    const used = new Set();
    const topics = parsed.topics.map((t, idx) => {
      if (!t.slug) throw new Error(moduleId + " topic[" + idx + "] missing slug");
      if (!t.title) throw new Error(moduleId + " topic[" + idx + "] missing title");
      const sources = (t.sources || []).filter((s) => {
        if (!sourceSet.has(s)) {
          warn("topic " + t.slug + " references missing source " + s + " in " + moduleId);
          return false;
        }
        used.add(s);
        return true;
      });
      return {
        slug: t.slug,
        title: t.title,
        order: typeof t.order === "number" ? t.order : idx + 1,
        summary: t.summary || "",
        sources,
      };
    });
    const orphans = sourceFiles.filter((s) => !used.has(s));
    if (orphans.length > 0) {
      warn(moduleId + " sources not assigned to any topic: " + orphans.join(", "));
    }
    const moduleName = parsed.moduleName || MODULE_NAMES[moduleId] || moduleId;
    return { moduleName, topics };
  }
  // Default plan: one topic per source.
  const moduleName = MODULE_NAMES[moduleId] || moduleId;
  const sorted = [...sourceFiles].sort();
  const topics = sorted.map((src, idx) => {
    const stem = src.replace(/\.md$/, "");
    const slug = slugify(stem);
    return {
      slug,
      title: titleFromSlug(slug),
      order: idx + 1,
      summary: "",
      sources: [src],
    };
  });
  return { moduleName, topics };
}

// ---------- Body composition ----------

function composeTopicBody(moduleDir, topic) {
  const sections = [];
  for (const src of topic.sources) {
    const raw = readFileSync(join(moduleDir, src), "utf8");
    const body = stripFrontmatter(raw).trim();
    if (!body) continue;
    sections.push(body);
  }
  return sections.join("\n\n---\n\n");
}

// ---------- Driver ----------

function listMarkdownSources(moduleDir) {
  if (!existsSync(moduleDir)) return [];
  return readdirSync(moduleDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"));
}

function writeOrDryRun(path, contents) {
  if (DRY) {
    log("DRY-RUN would write " + relative(ROOT, path) + " (" + contents.length + " bytes)");
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function moduleIndex(moduleId, plan) {
  const lines = [];
  lines.push(frontmatter({
    title: plan.moduleName + " - overview",
    module: moduleId,
    moduleName: plan.moduleName,
    order: 0,
    summary: "Topic index for " + plan.moduleName + ".",
  }).trimEnd());
  lines.push("");
  lines.push("# " + plan.moduleName);
  lines.push("");
  lines.push("Topics in this module:");
  lines.push("");
  for (const t of plan.topics) {
    const line = "- **" + t.title + "**" + (t.summary ? " - " + t.summary : "");
    lines.push(line);
  }
  lines.push("");
  return lines.join("\n");
}

function cleanModule(moduleId) {
  const srcModuleDir = join(WORKING_DIR, moduleId);
  const outModuleDir = join(NOTES_DIR, moduleId);
  if (!existsSync(srcModuleDir)) {
    warn("no working-content for " + moduleId + " - run scripts/ingest.js first");
    return { moduleId, topics: 0, skipped: true };
  }
  const sources = listMarkdownSources(srcModuleDir);
  if (sources.length === 0) {
    warn("no .md sources for " + moduleId);
    return { moduleId, topics: 0, skipped: true };
  }
  const plan = loadTopicPlan(moduleId, sources);

  // Idempotency: blow away the module output dir before writing so stale
  // topics from previous runs are dropped. This matches the per-build
  // assumption (working-content is regenerable anyway).
  if (!DRY && existsSync(outModuleDir)) {
    rmSync(outModuleDir, { recursive: true, force: true });
  }

  for (const topic of plan.topics) {
    if (topic.sources.length === 0) continue;
    const body = composeTopicBody(srcModuleDir, topic);
    if (!body.trim()) continue;
    const summary = topic.summary || deriveSummary(body);
    const md = frontmatter({
      title: topic.title,
      module: moduleId,
      moduleName: plan.moduleName,
      order: topic.order,
      summary,
      sources: topic.sources,
    }) + "# " + topic.title + "\n\n" + body + "\n";
    const outPath = join(outModuleDir, topic.slug + ".md");
    writeOrDryRun(outPath, md);
    log(moduleId + "/" + topic.slug + ".md  (" + md.length + " bytes, " + topic.sources.length + " src)");
  }
  const idx = moduleIndex(moduleId, plan);
  writeOrDryRun(join(outModuleDir, "_index.md"), idx);
  log(moduleId + "/_index.md  (" + idx.length + " bytes)");

  return { moduleId, topics: plan.topics.length };
}

function main() {
  if (!existsSync(WORKING_DIR)) {
    die("no working-content/ directory found. Run scripts/ingest.js first.");
  }
  const summaries = [];
  for (const m of targets) {
    summaries.push(cleanModule(m));
  }
  console.log("");
  console.log("structure summary:");
  console.log("  module    topics  status");
  for (const s of summaries) {
    console.log("  " + s.moduleId.padEnd(8) + "  " + String(s.topics).padStart(6) + "  " + (s.skipped ? "skipped" : "ok"));
  }
  console.log("\nstructure finished. output: " + relative(ROOT, NOTES_DIR) + "/");
}

try { main(); } catch (e) { die(e.stack || e.message); }
