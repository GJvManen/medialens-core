# Current source status

This page records both the current shipping source counts for MediaLens Core `1.0.0` and the latest non-shipping full-feed import projection.

## Shipping catalog

| Metric | Current value |
| --- | ---: |
| Total catalog sources | **2,900** |
| Direct-player sources | **2,242** |
| Existing imported IPTV inputs | **49** |
| Watch-graph channels | **287** |
| Watch-graph routes | **289** |
| Watch-graph countries | **23** |
| Catalog contract version | **1.0.0** |

These are the verified shipping counts of `SOURCE_MANIFEST.json` and the generated catalog bundles on `main`.

## Source-count composition

The current 2,900-source shipping catalog can be traced to the original controlled catalog plus accepted source-expansion promotions:

| Source group | Published sources added |
| --- | ---: |
| Existing/base MediaLens catalog before source-expansion promotion | **764** |
| TDTChannels | **373** |
| M3UPT | **702** |
| FreeCastHub public-iptv | **63** |
| Free-TV/IPTV recovery | **998** |
| **Current shipping total** | **2,900** |

The direct-player catalog followed the same accepted promotions: the original direct-player set contained 106 routes and the 2,136 accepted source-expansion additions bring the current direct-player total to **2,242**.

## Full-feed live test — 2026-08-20

A separate live test ran the current legacy/full-feed importer against all **13 feeds** in `data/iptv/fast-feed-registry.json`. The test used an isolated temporary copy of the repository and a sync `--dry-run`; it did **not** overwrite the shipping catalog.

| Full-feed test metric | Result |
| --- | ---: |
| Shipping baseline used for the test | **2,900** |
| Feeds fetched | **13** |
| Candidates processed | **21,341** |
| Import duplicates blocked | **6,369** |
| Globally rebuilt visible imported sources | **13,922** |
| Feed-level visible/eligible candidates | **14,059** |
| Sync approved inputs processed | **28,030** |
| Projected new sources | **14,059** |
| Projected existing-source updates | **13,971** |
| Projected skipped sources | **0** |
| **Projected total after legacy full sync** | **16,959** |

The **16,959** figure is a tested dry-run projection, not the current shipping count. It confirms that the upstream full-feed inventory still exists and is larger than the May 2026 run, which processed 20,670 candidates and reported 15,579 total sources after sync.

The test also found an order-dependent legacy dedupe/reporting difference of **137 records**: per-feed processing exposes 14,059 eligible candidates, while the globally rebuilt imported catalog contains 13,922 visible sources. This is documented rather than hidden; it is one reason the full-feed result remains a test projection rather than an automatic bulk publication.

See [`FULL_FEED_IMPORT_TEST.md`](FULL_FEED_IMPORT_TEST.md) and `data/reports/full-feed-import-test-2026-08-20.json` for the complete evidence and per-feed counts.

## Controlled-source roles

| Source | Role | Direct publication status |
| --- | --- | --- |
| TDTChannels | Tier B controlled catalogue | accepted through live probe, approval and explicit promotion |
| M3UPT | Tier B controlled catalogue | accepted through live probe, DRM/DASH holds, approval and explicit promotion |
| FreeCastHub | Tier B controlled catalogue | accepted through live probe, approval and explicit promotion |
| Free-TV/IPTV | Tier B controlled recovery catalogue | accepted through strict recovery gates |
| Famelack Data | evidence-gated inventory/research | **0** direct publications without independent candidate-level official evidence |
| IPTV Nexus | Tier C health/quality/EPG enrichment | **0** new sources; exact-match enrichment only |
| IPTVCat | Tier C discovery | **0** direct publications |
| LyngSat Stream | Tier C discovery | **0** direct publications |

## Verification

The release verifier confirms the current shipping state with:

```text
version: 1.0.0
catalog_sources: 2900
direct_player_sources: 2242
imported_iptv_inputs: 49
watch_graph_channels: 287
watch_graph_routes: 289
watch_graph_countries: 23
```

Run locally with:

```bash
npm install
npm run verify
```

For source-expansion history, full-feed test evidence and policy details, see:

- `docs/FULL_FEED_IMPORT_TEST.md`
- `docs/IPTV_FAST_IMPORT.md`
- `docs/SOURCE_EXPANSION_COMPLETION.md`
- `docs/SOURCE_POLICY.md`
- `data/reports/`
