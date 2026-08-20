import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const live = args.includes('--live');
const resume = args.includes('--resume');
const retryFailed = args.includes('--retry-failed');
const feedArg = args.find(x => x.startsWith('--feed='))?.split('=')[1] || 'all';
const timeoutMs = Number(args.find(x => x.startsWith('--timeout='))?.split('=')[1] || 7000);
const concurrency = Math.max(1, Number(args.find(x => x.startsWith('--concurrency='))?.split('=')[1] || (live ? 12 : 1)));
const limit = Math.max(0, Number(args.find(x => x.startsWith('--limit='))?.split('=')[1] || 0));
const candidateDir = path.join(root, 'data/candidates');
const reportDir = path.join(root, 'data/reports');
const statePath = path.join(root, 'data/iptv/source-expansion-probe-state.json');
fs.mkdirSync(reportDir, { recursive: true });

function normUrl(value = '') {
  try {
    const u = new URL(String(value).trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
}

function stateKey(sourceFeedId, streamUrl) {
  return `${String(sourceFeedId || '').trim()}\n${normUrl(streamUrl)}`;
}

function candidateFiles() {
  if (!fs.existsSync(candidateDir)) return [];
  return fs.readdirSync(candidateDir)
    .filter(name => name.endsWith('.candidates.json'))
    .map(name => path.join(candidateDir, name))
    .filter(file => {
      try {
        const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (doc.source_expansion !== true) return false;
        if (feedArg === 'all') return true;
        if (doc.feed?.id === feedArg) return true;
        return (doc.candidates || []).some(candidate => candidate.source_feed_id === feedArg);
      } catch {
        return false;
      }
    });
}

async function probe(url, headers = {}) {
  if (!live) return { probe_status: 'fixture_ok', http_status: 200, content_type: 'application/vnd.apple.mpegurl', latency_ms: 0 };
  const ctrl = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Range: 'bytes=0-2048', 'user-agent': 'MediaLens/38.4 source-expansion-probe', ...headers }
    });
    const contentType = response.headers.get('content-type') || '';
    const status = response.ok ? 'ok' : (response.status === 403 || response.status === 451 ? 'geo_blocked' : 'http_error');
    return { probe_status: status, http_status: response.status, content_type: contentType, latency_ms: Date.now() - started };
  } catch (error) {
    return { probe_status: error?.name === 'AbortError' ? 'timeout' : 'network_error', http_status: null, content_type: '', latency_ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const acceptedStateStatuses = new Set(['ok', 'fixture_ok', 'geo_blocked', 'http_error', 'timeout', 'network_error']);
const failedStateStatuses = new Set(['geo_blocked', 'http_error', 'timeout', 'network_error']);
const stateDoc = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { records: [] };
const stateMap = new Map((stateDoc.records || []).map(record => [stateKey(record.source_feed_id, record.stream_url), record]));

function matchingState(candidate) {
  const record = stateMap.get(stateKey(candidate.source_feed_id, candidate.streamUrl));
  if (!record?.probe || !acceptedStateStatuses.has(record.probe.probe_status)) return null;
  const expectedMode = live ? 'live' : 'fixture';
  if (record.probe.mode !== expectedMode) return null;
  if (retryFailed && failedStateStatuses.has(record.probe.probe_status)) return null;
  return record;
}

function persistState(candidate, probeResult) {
  if (!acceptedStateStatuses.has(probeResult.probe_status)) return;
  const key = stateKey(candidate.source_feed_id, candidate.streamUrl);
  const existing = stateMap.get(key);
  stateMap.set(key, {
    source_feed_id: candidate.source_feed_id,
    candidate_id: candidate.id,
    stream_url: normUrl(candidate.streamUrl),
    title: candidate.title,
    probe: {
      probe_status: probeResult.probe_status,
      http_status: probeResult.http_status ?? null,
      content_type: probeResult.content_type || '',
      latency_ms: probeResult.latency_ms ?? null,
      checked_at: probeResult.checked_at,
      mode: probeResult.mode
    },
    last_review_status: candidate.review_status || null,
    blocked_reason: candidate.blocked_reason || null,
    captured_at: new Date().toISOString(),
    attempt_count: Math.max(1, Number(existing?.attempt_count || 0) + 1)
  });
}

const results = [];
let checked = 0;
let passed = 0;
let blocked = 0;
let probedBudget = 0;
let resumeSkipped = 0;
let deferred = 0;

for (const file of candidateFiles()) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  const queue = [];

  for (const candidate of doc.candidates || []) {
    if (feedArg !== 'all' && candidate.source_feed_id !== feedArg) continue;
    if (!candidate.streamUrl) continue;
    checked++;

    const prior = resume ? matchingState(candidate) : null;
    const hardBlocked = ['duplicate', 'rejected', 'needs_rights_review', 'needs_drm_official_fallback', 'needs_official_web_fallback'].includes(candidate.review_status);

    if (prior) {
      candidate.probe = { ...prior.probe };
      if (!hardBlocked) {
        const ok = ['ok', 'fixture_ok'].includes(prior.probe.probe_status);
        candidate.review_status = ok ? 'probe_passed_needs_approval' : 'probe_failed';
        candidate.blocked_reason = ok ? null : `stream_probe_${prior.probe.probe_status}`;
      }
      resumeSkipped++;
      changed = true;
      results.push({
        id: candidate.id,
        source_feed_id: candidate.source_feed_id,
        probe_status: prior.probe.probe_status,
        mode: prior.probe.mode,
        checked_at: prior.probe.checked_at,
        resume_skipped_existing_probe: true
      });
      continue;
    }

    if (hardBlocked) {
      if (!candidate.probe) {
        candidate.probe = { probe_status: 'skipped_policy_block', checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture' };
      }
      blocked++;
      changed = true;
      results.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, ...candidate.probe });
      continue;
    }

    if (limit > 0 && probedBudget >= limit) {
      candidate.probe = { probe_status: 'not_probed_batch_limit', checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture' };
      candidate.review_status = 'needs_probe';
      candidate.blocked_reason = 'stream_probe_batch_limit';
      blocked++;
      deferred++;
      changed = true;
      results.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, ...candidate.probe });
      continue;
    }

    probedBudget++;
    queue.push(candidate);
  }

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const outcomes = await Promise.all(batch.map(candidate => probe(normUrl(candidate.streamUrl), candidate.request_headers || {})));
    for (let i = 0; i < batch.length; i++) {
      const candidate = batch[i];
      const outcome = outcomes[i];
      candidate.probe = { ...outcome, checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture' };
      const ok = ['ok', 'fixture_ok'].includes(outcome.probe_status);
      candidate.review_status = ok ? 'probe_passed_needs_approval' : 'probe_failed';
      candidate.blocked_reason = ok ? null : `stream_probe_${outcome.probe_status}`;
      if (ok) passed++;
      else blocked++;
      persistState(candidate, candidate.probe);
      changed = true;
      results.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, ...candidate.probe });
    }
  }

  if (changed) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

const stateRecords = Array.from(stateMap.values()).sort((a, b) => {
  const s = String(a.source_feed_id).localeCompare(String(b.source_feed_id));
  return s || String(a.stream_url).localeCompare(String(b.stream_url));
});
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, JSON.stringify({
  version: '38.4-source-expansion-probe-state',
  generated_at: new Date().toISOString(),
  record_count: stateRecords.length,
  records: stateRecords
}, null, 2) + '\n');

const report = {
  version: '38.4-source-expansion-probe',
  generated_at: new Date().toISOString(),
  feed_filter: feedArg,
  live,
  resume,
  retry_failed: retryFailed,
  timeout_ms: timeoutMs,
  concurrency,
  limit,
  checked,
  actively_probed: probedBudget,
  resume_skipped: resumeSkipped,
  deferred_needs_probe: deferred,
  passed,
  blocked,
  persisted_probe_records: stateRecords.length,
  results
};
fs.writeFileSync(path.join(reportDir, 'source-expansion-probe-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Source-expansion probe complete: ${checked} checked, ${probedBudget} actively probed, ${resumeSkipped} resumed/skipped, ${passed} newly passed, ${blocked} blocked/deferred (${live ? 'live' : 'fixture'} mode, feed ${feedArg}, concurrency ${concurrency}).`);