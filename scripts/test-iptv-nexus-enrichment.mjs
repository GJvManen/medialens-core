import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.argv[2] || '.';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medialens-nexus-enrichment-'));

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
function assert(condition, message) {
  if (!condition) throw new Error(`IPTV Nexus enrichment assertion failed: ${message}`);
}
function run(...args) {
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts/enrich-iptv-nexus.mjs'), tmp, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`enrich-iptv-nexus.mjs failed with exit code ${result.status}`);
  }
  process.stdout.write(result.stdout || '');
}

copy('data/iptv/source-expansion-registry.json');
copy('data/imports/iptv-nexus.sample.json');
write('SOURCE_MANIFEST.json', {
  version: 'nexus-enrichment-test-version',
  count: 2,
  sources: [
    {
      id: 'a1-tv-existing',
      title: 'A1 TV Existing',
      country: 'NL',
      streamUrl: 'https://stream.a1mediagroep.nl/hls/a1tv.m3u8',
      source_quality: { probe_status: 'ok', verification_status: 'approved' }
    },
    {
      id: 'unmatched-existing',
      title: 'Unmatched Existing',
      country: 'NL',
      streamUrl: 'https://example.invalid/live/unmatched.m3u8',
      source_quality: { probe_status: 'ok', verification_status: 'approved' }
    }
  ]
});

try {
  run('--offline', '--write');
  const report = read('data/reports/iptv-nexus-enrichment-report.json');
  const catalog = read('SOURCE_MANIFEST.json');
  assert(report.catalog_sources_before === 2 && report.catalog_sources_after === 2, 'enrichment must preserve source count');
  assert(report.new_sources_published === 0, 'enrichment must never publish new sources');
  assert(report.matched_sources === 1, 'exactly one existing source must exact-match fixture stream');
  assert(report.match_method === 'exact_stream_url_only', 'fuzzy matching must not be used');
  assert(catalog.version === 'nexus-enrichment-test-version', 'catalog version must be preserved');
  assert(catalog.sources.length === 2, 'catalog source array length must be preserved');
  const matched = catalog.sources.find(source => source.id === 'a1-tv-existing');
  const unmatched = catalog.sources.find(source => source.id === 'unmatched-existing');
  assert(matched?.external_enrichment?.iptv_nexus?.channel_id === 'A1TV.nl', 'matched source must receive Nexus channel id');
  assert(matched?.external_enrichment?.iptv_nexus?.health?.status === 'online', 'matched source must receive supplemental health');
  assert(matched?.external_enrichment?.iptv_nexus?.authority === 'supplemental_health_and_epg_only', 'Nexus metadata must remain non-authoritative for publication');
  assert(!unmatched?.external_enrichment?.iptv_nexus, 'unmatched source must not receive guessed enrichment');
  console.log('IPTV Nexus enrichment test OK: exact URL match enriched one existing route, preserved catalog count/version, and published zero new sources.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
