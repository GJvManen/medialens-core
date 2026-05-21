import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '.';
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
function readJsObject(rel, name) {
  const text = read(rel);
  const match = text.match(new RegExp(`window\\.${name}\\s*=\\s*(\\{[\\s\\S]*\\});?\\s*$`));
  if (!match) throw new Error(`Cannot parse ${rel}`);
  return JSON.parse(match[1]);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const catalog = readJsObject('assets/starter-catalog.js', 'MEDIALENS_CATALOG');
const imported = readJsObject('assets/imported-iptv-catalog.js', 'MEDIALENS_IMPORTED_IPTV');
const graph = readJsObject('assets/watch-graph.js', 'MEDIALENS_WATCH_GRAPH');
const index = read('index.html');
const app = read('assets/app.js');
const css = read('assets/platform.css');
const docs = [
  'README.md',
  'docs/GETTING_STARTED.md',
  'docs/PROJECT_STRUCTURE.md',
  'docs/SOURCE_POLICY.md',
  'docs/IPTV_FAST_IMPORT.md',
  'docs/RELEASE_1_0.md',
  'docs/SCREENSHOTS.md'
];

const sources = catalog.sources || [];
const importedSources = imported.sources || [];
const direct = sources.filter(s => s.streamUrl || s.stream_url || s.hlsUrl || s.videoUrl || s.embedUrl || s.playerUrl);
const allIds = new Set(sources.map(s => s.id));
const sourceManifest = JSON.parse(read('data/sources.json'));

assert(catalog.version === '1.0.0', 'Catalog version must be 1.0.0');
assert(imported.version === '1.0.0', 'Imported IPTV bundle version must be 1.0.0');
assert(graph.version === '1.0.0', 'Watch graph version must be 1.0.0');
assert(sources.length >= 764, `Expected at least 764 catalog sources, found ${sources.length}`);
assert(sourceManifest.sources?.length === sources.length, 'data/sources.json and runtime catalog must contain the same number of sources');
assert(allIds.size === sources.length, 'Catalog contains duplicate source IDs');
assert(direct.length >= 100, `Expected at least 100 direct player sources, found ${direct.length}`);
assert(importedSources.length >= 49, `Expected at least 49 imported IPTV inputs, found ${importedSources.length}`);
assert((graph.channels || []).length >= 280, `Expected at least 280 channel entities, found ${(graph.channels || []).length}`);
assert((graph.route_count || 0) >= 280, `Expected at least 280 watch routes, found ${graph.route_count || 0}`);
assert(index.includes('?v=1.0.0'), 'index.html must cache-bust assets with v=1.0.0');
assert(app.includes("const PRODUCT_VERSION = '1.0.0';"), 'app.js must expose product version 1.0.0');
assert(css.includes('leader') || css.includes('hero'), 'platform.css should include leader/hero styling');
for (const rel of docs) assert(fs.existsSync(path.join(root, rel)), `${rel} is missing`);
for (const rel of ['screenshots/home.png','screenshots/countries.png','screenshots/watch.png']) assert(fs.existsSync(path.join(root, rel)), `${rel} is missing`);
const publicText = [index, app, read('README.md'), read('docs/RELEASE_1_0.md'), read('docs/IPTV_FAST_IMPORT.md')].join('\n');
assert(!/quality\.panel\.title|null\.title/.test(publicText), 'Public UI text contains unresolved keys or placeholder text');
const originPattern = new RegExp(['Chat','GPT'].join('') + '|Open' + 'AI', 'i');
assert(!originPattern.test(publicText), 'Public documentation should not expose private development-origin references');

console.log(JSON.stringify({
  ok: true,
  version: '1.0.0',
  catalog_sources: sources.length,
  direct_player_sources: direct.length,
  imported_iptv_inputs: importedSources.length,
  watch_graph_channels: (graph.channels || []).length,
  watch_graph_routes: graph.route_count || 0,
  watch_graph_countries: (graph.countries || []).length
}, null, 2));
