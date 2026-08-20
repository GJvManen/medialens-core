import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const args = process.argv.slice(2);
const allowFixture = args.includes('--allow-fixture');
const feedArg = args.find(x => x.startsWith('--feed='))?.split('=')[1] || 'all';
const candidateDir = path.join(root, 'data/candidates');
const registryPath = path.join(root, 'data/iptv/source-expansion-registry.json');
const reportDir = path.join(root, 'data/reports');
fs.mkdirSync(reportDir, { recursive: true });

if (!fs.existsSync(registryPath)) throw new Error('Missing source-expansion registry');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const byId = new Map((registry.sources || []).map(source => [source.id, source]));

function files() {
  if (!fs.existsSync(candidateDir)) return [];
  return fs.readdirSync(candidateDir).filter(name => name.endsWith('.candidates.json')).map(name => path.join(candidateDir, name));
}

const decisions = [];
let considered = 0;
let approved = 0;
let held = 0;

for (const file of files()) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.source_expansion !== true) continue;
  if (feedArg !== 'all' && doc.feed?.id && doc.feed.id !== feedArg) continue;
  let changed = false;
  for (const candidate of doc.candidates || []) {
    if (feedArg !== 'all' && candidate.source_feed_id !== feedArg) continue;
    considered++;
    const source = byId.get(candidate.source_feed_id);
    const reasons = [];
    if (!source) reasons.push('unregistered_source');
    if (source && !(source.tier === 'B' && source.integration_role === 'controlled_public_catalogue')) reasons.push('not_controlled_tier_b');
    if (!candidate.streamUrl) reasons.push('missing_stream_url');
    if (!candidate.evidence_url && !source?.evidence_url) reasons.push('missing_provenance_evidence');
    if (!source?.rights_basis) reasons.push('missing_rights_basis');
    if (candidate.duplicate_of?.length) reasons.push('duplicate');
    if (candidate.blocked_reason) reasons.push(candidate.blocked_reason);
    if (!candidate.probe) reasons.push('missing_probe');
    const probeOk = candidate.probe?.probe_status === 'ok' && candidate.probe?.mode === 'live';
    const fixtureOk = allowFixture && candidate.probe?.probe_status === 'fixture_ok' && candidate.probe?.mode === 'fixture';
    if (!probeOk && !fixtureOk) reasons.push('probe_not_accepted');
    if (!['probe_passed_needs_approval', 'approved', 'approved_iptv'].includes(candidate.review_status)) reasons.push(`review_status_${candidate.review_status || 'missing'}`);

    const uniqueReasons = Array.from(new Set(reasons.filter(Boolean)));
    if (uniqueReasons.length === 0) {
      candidate.review_status = 'approved_iptv';
      candidate.consumer_visible = false;
      candidate.auto_publish = false;
      candidate.approval = {
        status: 'approved',
        mode: allowFixture ? 'fixture_policy_gate' : 'live_policy_gate',
        approved_at: new Date().toISOString(),
        source_tier: source.tier,
        evidence_url: candidate.evidence_url || source.evidence_url,
        rights_basis: source.rights_basis,
        probe_status: candidate.probe.probe_status
      };
      approved++;
      changed = true;
      decisions.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, decision: 'approved', reasons: [] });
    } else {
      held++;
      candidate.approval = {
        status: 'held',
        evaluated_at: new Date().toISOString(),
        reasons: uniqueReasons
      };
      changed = true;
      decisions.push({ id: candidate.id, source_feed_id: candidate.source_feed_id, decision: 'held', reasons: uniqueReasons });
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

const report = {
  version: '38.4-source-expansion-approval',
  generated_at: new Date().toISOString(),
  feed_filter: feedArg,
  allow_fixture: allowFixture,
  considered,
  approved,
  held,
  publication_note: 'Approval does not publish. Promotion is a separate explicit write step.',
  decisions
};
fs.writeFileSync(path.join(reportDir, 'source-expansion-approval-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Source-expansion approval complete: ${approved} approved, ${held} held, ${considered} considered (feed ${feedArg}).`);