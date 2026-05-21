import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeJson } from './lib/catalog-utils.mjs';

const root = process.argv[2] || '.';
const VERSION = '1.0.0';

const asArray = v => Array.isArray(v) ? v : (v ? [v] : []);
const slug = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/\b(1080p|720p|576p|540p|480p|360p|uhd|fhd|hd|sd|4k|live|livestream)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'item';
const cleanTitle = value => String(value || '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/\b(1080p|720p|576p|540p|480p|360p|uhd|fhd|hd|sd|4k|live|livestream)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim() || String(value || 'Zender');
const directUrl = s => s?.streamUrl || s?.hlsUrl || s?.videoUrl || s?.embedUrl || s?.playerUrl || '';
const isDirect = s => !!directUrl(s);
const hasTag = (s, re) => asArray(s?.tags).some(t => re.test(String(t)));
const isIptv = s => !!(s?.delivery?.iptv || /iptv/i.test(String(s?.source_type || '')) || hasTag(s, /^(iptv|fast|public_iptv_channel)$/i));
const isSpecific = s => !!(s?.specific_channel || /channel|zender|public_iptv_channel/i.test(`${s?.source_type || ''} ${s?.type || ''}`) || hasTag(s, /^(channel|zender|public_iptv_channel)$/i));
const priority = s => (isDirect(s) ? 90 : 0) + (isIptv(s) ? 70 : 0) + (isSpecific(s) ? 50 : 0) + (s?.free !== false ? 8 : 0) + (s?.requiresAccount ? -8 : 4);

const aliases = new Map([
  ['nl','Nederland'], ['nederland','Nederland'], ['netherlands','Nederland'], ['the netherlands','Nederland'],
  ['be','België'], ['belgie','België'], ['belgië','België'], ['belgium','België'],
  ['de','Duitsland'], ['duitsland','Duitsland'], ['germany','Duitsland'], ['deutschland','Duitsland'],
  ['fr','Frankrijk'], ['frankrijk','Frankrijk'], ['france','Frankrijk'],
  ['gb','Verenigd Koninkrijk'], ['uk','Verenigd Koninkrijk'], ['united kingdom','Verenigd Koninkrijk'],
  ['us','Verenigde Staten'], ['usa','Verenigde Staten'], ['united states','Verenigde Staten'], ['united states of america','Verenigde Staten'],
  ['es','Spanje'], ['spain','Spanje'], ['spanje','Spanje'], ['it','Italië'], ['italy','Italië'], ['italië','Italië'], ['italie','Italië'],
  ['international','Internationaal'], ['worldwide','Internationaal']
]);
function canonicalCountry(value='') {
  const cleaned = String(value || '').trim();
  return aliases.get(cleaned.toLowerCase()) || cleaned;
}
function splitCountries(value='') {
  return String(value || '').split(/\s*\/\s*|,|;| en /i).map(x => canonicalCountry(x.trim())).filter(isCountryToken);
}
function isCountryToken(value='') {
  const key = slug(canonicalCountry(value));
  return !!key && !new Set(['unknown','unknown-or-variable','regional','subscription','na','n-a','null','undefined','true','false','web','iptv','direct-stream','official-site']).has(key) && !/^\d+$/.test(key);
}
function countryValues(s) {
  const values = [];
  const keys = ['country','origin_country','land','primary_markets','markets','availability_markets','available_countries','known_available_countries','countries'];
  const nested = ['availability_model','geo','distribution','delivery','import_metadata'];
  const add = v => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(add);
    if (typeof v === 'object') return [...keys, ...nested].forEach(k => add(v[k]));
    values.push(String(v));
  };
  keys.forEach(k => add(s?.[k]));
  nested.forEach(k => add(s?.[k]));
  return values.flatMap(splitCountries);
}
function normalizeUrl(raw='') {
  try { const u = new URL(String(raw).trim()); u.hash = ''; return u.href.replace(/[;,]+$/, ''); }
  catch { return String(raw || '').trim().replace(/[;,]+$/, ''); }
}
function mergeSources(base, imported) {
  const seenId = new Set(); const seenStream = new Set(); const out = [];
  for (const s of [...base, ...imported]) {
    if (!s) continue;
    const id = String(s.id || s.canonical_id || slug(s.title || s.name || 'source'));
    const stream = normalizeUrl(directUrl(s));
    if (seenId.has(id)) continue;
    if (stream && seenStream.has(stream)) continue;
    seenId.add(id); if (stream) seenStream.add(stream);
    out.push({ ...s, id, title: s.title || s.name || id });
  }
  return out;
}
function readImportedCatalog() {
  const file = path.join(root, 'assets/imported-iptv-catalog.js');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').replace(/^window\.MEDIALENS_IMPORTED_IPTV\s*=\s*/, '').replace(/;\s*$/, '');
  try { const doc = JSON.parse(text); return doc.sources || []; } catch { return []; }
}

const { sources: baseSources } = readCatalog(root);
const sources = mergeSources(baseSources, readImportedCatalog());
const channelMap = new Map();
const countryMap = new Map();
for (const source of sources) {
  if (!isSpecific(source) && !isDirect(source) && !isIptv(source)) continue;
  const countries = countryValues(source);
  const cList = countries.length ? countries : ['Internationaal'];
  for (const country of cList) {
    const title = cleanTitle(source.title || source.name || source.id);
    const key = `${slug(country)}|${slug(title)}`;
    if (!channelMap.has(key)) channelMap.set(key, { id: `channel-${key}`, key, title, country, routes: [], tags: new Set(), languages: new Set() });
    const ch = channelMap.get(key);
    const routeKind = isDirect(source) ? (isIptv(source) ? 'iptv' : 'direct') : 'official';
    const route = { source_id: source.id, title: source.title, kind: routeKind, direct: isDirect(source), iptv: isIptv(source), score: priority(source), url: source.url || source.officialUrl || '', streamUrl: directUrl(source) };
    const routeKey = normalizeUrl(route.streamUrl || route.url || route.source_id);
    if (!ch.routes.some(r => normalizeUrl(r.streamUrl || r.url || r.source_id) === routeKey)) ch.routes.push(route);
    asArray(source.tags).forEach(t => ch.tags.add(String(t)));
    asArray(source.language).forEach(l => ch.languages.add(String(l)));
    const ck = slug(country);
    if (!countryMap.has(ck)) countryMap.set(ck, { country, channels: new Set() });
    countryMap.get(ck).channels.add(key);
  }
}
const channels = [...channelMap.values()].map(ch => ({
  ...ch,
  tags: [...ch.tags],
  languages: [...ch.languages],
  routes: ch.routes.sort((a,b)=>b.score-a.score),
  primary_source_id: ch.routes.sort((a,b)=>b.score-a.score)[0]?.source_id || ''
})).sort((a,b)=>a.country.localeCompare(b.country) || a.title.localeCompare(b.title));
const countries = [...countryMap.values()].map(c => ({ country: c.country, channel_count: c.channels.size, route_count: [...c.channels].reduce((sum,k)=>sum+(channelMap.get(k)?.routes.length || 0),0), direct_channels: [...c.channels].filter(k => (channelMap.get(k)?.routes || []).some(r => r.direct)).length, iptv_channels: [...c.channels].filter(k => (channelMap.get(k)?.routes || []).some(r => r.iptv)).length })).sort((a,b)=>b.channel_count-a.channel_count || a.country.localeCompare(b.country));
const doc = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  source_count: sources.length,
  channel_count: channels.length,
  country_count: countries.length,
  route_count: channels.reduce((sum,ch)=>sum+ch.routes.length,0),
  direct_channel_count: channels.filter(ch => ch.routes.some(r => r.direct)).length,
  iptv_channel_count: channels.filter(ch => ch.routes.some(r => r.iptv)).length,
  countries,
  channels
};
writeJson(path.join(root, 'data/generated/watch-graph.json'), doc);
fs.writeFileSync(path.join(root, 'assets/watch-graph.js'), `window.MEDIALENS_WATCH_GRAPH = ${JSON.stringify(doc, null, 2)};\n`);
console.log(`Watch graph v${VERSION}: ${doc.channel_count} channels, ${doc.route_count} routes, ${doc.country_count} countries, ${doc.iptv_channel_count} IPTV channels.`);
