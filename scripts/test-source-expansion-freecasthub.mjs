import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-freecasthub-'));

function copy(rel) {
  const from = path.join(repo, rel);
  const to = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts', script), tmp, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
  process.stdout.write(result.stdout || '');
}
function read(rel) {
  return JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
}
function assert(condition, message) {
  if (!condition) throw new Error(`FreeCastHub source-expansion assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
copy('data/imports/freecasthub-public-iptv.sample.m3u');
fs.writeFileSync(path.join(tmp, 'SOURCE_MANIFEST.json'), JSON.stringify({
  version: 'freecasthub-test-version',
  sources: [{
    id: 'existing-dw-english',
    title: 'DW English',
    country: 'Internationaal',
    streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8'
  }]
}, null, 2) + '\n');
fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

try {
  run('import-source-expansion.mjs', '--offline', '--feed=freecasthub-public-iptv');
  const imported = read('data/candidates/freecasthub-public-iptv.candidates.json');
  assert(imported.candidate_count === 3, 'fixture must create three candidates');
  assert(imported.consumer_visible_count === 0, 'import must remain hidden');

  const dw = imported.candidates.find(c => c.title === 'DW English');
  const abc = imported.candidates.find(c => c.title === 'ABC News Live');
  const bbc = imported.candidates.find(c => c.title === 'BBC Arabic');
  assert(dw?.review_status === 'duplicate', 'existing DW stream must be blocked as duplicate');
  assert(abc?.country_hint?.length === 1 && abc.country_hint[0] === 'international', 'missing country metadata must remain international instead of being guessed');
  assert(bbc?.review_status === 'needs_drm_official_fallback', 'MPD route must be held for official fallback');
  assert(bbc?.direct_playback_allowed === false, 'MPD direct playback must be disabled');

  run('probe-source-expansion.mjs', '--feed=freecasthub-public-iptv');
  const probe = read('data/reports/source-expansion-probe-report.json');
  assert(probe.feed_filter === 'freecasthub-public-iptv', 'probe must remain feed-scoped');
  assert(probe.checked === 3 && probe.actively_probed === 1 && probe.passed === 1, 'only the unique non-DRM fixture may consume a probe slot');

  run('approve-source-expansion.mjs', '--feed=freecasthub-public-iptv', '--allow-fixture');
  const approval = read('data/reports/source-expansion-approval-report.json');
  assert(approval.considered === 3 && approval.approved === 1 && approval.held === 2, 'approval must hold duplicate and MPD candidates');

  run('promote-source-expansion.mjs', '--feed=freecasthub-public-iptv', '--allow-fixture');
  const promotion = read('data/reports/source-expansion-promotion-report.json');
  assert(promotion.loaded_candidates === 3 && promotion.eligible_after_promotion_gate === 1, 'only one FreeCastHub fixture may reach promotion');
  assert(promotion.additions[0]?.country === 'Internationaal', 'unknown country must publish as Internationaal');
  assert(promotion.additions[0]?.source_feed_id === 'freecasthub-public-iptv', 'promotion must stay FreeCastHub-scoped');

  console.log('FreeCastHub source-expansion test OK: duplicate, international-country and MPD/DASH safety gates enforced.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
