import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '.';
const opts = new Set(process.argv.slice(3));
const feedArg = process.argv.find(x => x.startsWith('--feed='))?.split('=')[1] || 'all';
const offline = opts.has('--offline');
const registryPath = path.join(root, 'data/iptv/fast-feed-registry.json');
if (!fs.existsSync(registryPath)) throw new Error('Missing data/iptv/fast-feed-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const feeds = registry.feeds.filter(f => feedArg === 'all' || f.id === feedArg);
if (!feeds.length) throw new Error(`No feeds matched ${feedArg}`);

for (const dir of ['data/candidates','data/reports','data/generated','assets']) fs.mkdirSync(path.join(root, dir), { recursive: true });

function readSources() {
  for (const file of ['SOURCE_MANIFEST.json','data/SOURCE_MANIFEST.json','data/sources.json']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const sources = Array.isArray(data) ? data : (data.sources || []);
    if (sources.length) return sources;
  }
  return [];
}
const existingSources = readSources();

function normalizeTitle(s='') {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/\b(1080p|720p|576p|540p|480p|360p|hd|sd|fhd|uhd|4k)\b/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'untitled';
}
function normalizeUrl(url='') {
  if (!url) return '';
  try { const u = new URL(String(url).trim()); u.hash = ''; return u.href.replace(/[;,]+$/,''); }
  catch { return String(url).trim().replace(/[;,]+$/,''); }
}
function slug(s='') { return normalizeTitle(s).slice(0,64) || 'live'; }
function parseAttrs(line='') { const attrs = {}; const re = /([\w-]+)="([^"]*)"/g; let m; while ((m = re.exec(line))) attrs[m[1]] = m[2]; return attrs; }
function unique(values=[]) { return Array.from(new Set(values.flatMap(v => Array.isArray(v) ? v : [v]).map(v => String(v || '').trim()).filter(Boolean))); }
function countryHintsFromAttrs(attrs={}, feed={}) {
  const raw = [];
  for (const key of ['tvg-country','country','tvg-language']) if (attrs[key]) raw.push(...String(attrs[key]).split(/[;,/|]/));
  const tvg = `${attrs['tvg-id'] || ''} ${attrs['channel-id'] || ''}`;
  const suffix = tvg.match(/\.([a-z]{2})(?:@|\b)/i)?.[1];
  if (suffix) raw.push(suffix.toLowerCase());
  raw.push(...(feed.market_hint || []));
  return unique(raw);
}
function parseVlcOptions(chunk='') {
  const headers = {};
  for (const line of String(chunk).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXTVLCOPT:')) continue;
    const opt = trimmed.slice('#EXTVLCOPT:'.length);
    const idx = opt.indexOf('=');
    if (idx === -1) continue;
    const key = opt.slice(0, idx).trim().toLowerCase();
    const value = opt.slice(idx + 1).trim();
    if (!value) continue;
    if (key === 'http-user-agent') headers['User-Agent'] = value;
    if (key === 'http-referrer' || key === 'http-referer') headers.Referer = value;
    if (key === 'http-origin') headers.Origin = value;
  }
  return headers;
}
function splitPipeHeaders(rawUrl='') {
  const [url, ...parts] = String(rawUrl).trim().split('|');
  const headers = {};
  const params = new URLSearchParams(parts.join('&'));
  for (const [k,v] of params.entries()) {
    if (/user-agent/i.test(k)) headers['User-Agent'] = v;
    if (/referer|referrer/i.test(k)) headers.Referer = v;
    if (/origin/i.test(k)) headers.Origin = v;
  }
  return { url, headers };
}
function parseM3U(text, feed) {
  const candidates = [];
  const chunks = String(text).split(/(?=#EXTINF:)/g);
  for (const chunk of chunks) {
    if (!chunk.includes('#EXTINF:')) continue;
    const ext = chunk.match(/#EXTINF:[^\n\r]*/)?.[0] || '';
    const attrs = parseAttrs(ext);
    const afterComma = ext.includes(',') ? ext.slice(ext.lastIndexOf(',') + 1).trim() : '';
    const urlLine = String(chunk).split(/\r?\n/).map(x=>x.trim()).find(x => /^https?:\/\//i.test(x));
    if (!urlLine) continue;
    const piped = splitPipeHeaders(urlLine);
    const streamUrl = normalizeUrl(piped.url);
    const request_headers = { ...parseVlcOptions(chunk), ...piped.headers };
    const title = attrs['tvg-name'] || afterComma || attrs['channel-id'] || attrs['tvg-id'] || 'Untitled live channel';
    const id = `${feed.id}-${slug(attrs['tvg-id'] || title)}`.slice(0,120);
    candidates.push({
      id,
      title,
      provider: feed.provider,
      source_feed_id: feed.id,
      source_feed_provider: feed.provider,
      source_feed_url: feed.url,
      streamUrl,
      request_headers,
      logo: attrs['tvg-logo'] || '',
      tvg_id: attrs['tvg-id'] || '',
      tvg_chno: attrs['tvg-chno'] || '',
      category: attrs['group-title'] || feed.category_hint?.[0] || 'Live TV',
      country_hint: countryHintsFromAttrs(attrs, feed),
      officialUrl: feed.officialUrl,
      evidence_url: feed.url,
      review_status: 'imported_safe_candidate',
      consumer_visible: true,
      import_mode: 'visible_after_duplicate_and_safety_gate',
      auto_publish: false,
      risk_level: feed.risk_level || 'medium',
      blocked_reason: null,
      duplicate_of: [],
      consumer_label_after_approval: 'Gecontroleerde importbron'
    });
  }
  return candidates;
}
function safeCandidate(c) {
  const hay = `${c.title} ${c.category} ${c.streamUrl}`.toLowerCase();
  if (/xxx|adult|porn|sex\b/.test(hay)) return { ...c, review_status: 'rejected', consumer_visible: false, blocked_reason: 'adult_or_nsfw' };
  if (/medialens test|example\.com|test public channel/.test(hay)) return { ...c, review_status: 'rejected', consumer_visible: false, blocked_reason: 'test_or_example_channel' };
  if (/premium|ppv|bein|sky sports|espn\+|ufc|nba league pass|nfl sunday/i.test(hay)) return { ...c, review_status: 'needs_rights_review', consumer_visible: false, blocked_reason: 'possible_premium_sports_or_paytv' };
  if (/^http:\/\//i.test(c.streamUrl)) return { ...c, requires_proxy: true, import_note: 'HTTP stream kept visible for the internal same-origin stream proxy; browser playback should use npm run serve:player.' };
  return c;
}
function makeExistingIndexes() {
  const ids = new Map(); const streams = new Map(); const titles = new Map();
  for (const s of existingSources) {
    if (s.id) ids.set(String(s.id), s);
    for (const key of ['streamUrl','hlsUrl','videoUrl','embedUrl','playerUrl']) { const u = normalizeUrl(s[key]); if (u && !streams.has(u)) streams.set(u, s); }
    const title = normalizeTitle(s.title || s.name || '');
    if (title && !titles.has(title)) titles.set(title, s);
  }
  return { ids, streams, titles };
}
function withDuplicateStatus(candidate, seen, existing = makeExistingIndexes()) {
  const c = { ...candidate, duplicate_of: [...(candidate.duplicate_of || [])] };
  const idHit = existing.ids.get(c.id);
  if (idHit) c.duplicate_of.push({ type: 'existing_id', id: idHit.id, title: idHit.title });
  const streamHit = existing.streams.get(normalizeUrl(c.streamUrl));
  if (streamHit) c.duplicate_of.push({ type: 'existing_stream_url', id: streamHit.id, title: streamHit.title });
  // Exact title-only hits are marked as possible duplicates but not blocked globally: international products can have different regional feeds with the same display name.
  const titleHit = existing.titles.get(normalizeTitle(c.title));
  if (titleHit && !c.duplicate_of.some(x => x.type.startsWith('existing_'))) c.possible_duplicate_of = [{ type: 'existing_title', id: titleHit.id, title: titleHit.title }];

  const importKeys = [
    ['import_id', c.id],
    ['import_stream_url', normalizeUrl(c.streamUrl)],
    ['import_title_provider', `${normalizeTitle(c.title)}|${normalizeTitle(c.provider)}`]
  ];
  for (const [type, key] of importKeys) {
    if (!key) continue;
    const hit = seen.get(key);
    if (hit) c.duplicate_of.push({ type, id: hit.id, title: hit.title, source_feed_id: hit.source_feed_id });
  }
  for (const [, key] of importKeys) if (key && !seen.has(key)) seen.set(key, c);

  if (c.duplicate_of.length) return { ...c, review_status: 'duplicate', consumer_visible: false, blocked_reason: c.blocked_reason || 'duplicate_candidate_or_existing_source' };
  return c;
}
function countryDisplay(hints=[]) {
  const map = { us:'Verenigde Staten', usa:'Verenigde Staten', united_states:'Verenigde Staten', ca:'Canada', mx:'Mexico', br:'Brazilië', ar:'Argentinië', cl:'Chili', co:'Colombia', pe:'Peru', fr:'Frankrijk', de:'Duitsland', at:'Oostenrijk', ch:'Zwitserland', gb:'Verenigd Koninkrijk', uk:'Verenigd Koninkrijk', ie:'Ierland', nl:'Nederland', be:'België', lu:'Luxemburg', es:'Spanje', pt:'Portugal', it:'Italië', se:'Zweden', no:'Noorwegen', dk:'Denemarken', fi:'Finland', pl:'Polen', cz:'Tsjechië', sk:'Slowakije', hu:'Hongarije', ro:'Roemenië', bg:'Bulgarije', gr:'Griekenland', tr:'Turkije', ru:'Rusland', ua:'Oekraïne', jp:'Japan', kr:'Zuid-Korea', cn:'China', in:'India', id:'Indonesië', au:'Australië', nz:'Nieuw-Zeeland', za:'Zuid-Afrika', ng:'Nigeria', ke:'Kenia', ma:'Marokko', eg:'Egypte', qa:'Qatar', ae:'Verenigde Arabische Emiraten', sa:'Saoedi-Arabië', international:'Internationaal', worldwide:'Internationaal' };
  const values = (hints || []).map(x => map[String(x).toLowerCase().replace(/\s+/g,'_')] || x).filter(Boolean);
  return values.length ? Array.from(new Set(values)).join(' / ') : 'Internationaal';
}
function categoryTags(category='') {
  const c = String(category || '').toLowerCase();
  const tags = [slug(category)];
  if (/movie|movies|film|films|cinema|classic/.test(c)) tags.push('film','movie','movies','cinema');
  if (/series|shows|tv show/.test(c)) tags.push('series','shows','tv-series');
  if (/entertainment|general|variety/.test(c)) tags.push('entertainment','general','variety');
  if (/news|nieuws/.test(c)) tags.push('news','nieuws');
  if (/kids|children|family|animation|anime/.test(c)) tags.push('kids','family','children','animation');
  if (/sport/.test(c)) tags.push('sport','sports');
  if (/documentary|docu|education|science|culture/.test(c)) tags.push('documentary','docu','education','science','culture');
  if (/music|concert|radio/.test(c)) tags.push('music','radio','concert');
  if (/lifestyle|cooking|food|home|outdoor|travel/.test(c)) tags.push('lifestyle','cooking','food','home','outdoor','travel');
  if (/business|finance|markets|shopping|shop/.test(c)) tags.push('business','finance','markets','shop');
  if (/weather|local|community|public|legislative|government/.test(c)) tags.push('weather','local','community','public','legislative','government');
  if (/religious|faith/.test(c)) tags.push('religious','faith');
  return Array.from(new Set(tags.filter(Boolean)));
}
function candidateToSource(c) {
  const country = countryDisplay(c.country_hint);
  const cat = c.category || 'Live TV';
  const provider = c.source_feed_provider || c.provider || 'IPTV feed';
  return {
    id: c.id,
    title: c.title,
    url: c.officialUrl || c.source_feed_url,
    description: `Gecontroleerde internationale IPTV/FAST-import via ${provider}. Beschikbaarheid kan per land verschillen.`,
    country,
    type: cat,
    tags: Array.from(new Set(['iptv','fast','imported_iptv','live','direct','free','no-account','international','world',...categoryTags(cat)])),
    language: [],
    free: true,
    requiresAccount: false,
    isLive: true,
    streamHealth: c.requires_proxy ? 'proxy-required-unprobed' : 'imported-visible-unprobed',
    playbackMode: c.requires_proxy ? 'internal-proxy-required' : 'direct-or-official',
    region: 'Internationaal',
    availability: 'unknown_or_variable',
    officialUrl: c.officialUrl || c.source_feed_url,
    streamUrl: c.streamUrl,
    canonical_id: c.id,
    source_type: 'public_iptv_channel',
    source_quality: {
      verification_status: 'public',
      source_kind: 'public_iptv_channel',
      last_checked_at: new Date().toISOString().slice(0,10),
      probe_status: 'unknown',
      confidence_score: 58,
      evidence_url: c.evidence_url || c.source_feed_url,
      notes: 'Visible after the import duplicate/safety gate. This is not a raw playlist dump; sources are shown as controlled imports with provider fallback.'
    },
    origin_country: country,
    primary_markets: c.country_hint || [],
    availability_model: {
      origin_country: country,
      primary_markets: c.country_hint || [],
      known_available_countries: [],
      availability_scope: 'international_or_variable',
      geo_restriction: 'unknown_or_variable',
      cross_border_policy: 'show_in_international_search_unless_probe_confirms_blocked',
      consumer_note: 'Beschikbaarheid kan per land verschillen; probeer af te spelen of open de provider.',
      known_restricted_countries: []
    },
    delivery: { web: true, direct_stream: true, iptv: true, iptv_review_status: 'imported_visible', import_feed_id: c.source_feed_id, request_headers: c.request_headers || {}, requires_proxy: !!c.requires_proxy },
    request_headers: c.request_headers || {},
    import_metadata: { source_feed_id: c.source_feed_id, provider, tvg_id: c.tvg_id || '', imported_as: 'consumer_visible_import' }
  };
}

function categorySummaryForSources(sources) {
  const map = new Map();
  for (const s of sources) {
    const cats = Array.isArray(s.tags) ? s.tags : [];
    for (const cat of cats) {
      if (!['iptv','fast','imported_iptv','live','direct','free','no-account','international','world'].includes(cat)) map.set(cat, (map.get(cat) || 0) + 1);
    }
  }
  return [...map.entries()].map(([category,count]) => ({ category, count })).sort((a,b)=>b.count-a.count || a.category.localeCompare(b.category)).slice(0, 60);
}
function providerSummaryForSources(sources) {
  const map = new Map();
  for (const s of sources) {
    const provider = s.import_metadata?.provider || 'IPTV feed';
    map.set(provider, (map.get(provider) || 0) + 1);
  }
  return [...map.entries()].map(([provider,count]) => ({ provider, count })).sort((a,b)=>b.count-a.count || a.provider.localeCompare(b.provider)).slice(0, 40);
}

function buildVisibleImportedCatalog() {
  const candidateDir = path.join(root, 'data/candidates');
  const seen = new Map();
  const existing = makeExistingIndexes();
  const allCandidates = [];
  for (const file of fs.readdirSync(candidateDir).filter(f => f.endsWith('.candidates.json')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(candidateDir, file), 'utf8'));
    for (const c of doc.candidates || []) allCandidates.push(c);
  }
  const rechecked = allCandidates.map(c => withDuplicateStatus(safeCandidate(c), seen, existing));
  const visibleCandidates = rechecked.filter(c => c.consumer_visible && ['imported_safe_candidate','approved','approved_iptv'].includes(c.review_status));
  const sources = visibleCandidates.map(candidateToSource);
  const report = {
    version: '37.0.1',
    generatedAt: new Date().toISOString(),
    source_count: sources.length,
    candidate_count: rechecked.length,
    duplicate_count: rechecked.filter(c => c.review_status === 'duplicate').length,
    hidden_count: rechecked.filter(c => !c.consumer_visible).length,
    sources,
    category_summary: categorySummaryForSources(sources),
    provider_summary: providerSummaryForSources(sources),
    consumer_note: 'Deze kanalen zijn na import zichtbaar als internationale gecontroleerde IPTV/FAST-bronnen. Ze worden runtime gededuped tegen de basiscatalogus en in de interface per categorie gefilterd.'
  };
  fs.writeFileSync(path.join(root, 'data/generated/imported-iptv-sources.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets/imported-iptv-catalog.js'), `window.MEDIALENS_IMPORTED_IPTV = ${JSON.stringify(report, null, 2)};\n`);
  return report;
}
function writeInterfaceRegistry(feedSummaries, visibleReport) {
  const candidateSummaryByFeed = new Map();
  const candidateDir = path.join(root, 'data/candidates');
  for (const file of fs.readdirSync(candidateDir).filter(f => f.endsWith('.candidates.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(candidateDir,file),'utf8'));
    const id = doc.feed?.id || file.replace(/\.candidates\.json$/,'');
    const candidates = doc.candidates || [];
    candidateSummaryByFeed.set(id, {
      candidate_count: candidates.length,
      duplicate_count: candidates.filter(c => c.review_status === 'duplicate').length,
      visible_count: candidates.filter(c => c.consumer_visible && !['duplicate','rejected','needs_rights_review'].includes(c.review_status)).length
    });
  }
  const out = {
    version: '37.0.1',
    generatedAt: new Date().toISOString(),
    feeds: registry.feeds.map(feed => {
      const summary = candidateSummaryByFeed.get(feed.id) || feedSummaries.find(x => x.id === feed.id) || {};
      return {
        id: feed.id,
        provider: feed.provider,
        officialUrl: feed.officialUrl,
        market_hint: feed.market_hint || [],
        category_hint: feed.category_hint || [],
        auto_publish: false,
        consumer_visibility: 'visible_imported_channels_after_duplicate_safety_gate',
        candidate_count: summary.candidate_count || 0,
        duplicate_count: summary.duplicate_count || 0,
        visible_count: summary.visible_count || 0,
        import_status: (summary.visible_count || 0) ? 'channels_visible_in_interface' : ((summary.candidate_count || 0) ? 'all_candidates_blocked_or_review' : 'ready_for_manual_import')
      };
    }),
    imported_source_count: visibleReport.source_count,
    consumer_note: 'Feeds en geïmporteerde kanalen zijn zichtbaar; duplicaten, NSFW, premium/pay-tv-risico en non-HTTPS worden niet consumenten-zichtbaar.'
  };
  fs.writeFileSync(path.join(root, 'data/generated/fast-feed-interface.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets/fast-feed-registry.js'), `window.MEDIALENS_FEED_REGISTRY = ${JSON.stringify(out, null, 2)};\n`);
  return out;
}

let total = 0;
const seenImportedThisRun = new Map();
const summaries = [];
for (const feed of feeds) {
  let text = '';
  if (offline) {
    const fixture = path.join(root, 'data/imports', `${feed.id}.sample.m3u`);
    if (!fs.existsSync(fixture)) {
      fs.writeFileSync(path.join(root, 'data/candidates', `${feed.id}.candidates.json`), JSON.stringify({ feed, imported_at: new Date().toISOString(), offline: true, candidate_count: 0, duplicate_count: 0, visible_count: 0, candidates: [], note: 'Offline mode: no sample file available. Run without --offline in an internet-enabled environment.' }, null, 2)+'\n');
      summaries.push({ id: feed.id, candidate_count: 0, duplicate_count: 0, visible_count: 0 });
      continue;
    }
    text = fs.readFileSync(fixture, 'utf8');
  } else {
    const res = await fetch(feed.url, { headers: { 'user-agent': 'MediaLens/37.0.1 watch-engine-feed-importer' } });
    if (!res.ok) throw new Error(`${feed.id}: fetch failed ${res.status}`);
    text = await res.text();
  }
  const existing = makeExistingIndexes();
  const candidates = parseM3U(text, feed).map(safeCandidate).map(c => withDuplicateStatus(c, seenImportedThisRun, existing));
  const duplicate_count = candidates.filter(c => c.review_status === 'duplicate').length;
  const visible_count = candidates.filter(c => c.consumer_visible && !['duplicate','rejected','needs_rights_review'].includes(c.review_status)).length;
  total += candidates.length;
  summaries.push({ id: feed.id, candidate_count: candidates.length, duplicate_count, visible_count });
  fs.writeFileSync(path.join(root, 'data/candidates', `${feed.id}.candidates.json`), JSON.stringify({ feed, imported_at: new Date().toISOString(), offline, candidate_count: candidates.length, duplicate_count, visible_count, auto_publish: false, published_count: 0, interface_publish_mode: 'runtime_imported_catalog', candidates }, null, 2)+'\n');
  console.log(`${feed.id}: ${candidates.length} candidates, ${visible_count} visible imports, ${duplicate_count} duplicates blocked`);
}
const visibleReport = buildVisibleImportedCatalog();
const feedInterface = writeInterfaceRegistry(summaries, visibleReport);
const report = {
  version: '37.0.1', imported_at: new Date().toISOString(), offline, feed_filter: feedArg,
  source_count_before_import: existingSources.length,
  candidate_count: total,
  visible_imported_source_count: visibleReport.source_count,
  duplicate_count: feedInterface.feeds.reduce((sum, x) => sum + x.duplicate_count, 0),
  auto_publish: false,
  published_count: 0,
  auto_publish_to_manifest: false,
  runtime_visible_in_consumer_interface: true,
  summaries: feedInterface.feeds.map(({id,provider,candidate_count,visible_count,duplicate_count,import_status}) => ({id,provider,candidate_count,visible_count,duplicate_count,import_status}))
};
fs.writeFileSync(path.join(root, 'data/reports/iptv-import-summary.json'), JSON.stringify(report, null, 2)+'\n');
// Keep old report path for compatibility with existing verifiers.
fs.writeFileSync(path.join(root, 'data/reports/iptv-import-summary.latest.json'), JSON.stringify(report, null, 2)+'\n');
console.log(`IPTV/FAST import complete: ${total} candidates this run, ${visibleReport.source_count} imported sources visible in the consumer interface, ${report.duplicate_count} duplicates blocked.`);
