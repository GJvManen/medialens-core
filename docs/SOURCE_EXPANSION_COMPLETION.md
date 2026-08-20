# Source-expansion roadmap completion

This document closes the remaining source-expansion items after TDTChannels, M3UPT, FreeCastHub and Free-TV/IPTV were operationalized.

## Remaining sources and final role

| Source | Tier | Final role | Direct publication |
| --- | --- | --- | --- |
| Famelack Data | B | candidate research with exact independent official-evidence gate | only exact allowlisted evidence records may advance |
| IPTV Nexus | C | exact-match health/quality/EPG enrichment of existing MediaLens routes | never |
| IPTVCat | C | targeted coverage-gap discovery | never directly |
| LyngSat Stream | C | targeted coverage-gap discovery | never directly |

## Famelack Data

The Famelack repository is MIT-licensed and explicitly permits reuse of the dataset. That does not make the dataset itself proof that each underlying stream is authorized for downstream publication. Famelack also acknowledges IPTV-org as a significant TV discovery upstream.

MediaLens therefore uses `data/iptv/famelack-official-evidence.json` as the only automated bridge from dataset candidate to probe eligibility. The production allowlist starts empty. Every entry must exact-match `channel_id + stream_url` and include:

- official broadcaster/source URL;
- independent evidence URL;
- candidate-level rights basis;
- verification timestamp/notes when available.

`scripts/gate-famelack-evidence.mjs` clears dataset-only evidence from the publication decision, holds non-allowlisted candidates with `dataset_license_not_stream_rights_evidence`, and prevents them from consuming live-probe capacity.

The one-time completion workflow inventories the current full TV corpus. With an empty production allowlist, acceptance requires zero live probes, zero approvals and zero publications from Famelack.

## IPTV Nexus

`scripts/enrich-iptv-nexus.mjs` reads the Nexus channel API and builds an exact stream-URL index. It may attach supplemental metadata only to a MediaLens source that already contains the exact stream URL.

Attached metadata is stored under `external_enrichment.iptv_nexus` and can include:

- channel ID/name/country;
- online state and score;
- stream rank and quality;
- health status, uptime, latency and media details;
- EPG guide hints and the Nexus EPG endpoint.

The enrichment contract preserves catalog version and source count and creates zero new sources. Nexus evidence is supplemental only and does not replace MediaLens rights, provenance, probe or approval evidence.

## IPTVCat and LyngSat Stream

Both remain discovery-only. `scripts/register-discovery-sources.mjs` records the active discovery directories plus low-coverage MediaLens countries/regions to guide targeted research.

The discovery path is:

1. identify a specific catalog coverage gap;
2. use a directory to discover a possible channel/source reference without bulk copying;
3. independently establish broadcaster/source evidence;
4. register the candidate through a controlled Tier-A/Tier-B source or explicit evidence record;
5. dedupe, live-probe, approve and explicitly promote through the normal pipeline.

Bulk scraping, direct directory publication and treating directory availability as rights evidence are prohibited.

## Regression gates

`npm run verify` includes dedicated tests for:

- Famelack candidate-level evidence gating;
- IPTV Nexus exact-match enrichment isolation and source-count preservation;
- IPTVCat/LyngSat zero-candidate discovery isolation;
- all earlier TDT/M3UPT/FreeCastHub/Free-TV source-expansion gates;
- final release verification.

## Acceptance artifacts

The completion run writes:

- `data/reports/famelack-current-corpus-acceptance.json`;
- `data/reports/iptv-nexus-enrichment-report.json`;
- `data/reports/source-discovery-plan.json`.

The one-shot live workflow is removed before merge. Final merge requires a fresh exact-head Verify after live evidence and documentation are committed.
