// Helper for the notes-authoring task: dumps every topic in a module with
// the questions that reference it (and their explanations), so the author
// has the canonical context at hand without re-reading the whole bank.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const modules = process.argv.slice(2);
if (modules.length === 0) {
  console.error("usage: node scripts/topic-context.mjs <module-id> [<module-id> ...]");
  process.exit(2);
}

const outDir = `${ROOT}/working-content/_topic-context`;
mkdirSync(outDir, { recursive: true });

for (const m of modules) {
  const data = JSON.parse(readFileSync(`${ROOT}/src/data/questions/${m}.json`, "utf8"));
  const arr = Array.isArray(data) ? data : (data.questions || data);
  const byTopic = new Map();
  for (const q of arr) {
    if (!q.topic) continue;
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }
  const sorted = [...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [];
  lines.push(`# ${m} — topic context\n`);
  for (const [topic, qs] of sorted) {
    lines.push(`## ${topic} (${qs.length} q)\n`);
    for (const q of qs) {
      lines.push(`- **${q.id}** [${q.difficulty}] ${q.question}`);
      const correct = q.options[q.correctIndex];
      lines.push(`  - correct: ${correct}`);
      if (q.explanation) lines.push(`  - explanation: ${q.explanation}`);
      if (q.source) lines.push(`  - source: ${q.source}`);
    }
    lines.push("");
  }
  writeFileSync(`${outDir}/${m}.md`, lines.join("\n"));
  console.log(`wrote ${outDir}/${m}.md (${byTopic.size} topics)`);
}
