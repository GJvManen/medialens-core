# IPTV/FAST import and source expansion

MediaLens Core uses two related ingestion paths:

1. the established importer for the existing controlled feed registry;
2. the stricter source-expansion pipeline for newly assessed catalogues, enrichment services and discovery directories.

The source-expansion path never bulk-publishes on import. New external records begin as non-consumer-visible candidates and can reach the shipping catalog only after the applicable dedupe, safety/DRM, provenance/rights, live-probe, approval and explicit-promotion gates have passed.

## Current shipping source state

The verified `main` release currently contains:

| Metric | Current value |
| --- | ---: |
| Total catalog sources | **2,900** |
| Direct-player sources | **2,242** |
| Imported IPTV inputs | **49** |
| Watch-graph channels | **287** |
| Watch-graph routes | **289** |
| Watch-graph countries | **23** |
| Catalog contract version | **1.0.0** |

The source-count composition is:

| Source group | Published sources |
| --- | ---: |
| Existing/base MediaLens catalog before source-expansion promotion | **764** |
| TDTChannels | **373** |
| M3UPT | **702** |
| FreeCastHub public-iptv | **63** |
| Free-TV/IPTV recovery | **998** |
| **Current total** | **2,900** |

The accepted source-expansion work therefore added **2,136 sources** to the original 764-source catalog. Those accepted additions are direct-player routes; together with the original 106 direct-player sources they produce the current **2,242 direct-player sources**.

See [`SOURCE_STATUS.md`](SOURCE_STATUS.md) for the compact current-state record.

## Source-expansion registry

The source registry is stored at:

`data/iptv/source-expansion-registry.json`

Current roles:

| Source | Tier | Role | Direct publication |
| --- | --- | --- | --- |
| TDTChannels | B | controlled catalogue | yes, after live gates |
| M3UPT | B | controlled catalogue | yes, after live gates; DRM/DASH held |
| FreeCastHub | B | controlled catalogue | yes, after live gates |
| Free-TV/IPTV | B | controlled recovery catalogue | yes, through strict recovery gates |
| Famelack Data | B | evidence-gated inventory/research | only exact independently evidenced records may advance |
| IPTV Nexus | C | health/quality/EPG enrichment | never creates sources |
| IPTVCat | C | targeted discovery | never directly |
| LyngSat Stream | C | targeted discovery | never directly |

## Existing feed workflow

```bash
npm run import:iptv-feeds
npm run verify
```

Offline validation:

```bash
npm run import:iptv-feeds:offline
npm run sync:iptv:dry
npm run verify
```

The legacy importer remains separate from the stricter source-expansion path. Free-TV/IPTV recovery was deliberately performed only through source expansion rather than reactivating the historical loose path.

## Source-expansion workflow

### Snapshot persistent live-probe state

```bash
npm run snapshot:source-expansion
```

Terminal live probe results are stored in:

`data/iptv/source-expansion-probe-state.json`

Candidates are matched across re-imports by `source_feed_id + normalized stream URL` so large feeds can be resumed without losing prior live evidence.

### Import one controlled feed

```bash
node scripts/import-source-expansion.mjs . --feed=tdtchannels-tv
```

Other feed IDs include:

```text
m3upt
freecasthub-public-iptv
free-tv-iptv-recovery
famelack-data
iptv-nexus
iptvcat
lyngsat-stream
```

### Live probe one feed

```bash
node scripts/probe-source-expansion.mjs . --feed=tdtchannels-tv --live --resume --concurrency=12 --timeout=6000
```

Normal resume behavior does not retry previously failed terminal live attempts. Use `--retry-failed` only for a deliberate later retry cycle.

### Approval and explicit promotion

```bash
node scripts/approve-source-expansion.mjs . --feed=tdtchannels-tv
node scripts/promote-source-expansion.mjs . --feed=tdtchannels-tv
```

Promotion is dry-run by default. Shipping publication requires an explicit write:

```bash
node scripts/promote-source-expansion.mjs . --feed=tdtchannels-tv --write
npm run verify
```

Feed scoping is mandatory for production operations so previously completed source candidates cannot be reconsidered as part of another feed's approval or promotion run.

## Publication gates

A normal controlled Tier-B candidate must satisfy all applicable requirements:

1. source is registered and feed-scoped;
2. candidate remains `consumer_visible: false` at import;
3. exact stream duplicates are held;
4. adult/premium/unsafe policy matches are held or rejected;
5. DRM/DASH routes are held as official-fallback candidates and are not direct-playable;
6. ordinary YouTube/Twitch/Dailymotion/Vimeo web pages are held as official-web fallbacks rather than treated as stream manifests;
7. provenance and sufficient rights/official-source evidence are present;
8. a live stream probe succeeds;
9. approval passes the production `live_policy_gate`;
10. the final promotion duplicate gate passes;
11. publication is performed with an explicit `--write` operation;
12. the full release verifier remains green and preserves catalog version `1.0.0`.

HTTP direct routes that require compatibility support retain the proxy-required playback policy.

## Completed controlled-source acceptance

### TDTChannels

The normal TDT backlog was completed across five resumable batches on 2026-08-20.

Final cumulative state:

- **572** unique routes received terminal live probes;
- **471** live probes succeeded;
- **101** live probes failed;
- normal deferred probe backlog: **0**;
- **373 new MediaLens sources published**;
- catalog state after TDT completion: **1,137 sources / 479 direct-player sources**.

Failed terminal routes remain persisted and are not silently retried during normal continuation.

### M3UPT

Final controlled live run:

- **898** candidates;
- **28** import duplicates;
- **56** DRM/DASH holds;
- **814** actual live probes;
- **707** live successes;
- **107** live failures;
- **702 new sources published** after final publication dedupe;
- catalog state after M3UPT: **1,839 sources / 1,181 direct-player sources**.

M3UPT country handling uses explicit `tvg-country`, then country inference from `tvg-id`, then source fallback. Its EPG metadata is propagated to promoted sources.

### FreeCastHub public-iptv

Final controlled live run:

- **108** candidates;
- **17** import duplicates;
- **3** DRM/DASH holds;
- **88** actual live probes;
- **63** live successes;
- **25** live failures;
- **63 new sources published**;
- catalog state after FreeCastHub: **1,902 sources / 1,244 direct-player sources**.

Unknown country metadata remains international rather than being guessed from the channel name.

### Free-TV/IPTV recovery

The source was reintroduced only through the strict recovery path.

Final controlled live run:

- **2,041** candidates;
- **106** import duplicates;
- **22** DRM/DASH holds;
- **139** official-web fallback routes;
- **400** candidates policy-blocked before network probing;
- **1,641** actual live probes;
- **1,064** live successes;
- **577** live failures;
- **66** additional final publication duplicates;
- **998 new sources published**;
- resulting catalog state: **2,900 sources / 2,242 direct-player sources**.

The recovery also added the generic guard that prevents an HTTP-200 response from an ordinary video-platform web page from being mistaken for a direct stream.

## Famelack evidence-gated inventory

Famelack's dataset license is not treated as downstream broadcaster-stream authorization.

The full current TV inventory run processed:

- **168 country files**;
- **7,256 candidates**;
- **585 duplicates**;
- **6,667 candidates held for independent official-source evidence**;
- **4** candidates already blocked by another safety/policy rule;
- **0 independently verified production allowlist records**;
- **0 live probes**;
- **0 approvals**;
- **0 promotions/publications**.

The production evidence allowlist is `data/iptv/famelack-official-evidence.json`. A record may advance only after exact candidate-level independent official evidence has been entered.

## IPTV Nexus enrichment

IPTV Nexus is enrichment-only and cannot create or promote a source.

The live enrichment run loaded:

- **39,659 Nexus channels**;
- **14,026 Nexus streams**;
- **944 exact stream-URL matches** against existing MediaLens sources;
- **914** matches reported online;
- **30** matches offline or not conclusively online;
- **0 new sources published**.

Supplemental health, quality, uptime and EPG hints are stored under `external_enrichment.iptv_nexus`. The catalog count remains **2,900**.

## IPTVCat and LyngSat discovery

IPTVCat and LyngSat remain discovery-only directories. They do not produce bulk candidates and cannot publish directly.

The current discovery plan records **50 low-coverage catalog targets**. A route found through discovery must independently establish official source/provenance evidence before it can enter the controlled publication pipeline.

## Verification

Run:

```bash
npm install
npm run verify
```

The full verifier checks the source-expansion registry, feed isolation, resumable probe state, FreeCastHub and Free-TV safety, Famelack evidence gating, IPTV Nexus enrichment isolation, discovery isolation and final release consistency.

The current authoritative release-verifier result is:

```text
version: 1.0.0
catalog_sources: 2900
direct_player_sources: 2242
imported_iptv_inputs: 49
watch_graph_channels: 287
watch_graph_routes: 289
watch_graph_countries: 23
```

## Evidence and further documentation

- [`SOURCE_STATUS.md`](SOURCE_STATUS.md) — current shipping counts and source composition.
- [`SOURCE_EXPANSION_COMPLETION.md`](SOURCE_EXPANSION_COMPLETION.md) — completion of Famelack/Nexus/discovery roles.
- [`SOURCE_POLICY.md`](SOURCE_POLICY.md) — trust tiers and publication rules.
- `data/reports/` — machine-readable acceptance and operational evidence.
