import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-discovery-isolation-'));

function copy(rel) {
  const from = path.join(repo, rel);
  const to = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
function write(rel, value) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function read(rel) { return JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8')); }
function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts', script), tmp, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
  process.stdout.write(result.stdout || '');
}
function assert(condition, message) {
  if (!condition) throw new Error(`Discovery isolation assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
write('SOURCE_MANIFEST.json', {
  version: 'discovery-test-version',
  count: 3,
  sources: [
    { id: 'nl-a', title: 'NL A', country: 'NL', streamUrl: 'https://example.invalid/a.m3u8' },
    { id: 'nl-b', title: 'NL B', country: 'NL', streamUrl: 'https://example.invalid/b.m3u8' },
    { id: 'be-a', title: 'BE A', country: 'BE', streamUrl: 'https://example.invalid/c.m3u8' }
  ]
});

try {
  run('import-source-expansion.mjs', '--offline', '--feed=iptvcat');
  const iptvcat = read('data/candidates/iptvcat.candidates.json');
  assert(iptvcat.candidate_count === 0, 'IPTVCat must create zero bulk candidates');
  assert(iptvcat.consumer_visible_count === 0, 'IPTVCat must expose zero consumer-visible candidates');

  run('import-source-expansion.mjs', '--offline', '--feed=lyngsat-stream');
  const lyngsat = read('data/candidates/lyngsat-stream.candidates.json');
  assert(lyngsat.candidate_count === 0, 'LyngSat must create zero bulk candidates');
  assert(lyngsat.consumer_visible_count === 0, 'LyngSat must expose zero consumer-visible candidates');

  run('register-discovery-sources.mjs');
  const plan = read('data/reports/source-discovery-plan.json');
  assert(plan.discovery_source_count === 2, 'exactly two discovery-only sources must be registered');
  assert(plan.consumer_publication_from_discovery === false, 'discovery must have no direct publication path');
  assert(plan.bulk_scraping === false, 'discovery plan must prohibit bulk scraping');
  assert(plan.sources.every(source => source.operational_use === 'targeted_gap_discovery_only'), 'all discovery sources must remain targeted gap discovery only');
  assert(plan.sources.every(source => source.prohibited.includes('direct publication from discovery directory')), 'direct publication prohibition must be explicit');
  console.log('Discovery isolation test OK: IPTVCat and LyngSat remain zero-candidate targeted discovery sources with no direct publication path.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
