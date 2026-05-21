import { readCatalog, writeJson, streamUrl, probeStatus, consumerLabel } from './lib/catalog-utils.mjs';
const root = process.argv[2] || '.';
const live = process.argv.includes('--live');
const { sources } = readCatalog(root);
const results = [];
for (const s of sources.filter(x => streamUrl(x))) {
  let status = probeStatus(s);
  let http_status = null;
  let content_type = null;
  if (live) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(streamUrl(s), { method: 'GET', signal: ctrl.signal, headers: { Range: 'bytes=0-1024' } });
      clearTimeout(timer);
      http_status = res.status;
      content_type = res.headers.get('content-type');
      status = res.ok ? 'ok' : (res.status === 403 || res.status === 451 ? 'geo_blocked' : 'timeout');
    } catch (err) {
      status = 'timeout';
    }
  }
  results.push({ source_id:s.id, checked_at:new Date().toISOString(), mode: live ? 'live' : 'offline', probe_status:status, http_status, content_type, playback_hint:consumerLabel({...s, source_quality:{...(s.source_quality||{}), probe_status:status}}) });
}
writeJson(`${root}/data/generated/probe-results.json`, { version:'28.4', live, count:results.length, results });
console.log(`Probe OK: ${results.length} direct sources (${live?'live':'offline'} mode).`);
