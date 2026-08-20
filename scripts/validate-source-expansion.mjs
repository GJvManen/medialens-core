import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '.';
const registryPath = path.join(root, 'data/iptv/source-expansion-registry.json');
if (!fs.existsSync(registryPath)) throw new Error('Missing source-expansion registry');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const required = new Map([
  ['tdtchannels-tv', { role: 'controlled_public_catalogue', tier: 'B' }],
  ['m3upt', { role: 'controlled_public_catalogue', tier: 'B' }],
  ['freecasthub-public-iptv', { role: 'controlled_public_catalogue', tier: 'B' }],
  ['free-tv-iptv-recovery', { role: 'controlled_public_catalogue', tier: 'B' }],
  ['famelack-data', { role: 'controlled_public_catalogue', tier: 'B' }],
  ['iptv-nexus', { role: 'enrichment', tier: 'C' }],
  ['iptvcat', { role: 'discovery', tier: 'C' }],
  ['lyngsat-stream', { role: 'discovery', tier: 'C' }]
]);

const errors = [];
const byId = new Map((registry.sources || []).map(source => [source.id, source]));
for (const [id, expected] of required) {
  const source = byId.get(id);
  if (!source) {
    errors.push(`missing required source: ${id}`);
    continue;
  }
  if (source.integration_role !== expected.role) errors.push(`${id}: expected role ${expected.role}`);
  if (source.tier !== expected.tier) errors.push(`${id}: expected tier ${expected.tier}`);
  if (source.auto_publish !== false) errors.push(`${id}: auto_publish must be false`);
  if (!source.officialUrl) errors.push(`${id}: officialUrl is required`);
  if (!source.evidence_url) errors.push(`${id}: evidence_url is required`);
  if (source.integration_role === 'discovery' && !String(source.consumer_visibility).startsWith('never_')) errors.push(`${id}: discovery cannot be consumer-visible`);
  if (source.integration_role === 'enrichment' && source.import_mode !== 'metadata_enrichment_only') errors.push(`${id}: enrichment must remain metadata-only`);
}

for (const source of registry.sources || []) {
  if (source.auto_publish === true) errors.push(`${source.id}: source expansion cannot auto-publish`);
  if (source.tier === 'D' && source.integration_role !== 'discovery') errors.push(`${source.id}: tier D must be discovery-only`);
}

const requirements = new Set(registry.policy?.publication_requires || []);
for (const gate of ['dedupe', 'stream_probe', 'provenance_evidence', 'rights_or_official_source_evidence', 'approval']) {
  if (!requirements.has(gate)) errors.push(`missing publication gate: ${gate}`);
}

if (errors.length) {
  console.error('Source-expansion validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Source-expansion registry OK: ${registry.sources.length} sources; ${required.size} required integrations present; auto-publish disabled.`);
