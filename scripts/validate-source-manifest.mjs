import { readCatalog } from './lib/catalog-utils.mjs';
const root = process.argv[2] || '.';
const { data, sources } = readCatalog(root);
if (data.count !== undefined && data.count !== sources.length) throw new Error(`count mismatch: ${data.count} != ${sources.length}`);
const ids = new Set();
for (const s of sources) {
  if (!s.id) throw new Error('source missing id');
  if (ids.has(s.id)) throw new Error(`duplicate id: ${s.id}`);
  ids.add(s.id);
}
if (sources.length < 386) throw new Error(`source count below supplied v25.2 baseline: ${sources.length}`);
console.log(`Manifest OK: ${sources.length} sources, no duplicate IDs.`);
