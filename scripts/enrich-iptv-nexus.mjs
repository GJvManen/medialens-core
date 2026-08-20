import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeJson } from './lib/catalog-utils.mjs';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const write = args.includes('--write');
const registryPath = path.join(root, 'data/iptv/source-expansion-registry.json');
const fixturePath = path.join(root, 'data/imports/iptv-nexus.sample.json');
const reportPath = path.join(root, 'data/reports/iptv-nexus-enrichment-report.json');

if (!fs.existsSync(registryPath)) throw new Error('Missing source-expansion registry');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const nexus = (registry.sources || []).find(source => source.id === 'iptv-nexus');
if (!nexus || nexus.integration_role !== 'enrichment') throw new Error('IPTV Nexus must remain a registered enrichment source');

function normUrl(value = '') {
  try {
    const u = new URL(String(value || '').trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MediaLens/38.5 iptv-nexus-enrichment' } });
  if (!response.ok) throw new Error(`fetch failed ${response.status} for ${url}`);
  return response.json();
}

let channels;
let indexMetadata = null;
if (offline) {
  if (!fs.existsSync(fixturePath)) throw new Error('Missing IPTV Nexus offline fixture');
  channels = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
} else {
  if (nexus.metadata_url) indexMetadata = await fetchJson(nexus.metadata_url);
  channels = await fetchJson(nexus.channels_url);
}
if (!Array.isArray(channels)) throw new Error('IPTV Nexus channel endpoint did not return an array');

const streamIndex = new Map();
let nexusStreamCount = 0;
for (const channel of channels) {
  for (const stream of channel?.streams || []) {
    const url = normUrl(stream?.url);
    if (!url) continue;
    nexusStreamCount++;
    const current = streamIndex.get(url);
    const rank = Number(stream?.rank ?? -1);
    const currentRank = Number(current?.stream?.rank ?? -1);
    if (!current || rank > currentRank) streamIndex.set(url, { channel, stream });
  }
}

const { data, sources } = readCatalog(root);
const enrichedSources = [];
const matches = [];
let matched = 0;
let matchedOnline = 0;
let matchedOfflineOrUnknown = 0;
let sourcesWithDirectUrl = 0;

for (const source of sources) {
  let match = null;
  let matchedField = null;
  for (const key of ['streamUrl', 'hlsUrl', 'videoUrl', 'embedUrl', 'playerUrl']) {
    const url = normUrl(source[key]);
    if (!url) continue;
    sourcesWithDirectUrl++;
    const found = streamIndex.get(url);
    if (found) {
      match = found;
      matchedField = key;
      break;
    }
  }

  if (!match) {
    enrichedSources.push(source);
    continue;
  }

  matched++;
  if (match.channel?.online === true || match.stream?.health?.status === 'online') matchedOnline++;
  else matchedOfflineOrUnknown++;

  const enrichment = {
    provider: 'IPTV Nexus',
    integration_role: 'enrichment_only',
    match_method: 'exact_stream_url',
    matched_catalog_field: matchedField,
    channel_id: match.channel?.id || null,
    channel_name: match.channel?.name || null,
    country: match.channel?.country || null,
    score: match.channel?.score ?? null,
    online: match.channel?.online ?? null,
    best_quality: match.channel?.best_quality || null,
    stream_rank: match.stream?.rank ?? null,
    stream_quality: match.stream?.quality || null,
    health: match.stream?.health || null,
    sources: match.stream?.sources || [],
    guides: match.channel?.guides || [],
    epg_url: nexus.epg_url || null,
    evidence_url: nexus.evidence_url || nexus.officialUrl,
    enriched_at: new Date().toISOString(),
    authority: 'supplemental_health_and_epg_only'
  };

  enrichedSources.push({
    ...source,
    external_enrichment: {
      ...(source.external_enrichment || {}),
      iptv_nexus: enrichment
    }
  });
  matches.push({
    source_id: source.id || source.canonical_id || source.title || null,
    title: source.title || source.name || null,
    channel_id: enrichment.channel_id,
    matched_field: matchedField,
    online: enrichment.online,
    score: enrichment.score,
    stream_rank: enrichment.stream_rank
  });
}

const report = {
  version: '1.0-iptv-nexus-enrichment',
  generated_at: new Date().toISOString(),
  offline,
  write,
  integration_role: 'enrichment_only',
  nexus_metadata: indexMetadata,
  nexus_channels_loaded: channels.length,
  nexus_streams_indexed: nexusStreamCount,
  catalog_version: data.version || null,
  catalog_sources_before: sources.length,
  catalog_sources_after: sources.length,
  new_sources_published: 0,
  matched_sources: matched,
  matched_online: matchedOnline,
  matched_offline_or_unknown: matchedOfflineOrUnknown,
  sources_with_direct_url_fields_seen: sourcesWithDirectUrl,
  match_method: 'exact_stream_url_only',
  policy: 'IPTV Nexus may enrich existing MediaLens sources with supplemental health, quality and EPG metadata. It never creates or promotes a new MediaLens source.',
  matches
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (write) {
  const out = { ...data, version: data.version, sources: enrichedSources };
  if (!Array.isArray(data)) out.count = enrichedSources.length;
  for (const rel of ['SOURCE_MANIFEST.json', 'data/SOURCE_MANIFEST.json', 'data/sources.json', 'data/official-starter-catalog.json', 'data/generated/app-catalog.json']) {
    writeJson(path.join(root, rel), out);
  }
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/starter-catalog.js'), `window.MEDIALENS_CATALOG = ${JSON.stringify(out)};\n`);
}

console.log(`IPTV Nexus enrichment ${write ? 'write' : 'dry-run'}: ${channels.length} channels loaded, ${nexusStreamCount} streams indexed, ${matched} MediaLens sources exact-matched, 0 new sources published.`);
