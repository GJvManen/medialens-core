import fs from 'node:fs';
import path from 'node:path';

export function readCatalog(root='.') {
  const candidates = [
    path.join(root, 'SOURCE_MANIFEST.json'),
    path.join(root, 'data', 'SOURCE_MANIFEST.json'),
    path.join(root, 'data', 'sources.json')
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const sources = Array.isArray(data) ? data : (data.sources || data.items || data.catalog || []);
      return { file, data, sources };
    }
  }
  throw new Error('No MediaLens catalog found. Expected SOURCE_MANIFEST.json or data/sources.json');
}

export function sourceId(s, i=0) { return String(s.id || s.canonical_id || s.title || s.name || `source-${i}`); }
export function titleOf(s) { return String(s.title || s.name || s.id || 'Untitled'); }
export function officialUrl(s) { return String(s.officialUrl || s.official_url || s.url || s.website || ''); }
export function streamUrl(s) { return String(s.streamUrl || s.stream_url || s.hlsUrl || s.videoUrl || s.embedUrl || s.playerUrl || ''); }
export function sourceKind(s) { return s?.source_quality?.source_kind || s.source_type || (streamUrl(s) ? 'direct_stream' : 'official_viewing_page'); }
export function probeStatus(s) { return s?.source_quality?.probe_status || (streamUrl(s) ? 'unknown' : 'not_applicable'); }
export function evidenceUrl(s) { return s?.source_quality?.evidence_url || s.evidence_url || officialUrl(s); }
export function availabilityScope(s) { return s?.availability_model?.availability_scope || s.availability || 'unknown'; }
export function isIptv(s) { return !!s?.delivery?.iptv || sourceKind(s).includes('iptv'); }
export function consumerLabel(s) {
  const probe = probeStatus(s);
  const hasStream = !!streamUrl(s);
  const scope = availabilityScope(s);
  if (hasStream && probe === 'ok') return 'Kijk direct';
  if (probe === 'geo_blocked') return 'Mogelijk niet beschikbaar in jouw regio';
  if (['cors_blocked', 'drm_required'].includes(probe)) return 'Open officiële site';
  if (hasStream && isIptv(s) && ['unknown', 'timeout'].includes(probe)) return 'Probeer IPTV-bron';
  if (hasStream && ['unknown', 'timeout'].includes(probe)) return scope === 'regional' ? 'Probeer af te spelen' : 'Probeer af te spelen';
  if (probe === 'dead') return 'Niet beschikbaar';
  return 'Open officiële site';
}
export function splitCountries(country='') { return String(country || 'Internationaal').split('/').map(x=>x.trim()).filter(Boolean); }
export function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
export function writeJson(file, value) { ensureDir(file); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
