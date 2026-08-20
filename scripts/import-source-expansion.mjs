import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const feedArg = args.find(x => x.startsWith('--feed='))?.split('=')[1] || 'all';
const allCountries = args.includes('--all-countries');
const maxCountries = Number(args.find(x => x.startsWith('--max-countries='))?.split('=')[1] || (allCountries ? 0 : 25));
const registryPath = path.join(root, 'data/iptv/source-expansion-registry.json');

if (!fs.existsSync(registryPath)) throw new Error('Missing data/iptv/source-expansion-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const sources = registry.sources.filter(s => feedArg === 'all' || s.id === feedArg);
if (!sources.length) throw new Error(`No source-expansion feeds matched ${feedArg}`);

for (const dir of ['data/candidates', 'data/reports']) fs.mkdirSync(path.join(root, dir), { recursive: true });

const unique = values => Array.from(new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean)));
const normUrl = value => {
  try {
    const u = new URL(String(value || '').trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
};
const slug = value => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  .replace(/\b(1080p|720p|576p|540p|480p|360p|hd|sd|fhd|uhd|4k)\b/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 90) || 'source';

function countryFromTvgId(value = '') {
  const match = String(value || '').trim().match(/\.([a-z]{2})$/i);
  if (!match) return '';
  const code = match[1].toUpperCase();
  return code === 'UK' ? 'GB' : code;
}

function readExistingSources() {
  for (const rel of ['SOURCE_MANIFEST.json', 'data/SOURCE_MANIFEST.json', 'data/sources.json']) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(doc) ? doc : (doc.sources || []);
    if (list.length) return list;
  }
  return [];
}

const existingSources = readExistingSources();
const existingStreams = new Map();
for (const source of existingSources) {
  for (const key of ['streamUrl', 'hlsUrl', 'videoUrl', 'embedUrl', 'playerUrl']) {
    const url = normUrl(source[key]);
    if (url && !existingStreams.has(url)) existingStreams.set(url, source);
  }
}
const seenStreams = new Map();

function parseAttrs(line = '') {
  const attrs = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(line))) attrs[match[1]] = match[2];
  return attrs;
}

function splitPipeHeaders(rawUrl = '') {
  const [url, ...parts] = String(rawUrl).trim().split('|');
  const headers = {};
  const params = new URLSearchParams(parts.join('&'));
  for (const [key, value] of params.entries()) {
    if (/user-agent/i.test(key)) headers['User-Agent'] = value;
    if (/referer|referrer/i.test(key)) headers.Referer = value;
    if (/origin/i.test(key)) headers.Origin = value;
  }
  return { url: normUrl(url), headers };
}

function parseVlcHeaders(chunk = '') {
  const headers = {};
  for (const line of String(chunk).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXTVLCOPT:')) continue;
    const opt = trimmed.slice('#EXTVLCOPT:'.length);
    const idx = opt.indexOf('=');
    if (idx < 0) continue;
    const key = opt.slice(0, idx).trim().toLowerCase();
    const value = opt.slice(idx + 1).replace(/^"|"$/g, '').trim();
    if (key === 'http-user-agent') headers['User-Agent'] = value;
    if (key === 'http-referrer' || key === 'http-referer') headers.Referer = value;
    if (key === 'http-origin') headers.Origin = value;
  }
  return headers;
}

function baseCandidate(source, title, streamUrl, extra = {}) {
  return {
    id: `${source.id}-${slug(extra.tvg_id || title)}-${slug(streamUrl).slice(-18)}`.slice(0, 120),
    title,
    provider: source.provider,
    source_feed_id: source.id,
    source_feed_provider: source.provider,
    source_feed_url: source.url || source.officialUrl,
    officialUrl: source.officialUrl,
    evidence_url: source.evidence_url || source.officialUrl,
    epg_url: source.epg_url || '',
    streamUrl: normUrl(streamUrl),
    country_hint: unique(extra.country_hint || source.market_hint || []),
    language: unique(extra.language || []),
    category: extra.category || source.category_hint?.[0] || 'Live TV',
    logo: extra.logo || '',
    tvg_id: extra.tvg_id || '',
    request_headers: extra.request_headers || {},
    is_geo_blocked_hint: extra.is_geo_blocked_hint ?? null,
    source_tier: source.tier,
    integration_role: source.integration_role,
    review_status: 'needs_review',
    consumer_visible: false,
    auto_publish: false,
    approval_requirements: registry.policy.publication_requires,
    blocked_reason: null,
    duplicate_of: [],
    import_metadata: {
      importer: 'source-expansion',
      registry_version: registry.version,
      source_license: source.license || null
    }
  };
}

function applySafety(candidate, chunk = '') {
  const c = { ...candidate };
  const hay = `${c.title} ${c.category} ${c.streamUrl}`.toLowerCase();
  if (/xxx|adult|porn|sex\b/.test(hay)) {
    c.review_status = 'rejected';
    c.blocked_reason = 'adult_or_nsfw';
    return c;
  }
  if (/premium|ppv|league pass|sunday ticket|pay[- ]?tv/.test(hay)) {
    c.review_status = 'needs_rights_review';
    c.blocked_reason = 'possible_premium_or_paytv';
  }
  const drm = /#KODIPROP:|license_key|widevine|playready|\.mpd(?:$|\?)/i.test(`${chunk}\n${c.streamUrl}`);
  if (drm) {
    c.review_status = 'needs_drm_official_fallback';
    c.blocked_reason = 'drm_or_dash_requires_supported_official_fallback';
    c.direct_playback_allowed = false;
  }
  const webOnly = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|vimeo\.com)(?:\/|$)/i.test(c.streamUrl);
  if (webOnly) {
    c.review_status = 'needs_official_web_fallback';
    c.blocked_reason = 'web_page_requires_official_embed_fallback';
    c.direct_playback_allowed = false;
    c.official_page_url = c.streamUrl;
  }
  if (/^http:\/\//i.test(c.streamUrl)) c.requires_proxy = true;
  return c;
}

function applyDuplicateGate(candidate) {
  const c = { ...candidate, duplicate_of: [...(candidate.duplicate_of || [])] };
  const stream = normUrl(c.streamUrl);
  const existing = existingStreams.get(stream);
  if (existing) c.duplicate_of.push({ type: 'existing_stream_url', id: existing.id, title: existing.title });
  const seen = seenStreams.get(stream);
  if (seen) c.duplicate_of.push({ type: 'source_expansion_stream_url', id: seen.id, title: seen.title, source_feed_id: seen.source_feed_id });
  if (stream && !seen) seenStreams.set(stream, c);
  if (c.duplicate_of.length) {
    c.review_status = 'duplicate';
    c.blocked_reason = c.blocked_reason || 'duplicate_candidate_or_existing_source';
  }
  return c;
}

function parseM3U(text, source) {
  const candidates = [];
  for (const chunk of String(text).split(/(?=#EXTINF:)/g)) {
    if (!chunk.includes('#EXTINF:')) continue;
    const ext = chunk.match(/#EXTINF:[^\n\r]*/)?.[0] || '';
    const attrs = parseAttrs(ext);
    const title = attrs['tvg-name'] || (ext.includes(',') ? ext.slice(ext.lastIndexOf(',') + 1).trim() : '') || attrs['tvg-id'] || 'Untitled channel';
    const urlLine = chunk.split(/\r?\n/).map(x => x.trim()).find(x => /^https?:\/\//i.test(x));
    if (!urlLine) continue;
    const piped = splitPipeHeaders(urlLine);
    const explicitCountries = String(attrs['tvg-country'] || '').split(/[;,/|]/);
    const inferredCountry = countryFromTvgId(attrs['tvg-id'] || '');
    const country = unique([...explicitCountries, inferredCountry, ...(source.market_hint || [])]);
    const language = unique(String(attrs['tvg-language'] || '').split(/[;,/|]/));
    const candidate = baseCandidate(source, title, piped.url, {
      tvg_id: attrs['tvg-id'] || '',
      logo: attrs['tvg-logo'] || '',
      category: attrs['group-title'] || source.category_hint?.[0] || 'Live TV',
      country_hint: country,
      language,
      request_headers: { ...parseVlcHeaders(chunk), ...piped.headers }
    });
    candidates.push(applyDuplicateGate(applySafety(candidate, chunk)));
  }
  return candidates;
}

function parseFamelackCountry(doc, source, countryCode) {
  const candidates = [];
  for (const channel of Array.isArray(doc) ? doc : []) {
    const streams = channel?.sources?.streams || [];
    for (const stream of streams) {
      const candidate = baseCandidate(source, channel.name || channel.nanoid || 'Untitled channel', stream, {
        tvg_id: channel.nanoid || '',
        country_hint: [channel.country || countryCode],
        language: channel.languages || [],
        is_geo_blocked_hint: channel.isGeoBlocked ?? null,
        category: 'Live TV'
      });
      candidates.push(applyDuplicateGate(applySafety(candidate)));
    }
  }
  return candidates;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MediaLens/38.4 source-expansion importer' } });
  if (!response.ok) throw new Error(`fetch failed ${response.status} for ${url}`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function writeCandidateFile(source, candidates, extra = {}) {
  const counts = {
    candidate_count: candidates.length,
    duplicate_count: candidates.filter(c => c.review_status === 'duplicate').length,
    rejected_count: candidates.filter(c => c.review_status === 'rejected').length,
    drm_review_count: candidates.filter(c => c.review_status === 'needs_drm_official_fallback').length,
    web_fallback_count: candidates.filter(c => c.review_status === 'needs_official_web_fallback').length,
    consumer_visible_count: candidates.filter(c => c.consumer_visible).length
  };
  const doc = {
    feed: source,
    imported_at: new Date().toISOString(),
    offline,
    source_expansion: true,
    auto_publish: false,
    consumer_visibility: 'review_queue_only',
    ...counts,
    ...extra,
    candidates
  };
  fs.writeFileSync(path.join(root, 'data/candidates', `${source.id}.candidates.json`), JSON.stringify(doc, null, 2) + '\n');
  return counts;
}

async function loadM3U(source) {
  if (!offline) return fetchText(source.url);
  const fixture = path.join(root, 'data/imports', `${source.id}.sample.m3u`);
  if (!fs.existsSync(fixture)) return null;
  return fs.readFileSync(fixture, 'utf8');
}

async function importM3U(source) {
  const text = await loadM3U(source);
  if (text == null) return writeCandidateFile(source, [], { note: 'Offline mode: no source-expansion sample fixture available.' });
  return writeCandidateFile(source, parseM3U(text, source));
}

async function importFamelack(source) {
  if (offline) {
    const fixture = path.join(root, 'data/imports', `${source.id}.sample.json`);
    if (!fs.existsSync(fixture)) return writeCandidateFile(source, [], { note: 'Offline mode: no Famelack sample fixture available.' });
    const doc = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    return writeCandidateFile(source, parseFamelackCountry(doc, source, 'NL'), { country_files_processed: 1 });
  }
  const index = await fetchJson(source.country_index_url);
  let files = index.filter(x => x?.type === 'file' && /\.json$/i.test(x.name));
  if (maxCountries > 0) files = files.slice(0, maxCountries);
  const all = [];
  for (const file of files) {
    const country = file.name.replace(/\.json$/i, '');
    const url = source.raw_country_url_template.replace('{country}', country);
    const doc = await fetchJson(url);
    all.push(...parseFamelackCountry(doc, source, country));
  }
  return writeCandidateFile(source, all, { country_files_processed: files.length, all_countries_requested: allCountries });
}

async function processEnrichment(source) {
  const report = {
    source_id: source.id,
    provider: source.provider,
    integration_role: 'enrichment',
    fetched_at: new Date().toISOString(),
    offline,
    consumer_visible: false,
    auto_publish: false,
    note: 'Enrichment metadata is never imported as a second channel catalogue.'
  };
  if (!offline && source.metadata_url) report.metadata = await fetchJson(source.metadata_url);
  fs.writeFileSync(path.join(root, 'data/reports', `${source.id}-enrichment-index.json`), JSON.stringify(report, null, 2) + '\n');
  return writeCandidateFile(source, [], { note: report.note });
}

function registerDiscovery(source) {
  return writeCandidateFile(source, [], {
    note: 'Discovery source registered only. No bulk scraping, copying or consumer publication is performed by this importer.'
  });
}

const summary = [];
for (const source of sources) {
  let counts;
  if (source.feed_type === 'm3u') counts = await importM3U(source);
  else if (source.feed_type === 'json_country_dataset') counts = await importFamelack(source);
  else if (source.integration_role === 'enrichment') counts = await processEnrichment(source);
  else counts = registerDiscovery(source);
  summary.push({ id: source.id, role: source.integration_role, ...counts });
  console.log(`${source.id}: ${counts.candidate_count} candidates; ${counts.consumer_visible_count} consumer-visible`);
}

const report = {
  version: registry.version,
  generated_at: new Date().toISOString(),
  offline,
  feed_filter: feedArg,
  source_count: summary.length,
  candidate_count: summary.reduce((n, x) => n + x.candidate_count, 0),
  consumer_visible_count: summary.reduce((n, x) => n + x.consumer_visible_count, 0),
  rule: 'Source expansion creates review candidates only; consumer publication requires the standard MediaLens approval gates.',
  sources: summary
};
fs.writeFileSync(path.join(root, 'data/reports/source-expansion-import-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Source expansion complete: ${report.candidate_count} candidates; ${report.consumer_visible_count} consumer-visible.`);