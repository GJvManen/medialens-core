import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || '.';
for (const file of ['index.html','assets/app.js','assets/platform.css','assets/starter-catalog.js','SOURCE_MANIFEST.json']) {
  if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`);
}
const data = JSON.parse(fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json'),'utf8'));
const sources = data.sources || [];
if (sources.length < 386) throw new Error(`Expected at least 386 sources, got ${sources.length}`);
console.log(`Smoke test OK: ${sources.length} sources.`);
