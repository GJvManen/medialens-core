import fs from 'node:fs';
const root = process.argv[2] || '.';
const data = JSON.parse(fs.readFileSync(`${root}/SOURCE_MANIFEST.json`,'utf8'));
const sources = data.sources || [];
const bad = sources.filter(s => s.url && !/^https?:\/\//i.test(s.url));
if (bad.length) throw new Error(`Invalid official URLs: ${bad.map(s=>s.id).slice(0,20).join(', ')}`);
const app = fs.readFileSync(`${root}/assets/app.js`,'utf8');
for (const token of ['closest(\'a[data-source-id]\')','closest(\'[data-nav]\')','closest(\'[data-action]\')','officialLink']) {
  if (!app.includes(token)) throw new Error(`Missing action/link handler: ${token}`);
}
console.log(`Links/actions OK: ${sources.length} official records checked.`);
