import fs from 'node:fs';
import path from 'node:path';
import { readCatalog } from './lib/catalog-utils.mjs';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const registryPath = path.join(root, 'data/iptv/source-expansion-registry.json');
const reportPath = path.join(root, 'data/reports/source-discovery-plan.json');
if (!fs.existsSync(registryPath)) throw new Error('Missing source-expansion registry');

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const discovery = (registry.sources || []).filter(source => source.integration_role === 'discovery');
const { data, sources } = readCatalog(root);

const countryCounts = new Map();
for (const source of sources) {
  const country = String(source.country || source.origin_country || 'Internationaal').trim() || 'Internationaal';
  countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
}
const lowCoverage = Array.from(countryCounts.entries())
  .filter(([, count]) => count < 3)
  .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  .slice(0, 50)
  .map(([country, count]) => ({ country, current_sources: count }));

const report = {
  version: '1.0-source-discovery-plan',
  generated_at: new Date().toISOString(),
  catalog_version: data.version || null,
  catalog_sources: sources.length,
  discovery_source_count: discovery.length,
  consumer_publication_from_discovery: false,
  bulk_scraping: false,
  low_coverage_targets: lowCoverage,
  sources: discovery.map(source => ({
    id: source.id,
    provider: source.provider,
    tier: source.tier,
    priority: source.priority,
    official_url: source.officialUrl,
    evidence_url: source.evidence_url,
    import_mode: source.import_mode,
    consumer_visibility: source.consumer_visibility,
    respect_site_terms: source.respect_site_terms ?? true,
    operational_use: 'targeted_gap_discovery_only',
    promotion_path: [
      'identify specific coverage gap',
      'find candidate reference without bulk copying',
      'independently establish official broadcaster/source evidence',
      'register candidate in a controlled Tier A/B source or explicit evidence record',
      'dedupe and live-probe through standard gates',
      'approve and explicitly promote'
    ],
    prohibited: [
      'bulk scraping into MediaLens catalogue',
      'direct publication from discovery directory',
      'treating directory availability as rights evidence'
    ]
  }))
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Discovery plan registered: ${discovery.length} discovery-only sources, ${lowCoverage.length} low-coverage catalog targets, 0 direct publication paths.`);
