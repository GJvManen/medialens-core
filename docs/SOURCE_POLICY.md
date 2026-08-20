# Source policy

MediaLens distinguishes between route types and source-trust tiers so the consumer interface remains clear, useful and evidence-driven.

## Route types

- **Internal stream** — a stream that can be opened through the MediaLens player flow.
- **IPTV/FAST route** — a verified live route imported from a configured feed set.
- **Official watch page** — an official page where the viewer can watch or continue to the platform.
- **Official platform** — a broadcaster or service destination that may contain multiple channels or programmes.
- **External guide route** — a trusted external route or guide that helps the viewer reach content.

## Source trust tiers

### Tier A — primary official

Broadcaster-owned websites, official CDN routes, official YouTube/live endpoints and official FAST-provider routes. These are preferred evidence sources, while playback and availability still require validation.

### Tier B — controlled public catalogue

Curated public catalogues with documented source policies. Current source-expansion examples are TDTChannels, M3UPT, FreeCastHub, Free-TV/IPTV and Famelack Data. Tier B is an ingestion input, not automatic proof that every individual route can be published.

### Tier C — discovery or enrichment

Sources used to find candidates or improve metadata without being treated as publishing authority. IPTV Nexus is health/EPG enrichment. IPTVCat and LyngSat Stream are discovery sources. Tier C never bulk-publishes directly to the consumer catalog.

### Tier D — high-risk discovery only

Anonymous playlists, Pastebin-style lists, credential-based IPTV URLs, piracy mirrors, unclear premium restreams and similar sources. Tier D may not be promoted without independent official provenance and explicit approval; prohibited or unsafe material is rejected.

## Presentation rules

- Do not present an item as directly playable unless a usable stream route exists.
- Prefer the official watch route when a direct stream is unavailable, restricted or DRM-limited.
- Keep platforms separate from individual channels.
- Group multiple routes around one channel when they clearly refer to the same destination.
- Use neutral labels when a source may be regionally restricted or browser-limited.
- Do not expose discovery-source provenance as if it were broadcaster authorization.

## Source-expansion publication gates

A newly imported candidate remains `consumer_visible: false` until the publication path has separately established:

1. duplicate safety;
2. stream health/probe evidence;
3. provenance evidence;
4. rights or official-source evidence;
5. approval;
6. explicit promotion.

Import, approval and publication are separate operations. `approved_iptv` is not itself consumer publication. The dedicated source-expansion promoter is dry-run by default and requires an explicit `--write` operation to modify the shipping catalog.

## Live evidence requirement

Production promotion requires `live_policy_gate` approval. The automated production gate accepts only a successful live probe together with a Tier-B controlled source, evidence URL and documented rights basis. Candidate-level rights evidence is allowed when the catalogue itself is not broadcaster authority, but it must be independently verified and attached to the exact candidate.

Fixture probe/approval evidence is valid only for CI and deterministic testing. A fixture approval cannot be published by the production promoter unless `--allow-fixture` is explicitly supplied. That flag is not part of the normal release workflow.

## Famelack evidence policy

Famelack Data is MIT-licensed as a dataset, but the dataset license is not treated as evidence that every underlying broadcaster stream may be republished by MediaLens. The dataset also acknowledges IPTV-org as a significant discovery upstream. Therefore:

- every Famelack candidate is held before network probing unless an exact `channel_id + stream_url` record exists in `data/iptv/famelack-official-evidence.json`;
- an allowlist record must carry an independently verified official broadcaster/source URL, an evidence URL and a candidate-level rights basis;
- unverified records receive `dataset_license_not_stream_rights_evidence`, remain non-direct-playable and do not consume live-probe capacity;
- dataset provenance is retained separately for research/audit, but is not substituted for broadcaster evidence;
- the production allowlist defaults to empty and must only be expanded through reviewed evidence changes.

This lets Famelack support gap analysis and source research without weakening MediaLens publication controls.

## IPTV Nexus enrichment policy

IPTV Nexus is a Tier-C enrichment source only. MediaLens may exact-match Nexus metadata against a stream URL that already exists in the MediaLens catalog and attach supplemental metadata under `external_enrichment.iptv_nexus`, including health, uptime, quality, stream rank and EPG-guide hints.

The enrichment contract is intentionally narrow:

- matching is `exact_stream_url` only; no fuzzy source creation;
- the number of MediaLens catalog sources must not increase;
- MediaLens catalog version is preserved;
- Nexus health does not replace MediaLens approval/probe evidence;
- Nexus metadata is never rights or provenance authority for publication;
- an unmatched Nexus channel is ignored rather than imported as a second IPTV-org-derived catalog.

## Discovery-only policy: IPTVCat and LyngSat Stream

IPTVCat and LyngSat Stream remain Tier-C targeted discovery sources. They are useful for identifying coverage gaps, but neither directory has a direct publication path.

For both sources MediaLens enforces:

- zero bulk candidates from the discovery importer;
- zero consumer-visible records;
- no bulk scraping/copying into the MediaLens catalog;
- use only for a named coverage gap or candidate investigation;
- any candidate must be independently re-established through an official broadcaster/source or another controlled Tier-A/Tier-B evidence path before dedupe, live probe, approval and explicit promotion.

The generated `data/reports/source-discovery-plan.json` records the current discovery sources, low-coverage targets and the required promotion path.

## Discovery/enrichment restrictions

Discovery and enrichment sources have no direct publication path. IPTVCat and LyngSat are used only to identify gaps or potential official routes. IPTV Nexus may enrich known channels with health/EPG information but must not create a second IPTV-org-derived catalog.

DRM/DASH entries that MediaLens cannot safely and reliably play must use an official fallback route instead of being labelled as an internal stream.

## IPTV/FAST preservation

Existing approved IPTV/FAST sources should not disappear after a new import or sync. Large feed imports must result in a clean consumer interface rather than a raw technical list. New source-expansion imports remain separated from the published catalog until all gates are complete.
