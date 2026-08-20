import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const candidateDir = path.join(root, 'data/candidates');
const statePath = path.join(root, 'data/iptv/source-expansion-probe-state.json');

function normUrl(value = '') {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
}

function keyOf(sourceFeedId, streamUrl) {
  return `${String(sourceFeedId || '').trim()}\n${normUrl(streamUrl)}`;
}

const acceptedStatuses = new Set(['ok', 'fixture_ok', 'geo_blocked', 'http_error', 'timeout', 'network_error']);
const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { records: [] };
const byKey = new Map((previous.records || []).map(record => [keyOf(record.source_feed_id, record.stream_url), record]));
let discovered = 0;
let preserved = byKey.size;

if (fs.existsSync(candidateDir)) {
  for (const filename of fs.readdirSync(candidateDir).filter(name => name.endsWith('.candidates.json'))) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(candidateDir, filename), 'utf8'));
    } catch {
      continue;
    }
    if (doc.source_expansion !== true) continue;
    for (const candidate of doc.candidates || []) {
      const probe = candidate.probe;
      if (!candidate.streamUrl || !probe || !acceptedStatuses.has(probe.probe_status)) continue;
      const key = keyOf(candidate.source_feed_id, candidate.streamUrl);
      const existing = byKey.get(key);
      const checkedAt = probe.checked_at || new Date().toISOString();
      const record = {
        source_feed_id: candidate.source_feed_id,
        candidate_id: candidate.id,
        stream_url: normUrl(candidate.streamUrl),
        title: candidate.title,
        probe: {
          probe_status: probe.probe_status,
          http_status: probe.http_status ?? null,
          content_type: probe.content_type || '',
          latency_ms: probe.latency_ms ?? null,
          checked_at: checkedAt,
          mode: probe.mode || 'unknown'
        },
        last_review_status: candidate.review_status || null,
        blocked_reason: candidate.blocked_reason || null,
        captured_at: new Date().toISOString(),
        attempt_count: Math.max(1, Number(existing?.attempt_count || 0) + (existing?.probe?.checked_at === checkedAt ? 0 : 1))
      };
      if (!existing) discovered++;
      byKey.set(key, record);
    }
  }
}

const records = Array.from(byKey.values()).sort((a, b) => {
  const s = String(a.source_feed_id).localeCompare(String(b.source_feed_id));
  return s || String(a.stream_url).localeCompare(String(b.stream_url));
});
const state = {
  version: '38.3-source-expansion-probe-state',
  generated_at: new Date().toISOString(),
  record_count: records.length,
  terminal_probe_statuses: Array.from(acceptedStatuses),
  records
};
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log(`Source-expansion probe state snapshot: ${records.length} records (${discovered} new, ${preserved} previously persisted).`);
