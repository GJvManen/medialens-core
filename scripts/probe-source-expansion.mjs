import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const live = args.includes('--live');
const timeoutMs = Number(args.find(x => x.startsWith('--timeout='))?.split('=')[1] || 7000);
const concurrency = Math.max(1, Number(args.find(x => x.startsWith('--concurrency='))?.split('=')[1] || (live ? 12 : 1)));
const limit = Math.max(0, Number(args.find(x => x.startsWith('--limit='))?.split('=')[1] || 0));
const candidateDir = path.join(root, 'data/candidates');
const reportDir = path.join(root, 'data/reports');
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

function candidateFiles() {
  if (!fs.existsSync(candidateDir)) return [];
  return fs.readdirSync(candidateDir)
    .filter(name => name.endsWith('.candidates.json'))
    .map(name => path.join(candidateDir, name))
    .filter(file => {
      try {
        const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        return doc.source_expansion === true;
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
      headers: { Range: 'bytes=0-2048', 'user-agent': 'MediaLens/38.2 source-expansion-probe', ...headers }
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

const results = [];
let checked = 0;
let passed = 0;
let blocked = 0;
let probedBudget = 0;

for (const file of candidateFiles()) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  const queue = [];

  for (const candidate of doc.candidates || []) {
    if (!candidate.streamUrl) continue;
    checked++;
    const hardBlocked = ['duplicate', 'rejected', 'needs_rights_review', 'needs_drm_official_fallback'].includes(candidate.review_status);
    if (hardBlocked) {
      candidate.probe = { probe_status: 'skipped_policy_block', checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture' };
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
      changed = true;
      results.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, ...candidate.probe });
    }
  }

  if (changed) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

const report = {
  version: '38.2-source-expansion-probe',
  generated_at: new Date().toISOString(),
  live,
  timeout_ms: timeoutMs,
  concurrency,
  limit,
  checked,
  actively_probed: probedBudget,
  passed,
  blocked,
  results
};
fs.writeFileSync(path.join(reportDir, 'source-expansion-probe-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Source-expansion probe complete: ${checked} checked, ${probedBudget} actively probed, ${passed} passed, ${blocked} blocked (${live ? 'live' : 'fixture'} mode, concurrency ${concurrency}).`);
