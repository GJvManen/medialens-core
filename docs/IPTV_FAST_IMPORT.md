# IPTV/FAST import

MediaLens Core contains two related IPTV/FAST ingestion paths:

1. the established feed importer for the existing controlled feed registry;
2. the source-expansion importer for newly assessed catalogues, enrichment services and discovery directories.

The source-expansion path is intentionally stricter: new external sources create review candidates only and are never bulk-published directly to the consumer catalog.

## Existing feed workflow

```bash
npm run import:iptv-feeds
npm run verify
```

This loads `data/iptv/fast-feed-registry.json`, parses M3U entries, applies duplicate and safety checks and then runs the approved IPTV sync stage.

Offline validation remains available:

```bash
npm run import:iptv-feeds:offline
npm run sync:iptv:dry
npm run verify
```

## Source-expansion workflow

The P1/P2 expansion registry is stored in:

`data/iptv/source-expansion-registry.json`

Run the network-enabled candidate import with:

```bash
npm run import:source-expansion
```

Run the reproducible offline fixture path with:

```bash
npm run import:source-expansion:offline
npm run verify:source-expansion
```

A single feed can be inspected with:

```bash
node scripts/import-source-expansion.mjs . --feed=tdtchannels-tv
```

Famelack defaults to a bounded country import to avoid an accidental very large network run. Use `--all-countries` for an explicit full-country pass or `--max-countries=N` for a controlled batch.

## P1 integrations

| Source | Role | Import behavior | Consumer visibility |
| --- | --- | --- | --- |
| TDTChannels | controlled public catalogue | M3U candidate import + EPG reference | approval required |
| M3UPT | controlled public catalogue | M3U candidate import + EPG reference; DRM/DASH routed to review | approval required |
| FreeCastHub public-iptv | controlled public catalogue | M3U candidate import | approval required |
| Free-TV/IPTV recovery | controlled public catalogue | re-import through stricter candidate queue | approval required |
| Famelack Data | controlled public dataset | JSON country dataset candidate import | approval required |
| IPTV Nexus | enrichment | health/EPG metadata only; not a second channel catalogue | never direct from enrichment |

## P2 discovery integrations

IPTVCat and LyngSat Stream are registered as discovery sources. The importer does not bulk-scrape or bulk-copy either directory. A channel discovered there must be independently matched to an official broadcaster or another controlled source and then pass the normal MediaLens evidence, probe, dedupe and approval gates.

## Publication gates

Every source-expansion candidate remains `consumer_visible: false` until all required gates pass:

1. exact-stream dedupe;
2. stream probe;
3. provenance evidence;
4. rights or official-source evidence;
5. approval.

Entries containing obvious adult content are rejected. Possible premium/pay-TV entries go to rights review. DASH/DRM or license-bearing M3UPT entries are not treated as directly playable; they are kept for supported official-fallback review.

## IPTV Nexus enrichment

IPTV Nexus is intentionally used for enrichment rather than bulk import because much of its channel universe is derived from IPTV-org. MediaLens may use its health score, online status and merged EPG to enrich an already-known channel, but should not create a duplicate catalog from the Nexus playlist.

## Historical full-feed reference

A previous full run of the established importer reported 20,670 candidates and 14,432 visible IPTV/FAST imports. Those values are historical operational evidence, not a target for the source-expansion path. New source-expansion candidates are deliberately non-visible until approval.

## Operating guidance

- Run `npm run verify` after registry or policy changes.
- Run the source-expansion importer before manually reviewing a new provider.
- Do not change a discovery or enrichment source to auto-publish.
- Keep generated candidate/report files only when they form useful acceptance evidence.
- Prefer official watch routes when direct playback is unavailable, geo-restricted, DRM-protected or otherwise unsuitable for the MediaLens player.
