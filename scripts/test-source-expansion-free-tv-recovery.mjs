import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-free-tv-recovery-'));

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
  if (!condition) throw new Error(`Free-TV recovery assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
copy('data/imports/free-tv-iptv-recovery.sample.m3u');
fs.writeFileSync(path.join(tmp, 'SOURCE_MANIFEST.json'), JSON.stringify({
  version: 'free-tv-recovery-test-version',
  sources: [{
    id: 'existing-dw-english',
    title: 'DW English',
    country: 'Internationaal',
    streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8'
  }]
}, null, 2) + '\n');
fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

try {
  run('import-source-expansion.mjs', '--offline', '--feed=free-tv-iptv-recovery');
  const imported = read('data/candidates/free-tv-iptv-recovery.candidates.json');
  assert(imported.candidate_count === 4, 'fixture must create four candidates');
  assert(imported.consumer_visible_count === 0, 'recovery import must remain hidden');
  assert(imported.web_fallback_count === 1, 'one web-only route must be counted as official-web fallback');

  const dw = imported.candidates.find(c => c.title === 'DW English');
  const hls = imported.candidates.find(c => c.title === 'Recovery HLS');
  const youtube = imported.candidates.find(c => c.title === 'Recovery YouTube');
  const dash = imported.candidates.find(c => c.title === 'Recovery DASH');

  assert(dw?.review_status === 'duplicate', 'existing DW stream must be blocked as duplicate');
  assert(hls?.country_hint?.includes('NL'), 'explicit NL country metadata must be preserved');
  assert(hls?.requires_proxy === true, 'HTTP recovery route must require proxy playback');
  assert(youtube?.review_status === 'needs_official_web_fallback', 'YouTube route must be held as official-web fallback');
  assert(youtube?.direct_playback_allowed === false, 'YouTube direct playback must be disabled');
  assert(youtube?.official_page_url === 'https://www.youtube.com/@recovery/live', 'official web page URL must be preserved');
  assert(dash?.review_status === 'needs_drm_official_fallback', 'MPD route must be held for DRM/DASH fallback');
  assert(dash?.direct_playback_allowed === false, 'MPD direct playback must be disabled');

  run('probe-source-expansion.mjs', '--feed=free-tv-iptv-recovery');
  const probe = read('data/reports/source-expansion-probe-report.json');
  assert(probe.checked === 4, 'all four recovery candidates must be considered by probe policy');
  assert(probe.actively_probed === 1 && probe.passed === 1, 'only the unique direct HLS fixture may consume a probe slot');

  const afterProbe = read('data/candidates/free-tv-iptv-recovery.candidates.json');
  assert(afterProbe.candidates.find(c => c.title === 'Recovery YouTube')?.probe?.probe_status === 'skipped_policy_block', 'web-only route must never be network-probed as a stream');
  assert(afterProbe.candidates.find(c => c.title === 'Recovery DASH')?.probe?.probe_status === 'skipped_policy_block', 'DASH route must remain policy-blocked');

  run('approve-source-expansion.mjs', '--feed=free-tv-iptv-recovery', '--allow-fixture');
  const approval = read('data/reports/source-expansion-approval-report.json');
  assert(approval.considered === 4 && approval.approved === 1 && approval.held === 3, 'approval must hold duplicate, web-only and DASH routes');

  run('promote-source-expansion.mjs', '--feed=free-tv-iptv-recovery', '--allow-fixture');
  const promotion = read('data/reports/source-expansion-promotion-report.json');
  assert(promotion.loaded_candidates === 4 && promotion.eligible_after_promotion_gate === 1, 'only the direct HLS recovery fixture may reach promotion');
  assert(promotion.additions[0]?.country === 'NL', 'explicit country must survive promotion');
  assert(promotion.additions[0]?.source_feed_id === 'free-tv-iptv-recovery', 'promotion must remain recovery-feed scoped');

  console.log('Free-TV recovery test OK: duplicate, HTTP proxy, web-only fallback and DRM/DASH gates enforced.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
