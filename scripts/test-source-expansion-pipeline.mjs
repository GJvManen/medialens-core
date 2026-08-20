import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-source-expansion-'));

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
  if (!condition) throw new Error(`source-expansion pipeline assertion failed: ${message}`);
}

copy('data/iptv/source-expansion-registry.json');
for (const file of [
  'data/imports/tdtchannels-tv.sample.m3u',
  'data/imports/m3upt.sample.m3u',
  'data/imports/freecasthub-public-iptv.sample.m3u',
  'data/imports/free-tv-iptv-recovery.sample.m3u',
  'data/imports/famelack-data.sample.json'
]) copy(file);

const minimalCatalog = {
  version: 'test-contract-version',
  sources: [
    {
      id: 'existing-dw-english',
      title: 'DW English',
      country: 'Internationaal',
      streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8'
    }
  ]
};
fs.writeFileSync(path.join(tmp, 'SOURCE_MANIFEST.json'), JSON.stringify(minimalCatalog, null, 2) + '\n');
fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });

try {
  run('import-source-expansion.mjs', '--offline');
  const importReport = read('data/reports/source-expansion-import-report.json');
  assert(importReport.candidate_count > 0, 'offline import must create candidates');
  assert(importReport.consumer_visible_count === 0, 'imported candidates must never be consumer-visible');

  run('probe-source-expansion.mjs');
  const probeReport = read('data/reports/source-expansion-probe-report.json');
  assert(probeReport.checked > 0, 'probe stage must inspect candidates');
  assert(probeReport.passed > 0, 'fixture probe must pass at least one candidate');

  run('approve-source-expansion.mjs', '--allow-fixture');
  const approvalReport = read('data/reports/source-expansion-approval-report.json');
  assert(approvalReport.approved > 0, 'controlled Tier-B fixture candidates must become approval-eligible');
  assert(approvalReport.held > 0, 'at least one candidate must remain held by governance gates');
  assert(approvalReport.decisions.some(x => x.source_feed_id === 'famelack-data' && x.decision === 'held' && x.reasons.includes('missing_rights_basis')), 'Famelack must remain held without rights basis');

  run('promote-source-expansion.mjs', '--allow-fixture');
  const promotionReport = read('data/reports/source-expansion-promotion-report.json');
  assert(promotionReport.eligible_after_promotion_gate > 0, 'approved fixture candidates must reach promotion dry-run');
  assert(promotionReport.published === 0, 'dry-run must never publish');

  const catalogAfterDryRun = read('SOURCE_MANIFEST.json');
  assert(catalogAfterDryRun.sources.length === minimalCatalog.sources.length, 'dry-run must not modify the catalog');
  assert(JSON.stringify(catalogAfterDryRun) === JSON.stringify(minimalCatalog), 'dry-run catalog must remain byte-equivalent as JSON data');

  run('promote-source-expansion.mjs', '--allow-fixture', '--write');
  const catalogAfterWrite = read('SOURCE_MANIFEST.json');
  assert(catalogAfterWrite.version === minimalCatalog.version, 'promotion write must preserve the shipping catalog version contract');
  assert(catalogAfterWrite.sources.length > minimalCatalog.sources.length, 'explicit promotion write must add approved fixture sources in test mode');

  console.log(`Source-expansion E2E test OK: ${importReport.candidate_count} candidates, ${probeReport.passed} probe passes, ${approvalReport.approved} approvals, ${promotionReport.eligible_after_promotion_gate} promotion-eligible; catalog version preserved.`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
