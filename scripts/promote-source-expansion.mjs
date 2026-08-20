import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeJson } from './lib/catalog-utils.mjs';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const write = args.includes('--write');
const allowFixture = args.includes('--allow-fixture');
const feedArg = args.find(x => x.startsWith('--feed='))?.split('=')[1] || 'all';
const candidateDir = path.join(root, 'data/candidates');
const reportDir = path.join(root, 'data/reports');
fs.mkdirSync(reportDir, { recursive: true });

const { data, sources } = readCatalog(root);

function normUrl(value = '') {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
}
function slug(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}
function meaningfulCountry(hints = []) {
  return (hints || []).map(x => String(x).trim()).find(x => x && !/^international$/i.test(x)) || 'Internationaal';
}
function languageList(value = []) {
  return Array.from(new Set((Array.isArray(value) ? value : [value]).map(x => String(x || '').trim()).filter(Boolean)));
}

const ids = new Set(sources.map(source => String(source.id || '')));
const streams = new Map();
const titleCountry = new Map();
for (const source of sources) {
  for (const key of ['streamUrl', 'hlsUrl', 'videoUrl', 'embedUrl', 'playerUrl']) {
    const url = normUrl(source[key]);
    if (url && !streams.has(url)) streams.set(url, source.id);
  }
  const tc = `${slug(source.title || source.name || '')}|${slug(source.country || source.origin_country || '')}`;
  if (tc !== '|' && !titleCountry.has(tc)) titleCountry.set(tc, source.id);
}

const additions = [];
const blockedItems = [];
let loaded = 0;
let eligible = 0;

if (fs.existsSync(candidateDir)) {
  for (const filename of fs.readdirSync(candidateDir).filter(name => name.endsWith('.candidates.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(candidateDir, filename), 'utf8'));
    if (doc.source_expansion !== true) continue;
    if (feedArg !== 'all' && doc.feed?.id && doc.feed.id !== feedArg) continue;
    for (const candidate of doc.candidates || []) {
      if (feedArg !== 'all' && candidate.source_feed_id !== feedArg) continue;
      loaded++;
      if (candidate.review_status !== 'approved_iptv' || candidate.approval?.status !== 'approved') continue;
      const approvalMode = candidate.approval?.mode;
      if (!(approvalMode === 'live_policy_gate' || (allowFixture && approvalMode === 'fixture_policy_gate'))) {
        blockedItems.push({ id: candidate.id, title: candidate.title, reason: 'approval_mode_not_publishable' });
        continue;
      }
      if (candidate.consumer_visible) {
        blockedItems.push({ id: candidate.id, title: candidate.title, reason: 'candidate_visibility_invariant_broken' });
        continue;
      }
      const duplicateTypes = [];
      if (ids.has(candidate.id)) duplicateTypes.push('id');
      const stream = normUrl(candidate.streamUrl);
      if (stream && streams.has(stream)) duplicateTypes.push('streamUrl');
      const country = meaningfulCountry(candidate.country_hint || []);
      const tc = `${slug(candidate.title)}|${slug(country)}`;
      if (country !== 'Internationaal' && titleCountry.has(tc)) duplicateTypes.push('title_country');
      if (duplicateTypes.length) {
        blockedItems.push({ id: candidate.id, title: candidate.title, reason: 'duplicate_at_promotion', duplicate_types: duplicateTypes });
        continue;
      }

      eligible++;
      const probeStatus = candidate.probe?.probe_status === 'fixture_ok' ? 'fixture_ok' : 'ok';
      const source = {
        id: candidate.id,
        title: candidate.title,
        url: candidate.officialUrl || candidate.source_feed_url,
        description: `Gecontroleerde live-bron via ${candidate.source_feed_provider || candidate.provider}.`,
        country,
        type: candidate.category || 'Live TV',
        tags: Array.from(new Set(['iptv', 'live', 'free', 'no-account', 'source-expansion', slug(candidate.category || 'live')].filter(Boolean))),
        language: languageList(candidate.language),
        free: true,
        requiresAccount: false,
        isLive: true,
        streamHealth: probeStatus === 'ok' ? 'verified-live' : 'fixture-verified',
        playbackMode: candidate.requires_proxy ? 'internal-proxy-required' : 'direct-or-official',
        region: country === 'Internationaal' ? 'Internationaal' : country,
        availability: candidate.is_geo_blocked_hint === true ? 'geo_restricted_or_variable' : 'unknown_or_variable',
        officialUrl: candidate.officialUrl || candidate.source_feed_url,
        streamUrl: candidate.streamUrl,
        canonical_id: candidate.id,
        source_type: 'public_iptv_channel',
        source_quality: {
          verification_status: 'approved',
          source_kind: 'public_iptv_channel',
          last_checked_at: String(candidate.probe?.checked_at || new Date().toISOString()).slice(0, 10),
          probe_status: probeStatus,
          confidence_score: probeStatus === 'ok' ? 82 : 70,
          evidence_url: candidate.approval?.evidence_url || candidate.evidence_url || candidate.source_feed_url,
          notes: 'Promoted through source-expansion ingest, duplicate, probe, rights/evidence and approval gates.'
        },
        origin_country: country,
        primary_markets: candidate.country_hint || [],
        availability_model: {
          origin_country: country,
          primary_markets: candidate.country_hint || [],
          known_available_countries: candidate.is_geo_blocked_hint === false && country !== 'Internationaal' ? [country] : [],
          availability_scope: country === 'Internationaal' ? 'international_or_variable' : 'regional_or_variable',
          geo_restriction: candidate.is_geo_blocked_hint === true ? 'known_or_likely' : 'unknown_or_variable',
          cross_border_policy: 'show_in_international_search_unless_probe_confirms_blocked',
          consumer_note: 'Beschikbaarheid kan per land verschillen.',
          known_restricted_countries: []
        },
        delivery: {
          web: true,
          direct_stream: true,
          iptv: true,
          iptv_review_status: 'approved_iptv',
          source_expansion: true,
          source_feed_id: candidate.source_feed_id,
          request_headers: candidate.request_headers || {},
          requires_proxy: !!candidate.requires_proxy
        },
        request_headers: candidate.request_headers || {},
        epg: candidate.epg_url ? { url: candidate.epg_url, source_feed_id: candidate.source_feed_id } : undefined,
        import_metadata: {
          importer: 'source-expansion',
          source_feed_id: candidate.source_feed_id,
          source_feed_provider: candidate.source_feed_provider || candidate.provider,
          source_tier: candidate.source_tier,
          approval_mode: approvalMode,
          rights_basis: candidate.approval?.rights_basis || null
        }
      };
      additions.push(source);
      ids.add(source.id);
      if (stream) streams.set(stream, source.id);
      if (country !== 'Internationaal') titleCountry.set(tc, source.id);
    }
  }
}

const report = {
  version: '38.4-source-expansion-promotion',
  generated_at: new Date().toISOString(),
  feed_filter: feedArg,
  write,
  allow_fixture: allowFixture,
  catalog_version_preserved: data.version || null,
  loaded_candidates: loaded,
  eligible_after_promotion_gate: eligible,
  blocked: blockedItems.length,
  published: write ? additions.length : 0,
  blocked_items: blockedItems,
  additions: additions.map(item => ({ id: item.id, title: item.title, country: item.country, source_feed_id: item.delivery.source_feed_id }))
};
writeJson(path.join(reportDir, 'source-expansion-promotion-report.json'), report);

if (write && additions.length) {
  const out = { ...data, version: data.version, sources: [...sources, ...additions] };
  out.count = out.sources.length;
  for (const rel of ['SOURCE_MANIFEST.json', 'data/SOURCE_MANIFEST.json', 'data/sources.json', 'data/official-starter-catalog.json', 'data/generated/app-catalog.json']) {
    writeJson(path.join(root, rel), out);
  }
  fs.writeFileSync(path.join(root, 'assets/starter-catalog.js'), `window.MEDIALENS_CATALOG = ${JSON.stringify(out)};\n`);
}

console.log(`Source-expansion promotion ${write ? 'write' : 'dry-run'}: ${loaded} loaded, ${eligible} eligible, ${blockedItems.length} blocked, ${write ? additions.length : 0} published; catalog version ${data.version}; feed ${feedArg}.`);