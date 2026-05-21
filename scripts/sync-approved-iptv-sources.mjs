import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeJson } from './lib/catalog-utils.mjs';

const root = process.argv[2] || '.';
const opts = new Set(process.argv.slice(3));
const dryRun = opts.has('--dry-run') || !opts.has('--write');
const VERSION = '1.0.0';
const PACK_PATH = 'data/iptv/approved-iptv-sources.json';
const GENERATED_IMPORT_PATHS = [
  'data/generated/imported-iptv-sources.json'
];
const CATALOG_TARGETS = [
  'SOURCE_MANIFEST.json',
  'data/SOURCE_MANIFEST.json',
  'data/sources.json',
  'data/official-starter-catalog.json',
  'data/generated/app-catalog.json'
];

const norm = value => String(value || '').trim();
const slug = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  .replace(/\b(1080p|720p|576p|540p|480p|360p|hd|sd|fhd|uhd|4k)\b/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 90) || 'source';
const normUrl = (url = '') => {
  try {
    const u = new URL(String(url).trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(url || '').trim().replace(/[;,]+$/, '');
  }
};
const asArray = value => Array.isArray(value) ? value : (value ? [value] : []);
const unique = values => Array.from(new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean)));
const isDirect = s => !!(s?.streamUrl || s?.hlsUrl || s?.videoUrl || s?.embedUrl || s?.playerUrl);
const isIptv = s => !!(s?.delivery?.iptv || String(s?.source_type || '').includes('iptv') || asArray(s?.tags).some(t => String(t).toLowerCase() === 'iptv'));

function readJsonIfExists(rel, fallback = null) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function categoryTags(category = '') {
  const c = String(category || '').toLowerCase();
  const tags = [slug(category)];
  if (/movie|movies|film|films|cinema|classic/.test(c)) tags.push('film', 'movie', 'movies', 'cinema');
  if (/series|shows|tv show/.test(c)) tags.push('series', 'shows', 'tv-series');
  if (/entertainment|general|variety/.test(c)) tags.push('entertainment', 'general', 'variety');
  if (/news|nieuws/.test(c)) tags.push('news', 'nieuws');
  if (/kids|children|family|animation|anime/.test(c)) tags.push('kids', 'family', 'children', 'animation');
  if (/sport/.test(c)) tags.push('sport', 'sports');
  if (/documentary|docu|education|science|culture|arts/.test(c)) tags.push('documentary', 'docu', 'education', 'science', 'culture', 'arts');
  if (/music|concert|radio/.test(c)) tags.push('music', 'radio', 'concert');
  if (/lifestyle|cooking|food|home|outdoor|travel/.test(c)) tags.push('lifestyle', 'cooking', 'food', 'home', 'outdoor', 'travel');
  if (/business|finance|markets|shopping|shop/.test(c)) tags.push('business', 'finance', 'markets', 'shop');
  if (/weather|local|community|public|legislative|government/.test(c)) tags.push('weather', 'local', 'community', 'public', 'legislative', 'government');
  if (/religious|faith/.test(c)) tags.push('religious', 'faith');
  return unique(tags);
}

function countryDisplay(hints = []) {
  const map = new Map([
    ['us', 'Verenigde Staten'], ['usa', 'Verenigde Staten'], ['united states', 'Verenigde Staten'], ['united_states', 'Verenigde Staten'],
    ['ca', 'Canada'], ['fr', 'Frankrijk'], ['de', 'Duitsland'], ['gb', 'Verenigd Koninkrijk'], ['uk', 'Verenigd Koninkrijk'],
    ['nl', 'Nederland'], ['be', 'België'], ['international', 'Internationaal'], ['worldwide', 'Internationaal']
  ]);
  const values = asArray(hints).map(x => map.get(String(x).toLowerCase()) || x).filter(Boolean);
  return values.length ? values.join(' / ') : 'Internationaal';
}

function candidateToSource(c) {
  const id = norm(c.id || `iptv-${slug(c.title || c.tvg_id || c.streamUrl)}`);
  const country = countryDisplay(c.country_hint || c.primary_markets || c.country || c.origin_country);
  const cat = c.category || c.type || 'Live TV';
  const provider = c.source_feed_provider || c.provider || 'IPTV feed';
  const officialUrl = c.officialUrl || c.source_feed_url || c.evidence_url || c.url || '#';
  const tags = unique(['iptv', 'live', 'free', 'no-account', 'public', 'controlled', ...categoryTags(cat)]);
  return {
    id,
    title: c.title || c.name || id,
    url: officialUrl,
    description: c.description || `Gecontroleerde internationale IPTV/FAST-bron via ${provider}. Beschikbaarheid kan per land verschillen.`,
    country,
    type: cat,
    tags,
    language: asArray(c.language),
    free: c.free !== false,
    requiresAccount: false,
    isLive: true,
    streamHealth: c.streamHealth || 'approved-iptv',
    playbackMode: c.playbackMode || 'direct-or-official-fallback',
    region: c.region || 'Internationaal',
    availability: c.availability || 'unknown',
    officialUrl,
    streamUrl: c.streamUrl || c.hlsUrl || c.videoUrl || c.playerUrl,
    canonical_id: c.canonical_id || id,
    source_type: c.source_type || 'public_iptv_channel',
    source_quality: {
      verification_status: 'public',
      source_kind: 'public_iptv_channel',
      last_checked_at: new Date().toISOString().slice(0, 10),
      probe_status: c.probe_status || c.source_quality?.probe_status || 'approved_not_reprobed_in_build',
      confidence_score: Number(c.confidence_score || c.source_quality?.confidence_score || 66),
      evidence_url: c.evidence_url || c.source_feed_url || c.source_quality?.evidence_url || officialUrl,
      notes: c.source_quality?.notes || 'Synced from the approved IPTV/FAST queue and imported feed candidates with duplicate gate.'
    },
    origin_country: c.origin_country || country,
    primary_markets: unique([...(asArray(c.primary_markets)), ...(asArray(c.country_hint)), country]),
    availability_model: c.availability_model || {
      origin_country: c.origin_country || country,
      primary_markets: unique([...(asArray(c.primary_markets)), ...(asArray(c.country_hint)), country]),
      known_available_countries: [],
      availability_scope: 'unknown_or_variable',
      geo_restriction: 'unknown_or_variable',
      cross_border_policy: 'show_in_international_search_unless_probe_confirms_blocked',
      consumer_note: 'Beschikbaarheid kan per land verschillen.',
      known_restricted_countries: []
    },
    delivery: {
      ...(c.delivery || {}),
      web: true,
      direct_stream: true,
      iptv: true,
      iptv_review_status: c.review_status || c.delivery?.iptv_review_status || 'approved_iptv'
    },
    import_metadata: {
      ...(c.import_metadata || {}),
      imported_as: 'approved_iptv_sync',
      source_feed_id: c.source_feed_id || c.feed_id || c.import_metadata?.source_feed_id || 'approved-iptv-sources',
      source_feed_provider: provider
    }
  };
}

function approvedCandidateStatuses() {
  return new Set([
    'approved',
    'approved_iptv',
    'approved_public_iptv',
    'controlled_iptv',
    'verified_iptv',
    // import:iptv-feeds creates these after its duplicate/safety gate. They are
    // deliberately included here so a later sync cannot hide checked imports.
    'imported_safe_candidate',
    'imported_visible',
    'consumer_visible_import'
  ]);
}

function loadApprovedPack() {
  const doc = readJsonIfExists(PACK_PATH, { sources: [] });
  return (doc.sources || []).filter(Boolean).map(candidateToSource);
}

function isRejectedCandidate(c) {
  const status = String(c?.review_status || '').toLowerCase();
  const blocked = String(c?.blocked_reason || '').trim();
  return ['duplicate', 'rejected', 'needs_rights_review'].includes(status) || !!blocked || c?.consumer_visible === false;
}

function loadApprovedCandidates() {
  const dir = path.join(root, 'data/candidates');
  if (!fs.existsSync(dir)) return [];
  const allowed = approvedCandidateStatuses();
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.candidates.json') || f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const c of doc.candidates || []) {
      const status = String(c.review_status || '').toLowerCase();
      if (!allowed.has(status)) continue;
      if (isRejectedCandidate(c)) continue;
      out.push(candidateToSource(c));
    }
  }
  return out;
}

function loadGeneratedImportedSources() {
  const out = [];
  for (const rel of GENERATED_IMPORT_PATHS) {
    const doc = readJsonIfExists(rel, null);
    if (!doc || !Array.isArray(doc.sources)) continue;
    for (const s of doc.sources) {
      if (!s || !isDirect(s) || !isIptv(s)) continue;
      out.push({
        ...s,
        import_metadata: {
          ...(s.import_metadata || {}),
          imported_as: s.import_metadata?.imported_as || 'imported_iptv_feed_runtime',
          source_feed_id: s.import_metadata?.source_feed_id || 'import-iptv-feeds'
        },
        delivery: {
          ...(s.delivery || {}),
          web: true,
          direct_stream: true,
          iptv: true,
          iptv_review_status: s.delivery?.iptv_review_status || 'imported_visible'
        },
        tags: unique([...(s.tags || []), 'iptv', 'imported_iptv', 'live', 'direct'])
      });
    }
  }
  return out;
}

function sourceKey(s) {
  const stream = normUrl(s.streamUrl || s.hlsUrl || s.videoUrl || s.embedUrl || s.playerUrl || '');
  if (stream) return `stream:${stream}`;
  return `title:${slug(s.country || s.origin_country || '')}|${slug(s.title || s.name || s.id || '')}`;
}

function mergeSources(base, approvedSources) {
  const byId = new Map();
  const byKey = new Map();
  const merged = [];
  const added = [];
  const updated = [];
  const skipped = [];
  const putIndexes = (s, index) => {
    if (s.id) byId.set(String(s.id), index);
    byKey.set(sourceKey(s), index);
  };
  base.forEach((s, index) => { merged.push(s); putIndexes(s, index); });
  for (const source of approvedSources) {
    if (!source.id || !isDirect(source) || !isIptv(source)) {
      skipped.push({ id: source.id, title: source.title, reason: 'not_direct_iptv' });
      continue;
    }
    const idHit = byId.get(String(source.id));
    const keyHit = byKey.get(sourceKey(source));
    const hit = Number.isInteger(idHit) ? idHit : keyHit;
    if (Number.isInteger(hit)) {
      const before = merged[hit];
      merged[hit] = {
        ...before,
        ...source,
        id: before.id || source.id,
        title: before.title || source.title,
        tags: unique([...(before.tags || []), ...(source.tags || [])]),
        language: unique([...(before.language || []), ...(source.language || [])]),
        primary_markets: unique([...(before.primary_markets || []), ...(source.primary_markets || [])]),
        source_quality: { ...(before.source_quality || {}), ...(source.source_quality || {}) },
        availability_model: { ...(before.availability_model || {}), ...(source.availability_model || {}) },
        delivery: { ...(before.delivery || {}), ...(source.delivery || {}), web: true, direct_stream: true, iptv: true },
        import_metadata: { ...(before.import_metadata || {}), ...(source.import_metadata || {}) }
      };
      updated.push({ id: merged[hit].id, title: merged[hit].title });
      putIndexes(merged[hit], hit);
      continue;
    }
    merged.push(source);
    putIndexes(source, merged.length - 1);
    added.push({ id: source.id, title: source.title, country: source.country });
  }
  return { merged, added, updated, skipped };
}

function writeImportedCatalog(approvedSources, report) {
  const visible = approvedSources.filter(s => isDirect(s) && isIptv(s));
  const categories = new Map();
  const providers = new Map();
  for (const s of visible) {
    categories.set(s.type || 'Live TV', (categories.get(s.type || 'Live TV') || 0) + 1);
    const provider = s.import_metadata?.source_feed_provider || s.provider || 'Approved IPTV';
    providers.set(provider, (providers.get(provider) || 0) + 1);
  }
  const doc = {
    version: '37.0.1',
    generatedAt: new Date().toISOString(),
    source_count: visible.length,
    candidate_count: report.approved_inputs,
    duplicate_count: report.updated_existing,
    hidden_count: 0,
    sources: visible,
    category_summary: [...categories.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    provider_summary: [...providers.entries()].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider)),
    consumer_note: 'Goedgekeurde IPTV/FAST-bronnen worden automatisch vanuit de goedgekeurde importbestanden en kandidaten gesynchroniseerd. Runtime-dedupe voorkomt dubbele zichtbaarheid.'
  };
  fs.writeFileSync(path.join(root, 'assets/imported-iptv-catalog.js'), `window.MEDIALENS_IMPORTED_IPTV = ${JSON.stringify(doc, null, 2)};\n`);
}

const { data, sources } = readCatalog(root);
const approvedSources = [...loadApprovedPack(), ...loadApprovedCandidates(), ...loadGeneratedImportedSources()];
const mergedResult = mergeSources(sources, approvedSources);
const report = {
  version: '37.0.1',
  dry_run: dryRun,
  approved_inputs: approvedSources.length,
  before_sources: sources.length,
  after_sources: mergedResult.merged.length,
  added_sources: mergedResult.added.length,
  updated_existing: mergedResult.updated.length,
  skipped_sources: mergedResult.skipped.length,
  added: mergedResult.added,
  updated: mergedResult.updated,
  skipped: mergedResult.skipped,
  rule: 'Approved IPTV sources are synced by id and stream URL; existing catalog rows are enriched, not duplicated.'
};

fs.mkdirSync(path.join(root, 'data/reports'), { recursive: true });
writeJson(path.join(root, 'data/reports/approved-iptv-sync.json'), report);
// Keep the previous report path as compatibility alias for older checks/tools.
writeJson(path.join(root, 'data/reports/approved-iptv-sync.latest.json'), report);

if (!dryRun) {
  const out = { ...data, version: VERSION, generatedAt: new Date().toISOString(), sources: mergedResult.merged };
  out.count = out.sources.length;
  for (const rel of CATALOG_TARGETS) writeJson(path.join(root, rel), out);
  fs.writeFileSync(path.join(root, 'assets/starter-catalog.js'), `window.MEDIALENS_CATALOG = ${JSON.stringify(out, null, 2)};\n`);
  writeImportedCatalog(approvedSources, report);
}

console.log(`Approved IPTV sync ${dryRun ? 'dry-run' : 'write'}: ${approvedSources.length} approved inputs, ${mergedResult.added.length} added, ${mergedResult.updated.length} updated, ${mergedResult.skipped.length} skipped, ${mergedResult.merged.length} total sources.`);
