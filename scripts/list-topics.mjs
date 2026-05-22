import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const modules = ["cp-11","cp-12","cp-13","cp-21","cp-23","cp-25","cp-33","cs-11"];
for (const m of modules) {
  const data = JSON.parse(readFileSync(`${ROOT}/src/data/questions/${m}.json`, "utf8"));
  const arr = Array.isArray(data) ? data : (data.questions || data);
  const topics = new Set();
  for (const q of arr) if (q.topic) topics.add(q.topic);
  console.log(`=== ${m} (${topics.size}) ===`);
  console.log([...topics].sort().join("\n"));
  console.log("");
}
