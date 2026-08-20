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
  assert(m3Before.candidates.length === 3, 'fixture must include three M3UPT candidates');

  const cnnBrasil = m3Before.candidates.find(c => c.title === 'CNN Brasil');
  const drmFixture = m3Before.candidates.find(c => c.title === 'DRM Fixture');
  assert(cnnBrasil?.country_hint?.[0] === 'BR', 'CNN Brasil must infer BR from tvg-id before PT source fallback');
  assert(cnnBrasil?.epg_url === 'https://m3upt.com/epg', 'M3UPT candidates must carry source EPG metadata');
  assert(drmFixture?.review_status === 'needs_drm_official_fallback', 'DASH fixture must be held for official fallback');
  assert(drmFixture?.direct_playback_allowed === false, 'DASH fixture direct playback must be disabled');

  run('probe-source-expansion.mjs', '--feed=m3upt');
  const probeReport = read('data/reports/source-expansion-probe-report.json');
  const state = read('data/iptv/source-expansion-probe-state.json');
  const tdtAfterProbe = read('data/candidates/tdtchannels-tv.candidates.json');
  const m3AfterProbe = read('data/candidates/m3upt.candidates.json');
  assert(probeReport.feed_filter === 'm3upt', 'probe report must record m3upt filter');
  assert(probeReport.checked === 3 && probeReport.actively_probed === 2, 'only two non-DRM M3UPT fixture candidates may be probed');
  assert(state.records.length === 2 && state.records.every(x => x.source_feed_id === 'm3upt'), 'probe state additions must belong to M3UPT only');
  assert(!tdtAfterProbe.candidates[0].probe, 'TDT candidate must remain untouched by M3UPT probe');
  assert(m3AfterProbe.candidates.filter(c => c.probe?.probe_status === 'fixture_ok').length === 2, 'two M3UPT fixtures must be probed successfully');
  assert(m3AfterProbe.candidates.find(c => c.title === 'DRM Fixture')?.probe?.probe_status === 'skipped_policy_block', 'DRM fixture must be skipped by probe policy');

  run('approve-source-expansion.mjs', '--feed=m3upt', '--allow-fixture');
  const approvalReport = read('data/reports/source-expansion-approval-report.json');
  const tdtAfterApproval = read('data/candidates/tdtchannels-tv.candidates.json');
  const m3AfterApproval = read('data/candidates/m3upt.candidates.json');
  assert(approvalReport.feed_filter === 'm3upt', 'approval report must record m3upt filter');
  assert(approvalReport.considered === 3 && approvalReport.approved === 2 && approvalReport.held === 1, 'M3UPT fixture approval must hold the DRM candidate');
  assert(!tdtAfterApproval.candidates[0].approval, 'TDT candidate must remain untouched by M3UPT approval');
  assert(m3AfterApproval.candidates.filter(c => c.approval?.status === 'approved').length === 2, 'two M3UPT fixtures must be approved');
  assert(m3AfterApproval.candidates.find(c => c.title === 'DRM Fixture')?.approval?.status === 'held', 'DRM fixture must remain held');

  run('promote-source-expansion.mjs', '--feed=m3upt', '--allow-fixture');
  const promotionReport = read('data/reports/source-expansion-promotion-report.json');
  assert(promotionReport.feed_filter === 'm3upt', 'promotion report must record m3upt filter');
  assert(promotionReport.loaded_candidates === 3, 'promotion must load only the three M3UPT candidates');
  assert(promotionReport.eligible_after_promotion_gate === 2, 'only two non-DRM M3UPT fixtures may reach promotion dry-run');
  assert(promotionReport.additions.every(x => x.source_feed_id === 'm3upt'), 'all proposed additions must be M3UPT');

  console.log('Source-expansion feed scope test OK: M3UPT stayed isolated, inferred country correctly, carried EPG metadata, and held DRM/DASH.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
