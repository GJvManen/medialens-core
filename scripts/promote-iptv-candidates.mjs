import fs from 'node:fs';
import path from 'node:path';
import { readCatalog, writeJson } from './lib/catalog-utils.mjs';

const root = process.argv[2] || '.';
const opts = new Set(process.argv.slice(3));
const dryRun = opts.has('--dry-run') || !opts.has('--write');
const candidateDir = path.join(root, 'data/candidates');
const { data, sources } = readCatalog(root);
function slug(s='') { return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90); }
function normUrl(url='') { try { const u = new URL(String(url).trim()); u.hash=''; return u.href.replace(/[;,]+$/,''); } catch { return String(url||'').trim().replace(/[;,]+$/,''); } }
const ids = new Set(sources.map(s => String(s.id || '')));
const streams = new Map();
const titles = new Map();
for (const s of sources) {
  const title = slug(s.title || s.name || ''); if (title && !titles.has(title)) titles.set(title, s.id);
  for (const key of ['streamUrl','hlsUrl','videoUrl','embedUrl','playerUrl']) { const u=normUrl(s[key]); if (u && !streams.has(u)) streams.set(u, s.id); }
}
let loaded=0, approved=0, blocked=0; const blockedItems=[]; const additions=[];
if (fs.existsSync(candidateDir)) {
  for (const file of fs.readdirSync(candidateDir).filter(f=>f.endsWith('.candidates.json'))) {
    const doc=JSON.parse(fs.readFileSync(path.join(candidateDir,file),'utf8'));
    for (const c of doc.candidates || []) {
      loaded++;
      if (!['approved','approved_iptv'].includes(c.review_status)) continue;
      const dup=[];
      if (ids.has(c.id)) dup.push('id');
      if (streams.has(normUrl(c.streamUrl))) dup.push('streamUrl');
      if (titles.has(slug(c.title))) dup.push('title');
      if (dup.length) { blocked++; blockedItems.push({id:c.id,title:c.title,duplicate_types:dup}); continue; }
      approved++;
      additions.push({
        id:c.id,title:c.title,url:c.officialUrl || c.source_feed_url,description:`Gecontroleerde IPTV/FAST-kandidaat uit ${c.source_feed_provider || c.provider}.`,country:(c.country_hint || [])[0] || 'Internationaal',type:c.category || 'Live TV',tags:['iptv','live','free','no-account',slug(c.category||'live')].filter(Boolean),language:[],free:true,requiresAccount:false,isLive:true,streamHealth:'candidate-approved',playbackMode:'direct-or-official',region:'Internationaal',availability:'unknown',officialUrl:c.officialUrl || c.source_feed_url,streamUrl:c.streamUrl,canonical_id:c.id,source_type:'public_iptv_channel',source_quality:{verification_status:'public',source_kind:'public_iptv_channel',last_checked_at:new Date().toISOString().slice(0,10),probe_status:'unknown',confidence_score:62,evidence_url:c.evidence_url || c.source_feed_url,notes:'Promoted from approved candidate with duplicate gate.'},origin_country:(c.country_hint || [])[0] || 'Internationaal',primary_markets:c.country_hint || [],availability_model:{origin_country:(c.country_hint || [])[0] || 'Internationaal',primary_markets:c.country_hint || [],known_available_countries:[],availability_scope:'unknown_or_variable',geo_restriction:'unknown_or_variable',cross_border_policy:'show_in_international_search_unless_probe_confirms_blocked',consumer_note:'Beschikbaarheid kan per land verschillen.',known_restricted_countries:[]},delivery:{web:true,direct_stream:true,iptv:true,iptv_review_status:'approved_iptv'}
      });
      ids.add(c.id); streams.set(normUrl(c.streamUrl), c.id); titles.set(slug(c.title), c.id);
    }
  }
}
const report={version:'30.2',dry_run:dryRun,loaded_candidates:loaded,approved_candidates_without_duplicates:approved,blocked_duplicates:blocked,published:dryRun?0:additions.length,blockedItems};
writeJson(path.join(root,'data/reports/iptv-promotion-summary.json'), report);
if (!dryRun && additions.length) {
  const out={...data, version:'30.2-consumer-country-movies-feeds', sources:[...sources,...additions]}; out.count=out.sources.length;
  for (const rel of ['SOURCE_MANIFEST.json','data/SOURCE_MANIFEST.json','data/sources.json','data/official-starter-catalog.json','data/generated/app-catalog.json']) writeJson(path.join(root,rel), out);
  fs.writeFileSync(path.join(root,'assets/starter-catalog.js'), `window.MEDIALENS_CATALOG = ${JSON.stringify(out)};\n`);
}
console.log(`Promotion ${dryRun?'dry-run':'write'}: ${loaded} loaded, ${approved} approved, ${blocked} duplicates blocked, ${dryRun?0:additions.length} published.`);
