import fs from 'node:fs';
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: node verify-source-preservation.mjs before.json after.json');
const load = p => { const d = JSON.parse(fs.readFileSync(p,'utf8')); return d.sources || d; };
const before = load(beforePath), after = load(afterPath);
const keys = s => new Set(s.map(x => x.id || x.url || x.title));
const a = keys(after); const dropped = [...keys(before)].filter(k => !a.has(k));
if (after.length < before.length || dropped.length) throw new Error(`Sources dropped: ${dropped.slice(0,10).join(', ')}`);
console.log(`Source preservation OK: ${before.length} before, ${after.length} after, 0 dropped.`);
