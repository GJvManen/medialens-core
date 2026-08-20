import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-famelack-evidence-'));

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
function read(rel) { return JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8')); }
function write(rel, value) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function assert(condition, message) {
  if (!condition) throw new Error(`Famelack evidence assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
write('data/imports/famelack-data.sample.json', [
  {
    nanoid: 'verified-a1',
    name: 'A1 TV Verified Fixture',
    sources: { streams: ['https://stream.a1mediagroep.nl/hls/a1tv.m3u8'] },
    languages: ['nld'],
    country: 'nl',
    isGeoBlocked: false
  },
  {
    nanoid: 'unverified-example',
    name: 'Unverified Dataset Fixture',
    sources: { streams: ['https://example.invalid/live/unverified.m3u8'] },
    languages: ['eng'],
    country: 'nl',
    isGeoBlocked: false
  }
]);
write('data/iptv/famelack-official-evidence.json', {
  version: 'fixture-evidence-v1',
  records: [{
    channel_id: 'verified-a1',
    stream_url: 'https://stream.a1mediagroep.nl/hls/a1tv.m3u8',
    official_url: 'https://www.a1mediagroep.nl/',
    evidence_url: 'https://www.a1mediagroep.nl/',
    rights_basis: 'Fixture: official broadcaster page independently verified for this exact stream.',
    verified_at: '2026-08-20T00:00:00Z'
  }]
});
write('SOURCE_MANIFEST.json', { version: 'famelack-evidence-test', sources: [] });

try {
  run('import-source-expansion.mjs', '--offline', '--feed=famelack-data');
  run('gate-famelack-evidence.mjs');
  const candidates = read('data/candidates/famelack-data.candidates.json');
  const verified = candidates.candidates.find(c => c.tvg_id === 'verified-a1');
  const unverified = candidates.candidates.find(c => c.tvg_id === 'unverified-example');
  assert(candidates.candidate_count === 2, 'fixture must create two candidates');
  assert(verified?.provenance_status === 'independent_official_source_evidence_verified', 'allowlisted exact record must be independently verified');
  assert(verified?.evidence_url === 'https://www.a1mediagroep.nl/', 'verified record must carry independent evidence URL');
  assert(verified?.rights_basis, 'verified record must carry candidate-level rights basis');
  assert(!verified?.blocked_reason, 'verified safe record must remain eligible for probing');
  assert(unverified?.review_status === 'needs_rights_review', 'dataset-only record must be held before probing');
  assert(unverified?.blocked_reason === 'dataset_license_not_stream_rights_evidence', 'dataset-only record must have explicit evidence blocker');
  assert(unverified?.direct_playback_allowed === false, 'unverified record must never be direct-playable');

  run('probe-source-expansion.mjs', '--feed=famelack-data');
  const probe = read('data/reports/source-expansion-probe-report.json');
  assert(probe.checked === 2 && probe.actively_probed === 1 && probe.passed === 1, 'only independently verified Famelack candidate may consume probe budget');

  run('approve-source-expansion.mjs', '--feed=famelack-data', '--allow-fixture');
  const approval = read('data/reports/source-expansion-approval-report.json');
  assert(approval.considered === 2 && approval.approved === 1 && approval.held === 1, 'candidate-level rights evidence must allow exactly one fixture through approval');

  run('promote-source-expansion.mjs', '--feed=famelack-data', '--allow-fixture');
  const promotion = read('data/reports/source-expansion-promotion-report.json');
  assert(promotion.loaded_candidates === 2 && promotion.eligible_after_promotion_gate === 1, 'only independently verified fixture may reach promotion');
  console.log('Famelack evidence gate test OK: dataset license alone is held; exact independent broadcaster evidence can advance one candidate.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
