import { readCatalog, sourceId, sourceKind, evidenceUrl, streamUrl, probeStatus, consumerLabel } from './lib/catalog-utils.mjs';
const root = process.argv[2] || '.';
const { sources } = readCatalog(root);
const allowedVerification = new Set(['official','public','inferred','rejected']);
const allowedKinds = new Set(['direct_stream','official_viewing_page','broadcaster_site','platform_route','metadata_only','official_iptv_playlist','public_iptv_channel']);
const allowedProbe = new Set(['ok','timeout','cors_blocked','geo_blocked','drm_required','dead','not_applicable','unknown']);
let errors = [];
let warnings = [];
for (const [i,s] of sources.entries()) {
  const id = sourceId(s,i);
  if (!id) errors.push(`source ${i} missing id`);
  if (!s.country) errors.push(`${id}: missing country`);
  const q = s.source_quality;
  if (!q) { errors.push(`${id}: missing source_quality`); continue; }
  if (!allowedVerification.has(q.verification_status)) errors.push(`${id}: invalid verification_status ${q.verification_status}`);
  if (!allowedKinds.has(q.source_kind)) errors.push(`${id}: invalid source_kind ${q.source_kind}`);
  if (!allowedProbe.has(q.probe_status)) errors.push(`${id}: invalid probe_status ${q.probe_status}`);
  if (typeof q.confidence_score !== 'number' || q.confidence_score < 0 || q.confidence_score > 100) errors.push(`${id}: invalid confidence_score`);
  if (!evidenceUrl(s)) errors.push(`${id}: missing evidence_url`);
  if (q.verification_status === 'rejected') errors.push(`${id}: rejected source cannot be in production catalog`);
  if (streamUrl(s) && !probeStatus(s)) warnings.push(`${id}: direct stream has no probe_status`);
  const label = consumerLabel(s);
  if (/probe_status|cors|drm|m3u8|http 403/i.test(label)) errors.push(`${id}: technical label leaked to consumer UI: ${label}`);
}
if (errors.length) throw new Error(`Source quality validation failed:\n${errors.join('\n')}`);
console.log(`Source quality OK: ${sources.length} sources, ${warnings.length} warnings.`);
