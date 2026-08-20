import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const candidatePath = path.join(root, 'data/candidates/famelack-data.candidates.json');
const allowlistPath = path.join(root, 'data/iptv/famelack-official-evidence.json');
const reportPath = path.join(root, 'data/reports/famelack-provenance-report.json');

if (!fs.existsSync(candidatePath)) throw new Error('Missing Famelack candidate file. Run import-source-expansion first.');
if (!fs.existsSync(allowlistPath)) throw new Error('Missing Famelack official-evidence allowlist.');

const doc = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

function normUrl(value = '') {
  try {
    const u = new URL(String(value || '').trim());
    u.hash = '';
    return u.href.replace(/[;,]+$/, '');
  } catch {
    return String(value || '').trim().replace(/[;,]+$/, '');
  }
}

function evidenceKey(channelId, streamUrl) {
  return `${String(channelId || '').trim()}\n${normUrl(streamUrl)}`;
}

const evidence = new Map();
for (const record of allowlist.records || []) {
  if (!record?.channel_id || !record?.stream_url || !record?.evidence_url || !record?.rights_basis) continue;
  evidence.set(evidenceKey(record.channel_id, record.stream_url), record);
}

let considered = 0;
let independentlyVerified = 0;
let heldForEvidence = 0;
let alreadyPolicyBlocked = 0;
let duplicate = 0;

for (const candidate of doc.candidates || []) {
  if (candidate.source_feed_id !== 'famelack-data') continue;
  considered++;
  const record = evidence.get(evidenceKey(candidate.tvg_id, candidate.streamUrl));
  if (record) {
    independentlyVerified++;
    candidate.officialUrl = record.official_url || record.evidence_url;
    candidate.evidence_url = record.evidence_url;
    candidate.rights_basis = record.rights_basis;
    candidate.provenance_status = 'independent_official_source_evidence_verified';
    candidate.provenance = {
      evidence_allowlist_version: allowlist.version,
      official_url: record.official_url || record.evidence_url,
      evidence_url: record.evidence_url,
      verified_at: record.verified_at || null,
      verifier_note: record.notes || null
    };
    if (!candidate.duplicate_of?.length && !['rejected', 'needs_drm_official_fallback', 'needs_official_web_fallback', 'needs_rights_review'].includes(candidate.review_status)) {
      candidate.review_status = 'needs_review';
      candidate.blocked_reason = null;
      candidate.direct_playback_allowed = candidate.direct_playback_allowed !== false;
    }
    continue;
  }

  candidate.provenance_status = 'dataset_only_no_independent_broadcaster_evidence';
  candidate.dataset_evidence_url = candidate.evidence_url || doc.feed?.evidence_url || doc.feed?.officialUrl || '';
  candidate.evidence_url = '';
  candidate.rights_basis = null;
  candidate.direct_playback_allowed = false;

  if (candidate.duplicate_of?.length || candidate.review_status === 'duplicate') {
    duplicate++;
    continue;
  }

  if (['rejected', 'needs_drm_official_fallback', 'needs_official_web_fallback'].includes(candidate.review_status)) {
    alreadyPolicyBlocked++;
    continue;
  }

  candidate.review_status = 'needs_rights_review';
  candidate.blocked_reason = 'dataset_license_not_stream_rights_evidence';
  heldForEvidence++;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(candidatePath, JSON.stringify(doc, null, 2) + '\n');
const report = {
  version: '1.0-famelack-provenance-gate',
  generated_at: new Date().toISOString(),
  feed: 'famelack-data',
  allowlist_version: allowlist.version,
  allowlist_records: (allowlist.records || []).length,
  considered,
  independently_verified: independentlyVerified,
  held_for_independent_evidence: heldForEvidence,
  already_policy_blocked: alreadyPolicyBlocked,
  duplicates: duplicate,
  consumer_visible: (doc.candidates || []).filter(c => c.consumer_visible).length,
  rule: 'The MIT dataset license permits reuse of the dataset but is not treated as evidence that MediaLens may publish each underlying stream. Only exact allowlisted records with independent broadcaster evidence may advance.'
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Famelack provenance gate: ${considered} considered, ${independentlyVerified} independently verified, ${heldForEvidence} held for official evidence, ${duplicate} duplicates, ${alreadyPolicyBlocked} otherwise policy-blocked.`);
