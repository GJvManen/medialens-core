# MediaLens Core 1.0.0

MediaLens Core 1.0.0 is the current stable public release package for the project.

## Release focus

- A consumer-facing streaming discovery interface.
- Country, channel and platform navigation for live sources.
- Grouped watch routes through the generated watch graph.
- Internal player flow with explicit viewer start action.
- Official fallback routes when direct playback is not suitable.
- Controlled IPTV/FAST import and source-expansion workflows for large live-channel feed sets.
- Professional public documentation and representative interface screenshots.

## Current verified source state

As of 2026-08-20, the shipping catalog on `main` contains:

| Metric | Verified value |
| --- | ---: |
| Total sources | **2,900** |
| Direct-player sources | **2,242** |
| Imported IPTV inputs | **49** |
| Watch-graph channels | **287** |
| Watch-graph routes | **289** |
| Watch-graph countries | **23** |
| Catalog version | **1.0.0** |

The 2,900 sources consist of:

- 764 existing/base MediaLens sources;
- 373 accepted TDTChannels additions;
- 702 accepted M3UPT additions;
- 63 accepted FreeCastHub additions;
- 998 accepted Free-TV/IPTV recovery additions.

Famelack contributes no direct published routes without independent candidate-level official evidence. IPTV Nexus is exact-match health/quality/EPG enrichment only. IPTVCat and LyngSat are targeted discovery-only integrations.

See [`SOURCE_STATUS.md`](SOURCE_STATUS.md) for the current auditable count and [`SOURCE_EXPANSION_COMPLETION.md`](SOURCE_EXPANSION_COMPLETION.md) for the source-roadmap acceptance details.

## Source preservation

The release keeps the packaged catalog and runtime bundles synchronized. The validation flow checks source preservation, direct-player routes, IPTV/FAST inputs, application boot, documentation and visible interface text.

`npm run verify` is the authoritative release check. It currently verifies the shipping state at **2,900 total sources** and **2,242 direct-player sources** while preserving catalog version `1.0.0`.

## IPTV/FAST expansion

The current release no longer uses raw candidate volume as a publication metric. External source candidates must pass dedupe, safety/DRM, provenance/rights, stream probing, approval and explicit promotion before they can enter the shipping catalog.

Across the completed controlled source-expansion work, **2,136 accepted sources** were added to the original 764-source catalog, producing the current **2,900-source** release state.
