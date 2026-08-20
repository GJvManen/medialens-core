import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-source-feed-scope-'));

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
  if (!condition) throw new Error(`source-expansion feed-scope assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
for (const file of [
  'data/imports/tdtchannels-tv.sample.m3u',
  'data/imports/m3upt.sample.m3u',
  'data/imports/freecasthub-public-iptv.sample.m3u',
  'data/imports/free-tv-iptv-recovery.sample.m3u',
  'data/imports/famelack-data.sample.json'
]) copy(file);

const catalog = { version: 'scope-test-version', sources: [] };
fs.writeFileSync(path.join(tmp, 'SOURCE_MANIFEST.json'), JSON.stringify(catalog, null, 2) + '\n');
fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

try {
  run('import-source-expansion.mjs', '--offline');
  const tdtBefore = read('data/candidates/tdtchannels-tv.candidates.json');
  const m3Before = read('data/candidates/m3upt.candidates.json');
  assert(tdtBefore.candidates.length === 1, 'fixture must include one TDT candidate');
  assert(m3Before.candidates.length === 1, 'fixture must include one M3UPT candidate');

  run('probe-source-expansion.mjs', '--feed=m3upt');
  const probeReport = read('data/reports/source-expansion-probe-report.json');
  const state = read('data/iptv/source-expansion-probe-state.json');
  const tdtAfterProbe = read('data/candidates/tdtchannels-tv.candidates.json');
  const m3AfterProbe = read('data/candidates/m3upt.candidates.json');
  assert(probeReport.feed_filter === 'm3upt', 'probe report must record m3upt filter');
  assert(probeReport.checked === 1 && probeReport.actively_probed === 1, 'only the M3UPT fixture candidate may be probed');
  assert(state.records.length === 1 && state.records[0].source_feed_id === 'm3upt', 'probe state addition must belong to M3UPT only');
  assert(!tdtAfterProbe.candidates[0].probe, 'TDT candidate must remain untouched by M3UPT probe');
  assert(m3AfterProbe.candidates[0].probe?.probe_status === 'fixture_ok', 'M3UPT fixture must be probed');

  run('approve-source-expansion.mjs', '--feed=m3upt', '--allow-fixture');
  const approvalReport = read('data/reports/source-expansion-approval-report.json');
  const tdtAfterApproval = read('data/candidates/tdtchannels-tv.candidates.json');
  const m3AfterApproval = read('data/candidates/m3upt.candidates.json');
  assert(approvalReport.feed_filter === 'm3upt', 'approval report must record m3upt filter');
  assert(approvalReport.considered === 1 && approvalReport.approved === 1, 'only M3UPT fixture may be approved');
  assert(!tdtAfterApproval.candidates[0].approval, 'TDT candidate must remain untouched by M3UPT approval');
  assert(m3AfterApproval.candidates[0].approval?.status === 'approved', 'M3UPT fixture must be approved');

  run('promote-source-expansion.mjs', '--feed=m3upt', '--allow-fixture');
  const promotionReport = read('data/reports/source-expansion-promotion-report.json');
  assert(promotionReport.feed_filter === 'm3upt', 'promotion report must record m3upt filter');
  assert(promotionReport.loaded_candidates === 1, 'promotion must load only one M3UPT candidate');
  assert(promotionReport.eligible_after_promotion_gate === 1, 'M3UPT fixture must reach promotion dry-run');
  assert(promotionReport.additions.every(x => x.source_feed_id === 'm3upt'), 'all proposed additions must be M3UPT');

  console.log('Source-expansion feed scope test OK: M3UPT probe, approval and promotion remained isolated from TDTChannels.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
