# Current source status

This page records the current shipping source counts for MediaLens Core `1.0.0` after completion of the controlled source-expansion roadmap on 2026-08-20.

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

These counts are the verified shipping state of `SOURCE_MANIFEST.json` and the generated catalog bundles on `main`. They supersede older historical reference-run figures that may have appeared in earlier documentation.

## Source-count composition

The current 2,900-source catalog can be traced to the original controlled catalog plus the accepted source-expansion promotions:

| Source group | Published sources added |
| --- | ---: |
| Existing/base MediaLens catalog before source-expansion promotion | **764** |
| TDTChannels | **373** |
| M3UPT | **702** |
| FreeCastHub public-iptv | **63** |
| Free-TV/IPTV recovery | **998** |
| **Current total** | **2,900** |

The direct-player catalog followed the same accepted promotions: the original direct-player set contained 106 routes and the 2,136 accepted source-expansion additions bring the current direct-player total to **2,242**.

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

For source-expansion history, acceptance evidence and policy details, see:

- `docs/IPTV_FAST_IMPORT.md`
- `docs/SOURCE_EXPANSION_COMPLETION.md`
- `docs/SOURCE_POLICY.md`
- `data/reports/`
