#!/usr/bin/env node
// scripts/ingest.js
//
// Stage 1 of the notes pipeline (CLAUDE.md, 03-content-pipeline.md).
//
// Walks the source-content folders at the project root (../cg-1, ../cp-10, ...),
// extracts text from each source file, and writes one Markdown file per
// source file to working-content/<module-id>/<source-file>.md.
//
// The output of this script is the input to scripts/clean-and-structure.js.
// working-content/ is gitignored and fully regenerable from source.
//
// Usage:
//   node scripts/ingest.js                # all modules
//   node scripts/ingest.js cp-22 cg-1     # selected modules
//   node scripts/ingest.js --force        # re-extract even if up to date
//   node scripts/ingest.js --quiet        # suppress per-file logs
//
// Idempotency: skips files whose output exists and is newer than the source.
// Use --force to ignore the freshness check.
//
// Format coverage:
//   .pdf   - pure-JS extractor (Node built-ins: zlib + buffer). Handles
//            FlateDecode content streams and text-showing operators.
//            Scanned/image-only PDFs return empty text; the script warns.
//   .pptx  - optional, requires jszip + fast-xml-parser
//   .docx  - optional, requires mammoth
//   .html  - optional, requires cheerio (falls back to a regex strip)
//   .md    - passthrough
//   .txt   - passthrough
//
// The PDF extractor is intentionally dependency-free so the pipeline runs
// on a fresh clone without npm install. For PPTX/DOCX, install the optional
// libs (see package.json devDependencies) and they will be picked up.

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(ROOT, "..");
const WORKING_DIR = join(ROOT, "working-content");

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

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const QUIET = args.includes("--quiet");
const requestedModules = args.filter((a) => !a.startsWith("--"));
const targetModules = requestedModules.length > 0 ? requestedModules : MODULES;

for (const m of requestedModules) {
  if (!MODULES.includes(m)) {
    console.error("ingest: unknown module \"" + m + "\". Known: " + MODULES.join(", "));
    process.exit(2);
  }
}

function log(...a) {
  if (!QUIET) console.log("ingest:", ...a);
}
function warn(...a) {
  console.warn("ingest WARN:", ...a);
}
function die(...a) {
  console.error("ingest ERROR:", ...a);
  process.exit(1);
}

// ---------- PDF extraction (pure JS, no deps) ----------

function bufIndexOf(buf, pattern, start = 0) {
  return buf.indexOf(Buffer.from(pattern, "binary"), start);
}

// Walk the PDF byte stream collecting (dict, data) pairs for every
// "obj ... stream ... endstream" block we find. This is intentionally
// lenient: we do not parse the xref table; we scan linearly. That is
// enough to find content streams that hold text.
function findStreams(buf) {
  const streams = [];
  let pos = 0;
  while (true) {
    const objIdx = bufIndexOf(buf, " obj", pos);
    if (objIdx < 0) break;
    const dictEnd = bufIndexOf(buf, ">>", objIdx);
    const streamStart = bufIndexOf(buf, "stream", objIdx);
    if (streamStart < 0) { pos = objIdx + 4; continue; }
    if (dictEnd < 0 || dictEnd > streamStart) { pos = objIdx + 4; continue; }
    let dataStart = streamStart + 6;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const endIdx = bufIndexOf(buf, "endstream", dataStart);
    if (endIdx < 0) { pos = streamStart + 6; continue; }
    let dataEnd = endIdx;
    if (buf[dataEnd - 1] === 0x0a) dataEnd--;
    if (buf[dataEnd - 1] === 0x0d) dataEnd--;
    const dict = buf.slice(objIdx, dictEnd + 2).toString("binary");
    streams.push({ dict, data: buf.slice(dataStart, dataEnd) });
    pos = endIdx + 9;
  }
  return streams;
}

function decodeStream({ dict, data }) {
  if (/\/Filter\s*\/?\s*\[?\s*\/FlateDecode/.test(dict)) {
    try {
      return inflateSync(data);
    } catch (e) {
      return null;
    }
  }
  if (!/\/Filter/.test(dict)) return data;
  return null;
}

const PDF_ESCAPE = {
  n: 0x0a, r: 0x0d, t: 0x09, b: 0x08, f: 0x0c,
  "\\": 0x5c, "(": 0x28, ")": 0x29,
};

function decodePdfString(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === 0x5c) {
      const next = raw[i + 1];
      if (next === undefined) break;
      if (next >= 0x30 && next <= 0x37) {
        let octal = String.fromCharCode(next);
        let consumed = 1;
        if (i + 2 < raw.length && raw[i + 2] >= 0x30 && raw[i + 2] <= 0x37) {
          octal += String.fromCharCode(raw[i + 2]); consumed = 2;
          if (i + 3 < raw.length && raw[i + 3] >= 0x30 && raw[i + 3] <= 0x37) {
            octal += String.fromCharCode(raw[i + 3]); consumed = 3;
          }
        }
        out.push(parseInt(octal, 8));
        i += consumed;
      } else if (next === 0x0a) {
        i++;
      } else if (next === 0x0d) {
        i++;
        if (raw[i + 1] === 0x0a) i++;
      } else {
        const c = String.fromCharCode(next);
        out.push(PDF_ESCAPE[c] !== undefined ? PDF_ESCAPE[c] : next);
        i++;
      }
    } else {
      out.push(ch);
    }
  }
  return Buffer.from(out);
}

function readBalancedParen(buf, idx) {
  let depth = 0;
  let i = idx;
  while (i < buf.length) {
    const ch = buf[i];
    if (ch === 0x5c) { i += 2; continue; }
    if (ch === 0x28) depth++;
    else if (ch === 0x29) {
      depth--;
      if (depth === 0) return { end: i, raw: buf.slice(idx + 1, i) };
    }
    i++;
  }
  return null;
}

// PDF strings can be UTF-16BE (when prefixed with the BOM FE FF) or in the
// font encoding (often WinAnsi / PDFDocEncoding which is ASCII-compatible
// for printable chars). We treat non-UTF-16 as latin1 and let the consumer
// re-interpret; this loses information for non-Latin scripts but is a
// reasonable default for English-language course PDFs.
function maybeUtf16(b) {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return b.slice(2).swap16().toString("utf16le");
  }
  return b.toString("latin1");
}

// Extract strings from a content stream. Literal strings ( ... ) and hex
// strings < ... > emit text; T* (next line), Td/TD, BT/ET emit boundaries.
function extractTextFromStream(stream) {
  const out = [];
  let i = 0;
  while (i < stream.length) {
    const ch = stream[i];
    if (ch === 0x28) {
      const res = readBalancedParen(stream, i);
      if (!res) break;
      out.push(maybeUtf16(decodePdfString(res.raw)));
      i = res.end + 1;
      continue;
    }
    if (ch === 0x3c && stream[i + 1] !== 0x3c) {
      const close = stream.indexOf(0x3e, i + 1);
      if (close < 0) break;
      let hex = stream.slice(i + 1, close).toString("latin1").replace(/\s+/g, "");
      if (hex.length % 2 === 1) hex += "0";
      out.push(maybeUtf16(Buffer.from(hex, "hex")));
      i = close + 1;
      continue;
    }
    if (ch === 0x54 && stream[i + 1] === 0x2a) { out.push("\n"); i += 2; continue; }
    if (ch === 0x54 && (stream[i + 1] === 0x64 || stream[i + 1] === 0x44)) { out.push(" "); i += 2; continue; }
    if (ch === 0x42 && stream[i + 1] === 0x54) { out.push("\n"); i += 2; continue; }
    if (ch === 0x45 && stream[i + 1] === 0x54) { out.push("\n"); i += 2; continue; }
    i++;
  }
  return out.join("");
}

// Image / font / XObject streams will have FlateDecode payloads too, and
// random bytes can incidentally contain the substring "Tj". To avoid
// emitting that as garbage, we (1) skip streams whose dict marks them as
// images, fonts, etc., and (2) post-filter the extracted text for a
// plausible printable-character ratio.
const NON_CONTENT_SUBTYPES = /\/Subtype\s*\/(Image|Form|CIDFontType|Type[01]C|OpenType|TrueType)\b/;
const NON_CONTENT_TYPES = /\/Type\s*\/(XObject|Font|FontDescriptor|Metadata|ObjStm|XRef|EmbeddedFile)\b/;

function looksLikeText(s) {
  if (!s) return false;
  let printable = 0;
  const sample = s.length > 4000 ? s.slice(0, 4000) : s;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if ((c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x09) printable++;
  }
  return printable / sample.length > 0.85;
}

export function extractPdf(buf) {
  const streams = findStreams(buf);
  if (streams.length === 0) return "";
  const texts = [];
  for (const s of streams) {
    if (NON_CONTENT_SUBTYPES.test(s.dict)) continue;
    if (NON_CONTENT_TYPES.test(s.dict)) continue;
    const decoded = decodeStream(s);
    if (!decoded) continue;
    const probeLen = Math.min(decoded.length, 200000);
    const head = decoded.slice(0, probeLen).toString("binary");
    if (!/[)>\]]\s*T[jJ]\b/.test(head) && !/\bBT\b[\s\S]{0,200}\bET\b/.test(head)) continue;
    const text = extractTextFromStream(decoded);
    if (!looksLikeText(text)) continue;
    texts.push(text);
  }
  return texts.join("\n");
}


async function extractPdfWithFallback(buf, srcPath) {
  // Prefer pdf-parse if installed - it handles CIDFontType / ToUnicode
  // CMaps that the pure-JS extractor below cannot.
  const pdfParse = await lazy("pdf-parse");
  if (pdfParse) {
    try {
      const result = await pdfParse.default(buf);
      if (result && typeof result.text === "string" && result.text.trim().length > 0) {
        return { text: result.text, via: "pdf-parse" };
      }
    } catch (e) {
      console.warn("ingest WARN: pdf-parse threw on " + srcPath + ": " + e.message + " - falling back to pure-JS extractor");
    }
  }
  const text = extractPdf(buf);
  return { text, via: "pure-js" };
}

// ---------- Format dispatch ----------

async function lazy(name) {
  try {
    return await import(name);
  } catch (e) {
    return null;
  }
}

async function extractPptx(buf) {
  const jszip = await lazy("jszip");
  const fxp = await lazy("fast-xml-parser");
  if (!jszip || !fxp) {
    throw new Error(
      "PPTX support needs jszip and fast-xml-parser installed. " +
      "Run: npm install --save-dev jszip fast-xml-parser",
    );
  }
  const zip = await jszip.default.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)/)[1], 10);
      return na - nb;
    });
  const notesFiles = Object.keys(zip.files).filter((n) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
  ).sort();
  const parser = new fxp.XMLParser({ ignoreAttributes: false, preserveOrder: true });

  const collectText = (node, into) => {
    if (Array.isArray(node)) { node.forEach((c) => collectText(c, into)); return; }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (k === "a:t" || k === "t") {
          const v = node[k];
          if (typeof v === "string") into.push(v);
          else if (Array.isArray(v)) v.forEach((c) => collectText(c, into));
        } else {
          collectText(node[k], into);
        }
      }
    }
  };

  const out = [];
  for (const sf of slideFiles) {
    const xml = await zip.files[sf].async("string");
    const tree = parser.parse(xml);
    const into = [];
    collectText(tree, into);
    if (into.length > 0) {
      const slideNum = sf.match(/slide(\d+)/)[1];
      out.push("\n## Slide " + slideNum + "\n\n" + into.join("\n"));
    }
  }
  for (const nf of notesFiles) {
    const xml = await zip.files[nf].async("string");
    const tree = parser.parse(xml);
    const into = [];
    collectText(tree, into);
    if (into.length > 0) {
      const noteNum = nf.match(/notesSlide(\d+)/)[1];
      out.push("\n### Speaker notes (slide " + noteNum + ")\n\n" + into.join("\n"));
    }
  }
  return out.join("\n");
}

async function extractDocx(buf) {
  const mammoth = await lazy("mammoth");
  if (!mammoth) {
    throw new Error("DOCX support needs mammoth installed. Run: npm install --save-dev mammoth");
  }
  const result = await mammoth.default.convertToMarkdown({ buffer: buf });
  return result.value || "";
}

async function extractHtml(buf) {
  const html = buf.toString("utf8");
  const cheerio = await lazy("cheerio");
  if (!cheerio) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/\n{3,}/g, "\n\n");
  }
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  const parts = [];
  $("body *").each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const text = $(el).text().trim();
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      parts.push("\n" + "#".repeat(level) + " " + text + "\n");
    } else if (tag === "li") {
      parts.push("- " + text);
    } else if (tag === "p") {
      parts.push("\n" + text + "\n");
    }
  });
  return parts.join("\n");
}

// ---------- Cleaning common to all formats ----------

function reflow(text) {
  // Collapse any run of blank lines to a single blank line first.
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/g, ""));
  const tokens = [];
  let curr = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (curr.length > 0) { tokens.push(curr); curr = []; }
      tokens.push(null);  // blank marker
    } else {
      curr.push(line.trimStart());
    }
  }
  if (curr.length > 0) tokens.push(curr);
  // Merge: a sequence of non-null groups separated by a single null gets
  // glued into one paragraph unless the previous group ends in sentence
  // punctuation AND the next group starts with a capital letter or "##" /
  // bullet marker, in which case keep the break.
  const paras = [];
  let pending = null;
  for (const t of tokens) {
    if (t === null) continue;
    const joined = t.join(" ");
    if (pending === null) { pending = joined; continue; }
    const endsSentence = /[.!?:;]"?’?\)?$/.test(pending.trim());
    const startsNew = /^[A-Z“”#\-\*0-9]/.test(joined.trim());
    if (endsSentence && startsNew && joined.length > 20) {
      paras.push(pending);
      pending = joined;
    } else {
      pending = pending + " " + joined;
    }
  }
  if (pending !== null) paras.push(pending);
  return paras
    .map((p) => p.replace(/(\w)- (\w)/g, "$1$2"))
    .map((p) => p.replace(/[ \t]{2,}/g, " "))
    .map((p) => p.replace(/ +([,.;:?!])/g, "$1"))
    .join("\n\n");
}

const NOISE_PATTERNS = [
  /^\s*page\s+\d+(\s*(of|\/)\s*\d+)?\s*$/i,
  /^\s*-?\s*\d+\s*-?\s*$/,
  /^\s*slide\s+\d+\s*$/i,
  /^\s*confidential\b/i,
  /^\s*\u00A9\s*\d{4}/,
  /^\s*all rights reserved\.?\s*$/i,
  /^\s*\(c\)\s*\d{4}/i,
  /^\s*draft\s*[-]?\s*do not (cite|distribute)/i,
];

function stripNoise(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !NOISE_PATTERNS.some((re) => re.test(line)))
    .join("\n");
}

// Collapse a header that repeats on every page to a single occurrence.
function dropRepeatedRunningHeaders(text) {
  const lines = text.split(/\r?\n/);
  const counts = new Map();
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.length > 80) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const drop = new Set();
  for (const [t, n] of counts) {
    if (n > 3) drop.add(t);
  }
  const firstSeen = new Set();
  const out = [];
  for (const l of lines) {
    const t = l.trim();
    if (drop.has(t)) {
      if (firstSeen.has(t)) continue;
      firstSeen.add(t);
    }
    out.push(l);
  }
  return out.join("\n");
}


// Many PDFs encode text in MacRoman or WinAnsi, not strict Latin-1. We
// extracted as latin1, so the printable-but-funny bytes look like \xD3
// (right double quote in MacRoman) coming through as \xD3 (Latin Capital
// O Tilde). A small fixup catches the common cases — full font-encoding
// CMap parsing is out of scope for v1.
const MACROMAN_FIXUPS = {
  "Ò": "“", "Ó": "”",   // curly double quotes
  "Ô": "‘", "Õ": "’",   // curly single quotes
  "Ñ": "—",                          // em dash
  "Ð": "–",                          // en dash
  "É": "…",                          // ellipsis
  "Þ": "fi", "ß": "fl",
};
function fixMacRoman(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += MACROMAN_FIXUPS[c] !== undefined ? MACROMAN_FIXUPS[c] : c;
  }
  return out;
}
function cleanExtractedText(raw) {
  let t = fixMacRoman(raw);
  // Normalise non-breaking space (0xA0) and zero-width space (0x200B)
  const nbsp = String.fromCharCode(0xA0);
  const zwsp = String.fromCharCode(0x200B);
  t = t.split(nbsp).join(" ");
  t = t.split(zwsp).join("");
  // Drop private-use-area glyphs (icon fonts in PDF content streams)
  t = t.replace(/[-]/g, "");
  t = stripNoise(t);
  t = dropRepeatedRunningHeaders(t);
  t = reflow(t);
  return t.trim();
}

// ---------- File-level driver ----------

const SKIP_NAMES = new Set([".DS_Store", "Thumbs.db"]);

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function outputPathFor(moduleId, srcPath) {
  const base = basename(srcPath);
  // Strip extension(s) and replace with .md
  const stem = base.replace(/\.[A-Za-z0-9]+$/, "");
  // Make the filename filesystem-friendly but keep it recognisable.
  const safe = stem
    .replace(/[\/\\]/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return join(WORKING_DIR, moduleId, safe + ".md");
}

function needsRebuild(srcPath, outPath) {
  if (FORCE) return true;
  if (!existsSync(outPath)) return true;
  const a = statSync(srcPath).mtimeMs;
  const b = statSync(outPath).mtimeMs;
  return a > b;
}

let lastPdfVia = null;
async function extractByExtension(srcPath) {
  const ext = extname(srcPath).toLowerCase();
  const buf = readFileSync(srcPath);
  if (ext === ".pdf") { const r = await extractPdfWithFallback(buf, srcPath); lastPdfVia = r.via; return r.text; }
  if (ext === ".pptx") return await extractPptx(buf);
  if (ext === ".docx") return await extractDocx(buf);
  if (ext === ".html" || ext === ".htm") return await extractHtml(buf);
  if (ext === ".md") return buf.toString("utf8");
  if (ext === ".txt") return buf.toString("utf8");
  throw new Error("unsupported extension: " + ext);
}

function frontmatter(srcRel, moduleId) {
  return [
    "---",
    "source: " + JSON.stringify(srcRel),
    "module: " + moduleId,
    "extractedAt: " + new Date().toISOString(),
    "---",
    "",
  ].join("\n");
}

async function ingestModule(moduleId) {
  const srcDir = join(PROJECT_ROOT, moduleId);
  if (!existsSync(srcDir)) {
    warn("module folder missing: " + srcDir + " - skipping");
    return { module: moduleId, files: 0, skipped: 0, empty: 0 };
  }
  const entries = readdirSync(srcDir, { withFileTypes: true });
  let files = 0, skipped = 0, empty = 0, errors = 0;
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (SKIP_NAMES.has(ent.name)) continue;
    const srcPath = join(srcDir, ent.name);
    const ext = extname(ent.name).toLowerCase();
    const KNOWN = [".pdf", ".pptx", ".docx", ".html", ".htm", ".md", ".txt"];
    if (!KNOWN.includes(ext)) {
      log("skip (unknown extension): " + moduleId + "/" + ent.name);
      continue;
    }
    const outPath = outputPathFor(moduleId, srcPath);
    if (!needsRebuild(srcPath, outPath)) {
      skipped++;
      continue;
    }
    ensureDir(dirname(outPath));
    try {
      const rawText = await extractByExtension(srcPath);
      const cleaned = cleanExtractedText(rawText || "");
      const body = cleaned.trim() === ""
        ? (ext === ".pdf" ? "<!-- empty extraction: likely a scanned PDF or one using a custom font CMap. Install pdf-parse (already in devDependencies) to handle the CMap case. -->" : "<!-- empty extraction from " + ext.slice(1) + " source. -->")
        : cleaned;
      if (cleaned.trim() === "") { empty++; if (ext === ".pdf" && lastPdfVia === "pure-js") warn("pure-JS PDF extractor returned no text for " + srcPath + ". Install pdf-parse for richer extraction."); }
      const md = frontmatter(relative(PROJECT_ROOT, srcPath), moduleId) + body + "\n";
      writeFileSync(outPath, md);
      log(moduleId + "/" + ent.name + "  ->  " + relative(ROOT, outPath) + "  (" + md.length + " bytes" + (cleaned.trim() === "" ? ", EMPTY" : "") + ")");
      files++;
    } catch (e) {
      errors++;
      console.error("ingest ERROR on " + srcPath + ": " + e.message);
    }
  }
  return { module: moduleId, files, skipped, empty, errors };
}

async function main() {
  ensureDir(WORKING_DIR);
  const summaries = [];
  for (const m of targetModules) {
    const s = await ingestModule(m);
    summaries.push(s);
  }
  console.log("");
  console.log("ingest summary:");
  console.log("  module    files-written  skipped  empty  errors");
  let totalErrors = 0;
  for (const s of summaries) {
    console.log(
      "  " + s.module.padEnd(8) + "  " + String(s.files).padStart(13) + "  " + String(s.skipped).padStart(7) + "  " + String(s.empty).padStart(5) + "  " + String(s.errors || 0).padStart(6),
    );
    totalErrors += s.errors || 0;
  }
  if (totalErrors > 0) {
    console.error("\ningest finished with " + totalErrors + " error(s).");
    process.exit(1);
  }
  console.log("\ningest finished. output: " + relative(ROOT, WORKING_DIR) + "/");
}

main().catch((e) => die(e.stack || e.message));
