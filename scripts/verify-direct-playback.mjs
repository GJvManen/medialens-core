import fs from 'node:fs';
const root = process.argv[2] || '.';
const data = JSON.parse(fs.readFileSync(`${root}/SOURCE_MANIFEST.json`,'utf8'));
const sources = data.sources || [];
const direct = sources.filter(s => s.streamUrl || s.hlsUrl || s.videoUrl || s.embedUrl);
if (direct.length < 60) throw new Error(`Expected at least 60 direct sources, got ${direct.length}`);
const bad = direct.filter(s => !/^https?:\/\//i.test(s.streamUrl || s.hlsUrl || s.videoUrl || s.embedUrl));
if (bad.length) throw new Error(`Bad direct URLs: ${bad.map(s=>s.id).join(', ')}`);
console.log(`Direct playback OK: ${direct.length} direct sources.`);
