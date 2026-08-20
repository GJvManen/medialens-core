# IPTV/FAST import

MediaLens Core contains two related IPTV/FAST ingestion paths:

1. the established importer for the existing controlled feed registry;
2. the gated source-expansion pipeline for newly assessed catalogues, enrichment services and discovery directories.

The source-expansion path is deliberately stricter. New external sources first become review candidates and are not consumer-visible until they have passed dedupe, probe, provenance/rights and approval gates plus an explicit promotion write.

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

## Source-expansion registry

The P1/P2 expansion registry is stored in:

`data/iptv/source-expansion-registry.json`

Current P1 controlled catalogues:

- TDTChannels TV, with EPG reference;
- M3UPT, with EPG reference and DRM/DASH fallback handling;
- FreeCastHub public-iptv;
- Free-TV/IPTV recovery;
- Famelack Data.

IPTV Nexus is enrichment-only. IPTVCat and LyngSat Stream are discovery-only and never bulk-publish directly.

## Persistent probe state and resumable batches

Large catalogues are processed in bounded batches. The importer rebuilds its candidate file from the current upstream feed, so MediaLens persists actual probe attempts separately in:

`data/iptv/source-expansion-probe-state.json`

Before a new network import, snapshot the current candidate evidence:

```bash
npm run snapshot:source-expansion
```

A resume probe then hydrates matching candidates by `source_feed_id + normalized stream URL` and does not spend batch capacity on an already attempted stream:

```bash
node scripts/probe-source-expansion.mjs . --live --resume --limit=120 --concurrency=12
```

Resume behavior:

- successful earlier live probes are not repeated;
- failed earlier live probes (`geo_blocked`, `http_error`, `timeout`, `network_error`) are also not repeated by default;
- `not_probed_batch_limit` is deliberately not a terminal state and remains eligible for the next batch;
- current safety, rights, DRM and duplicate gates always take precedence over restored probe history;
- `--retry-failed` can be used for an explicit retry pass after the normal backlog is exhausted.

The compact state file stores only actual probe attempts, not the entire candidate catalogue. This prevents feed reordering or candidate-file regeneration from resetting batch progress.

## Full operational pipeline

### Production/live review run

```bash
npm run pipeline:source-expansion:live
```

This performs:

1. snapshot of existing terminal probe evidence;
2. network import into `data/candidates/*.candidates.json`;
3. exact-stream dedupe against the MediaLens catalog and within the import batch;
4. resumable live stream probes;
5. policy approval evaluation;
6. promotion dry-run.

The normal live pipeline intentionally stops at a dry-run. Review `data/reports/source-expansion-promotion-report.json` before publication.

Publication is a separate explicit operation:

```bash
npm run promote:source-expansion
npm run verify
```

### Deterministic CI/offline run

```bash
npm run pipeline:source-expansion:offline
npm run verify:source-expansion
```

The fixture approval mode exists only for deterministic testing. The production promoter rejects fixture approvals unless `--allow-fixture` is explicitly supplied; normal publication requires a `live_policy_gate` approval.

## Individual stages

```bash
npm run snapshot:source-expansion
npm run import:source-expansion
npm run probe:source-expansion
npm run approve:source-expansion
npm run promote:source-expansion:dry
```

A single feed can be imported with:

```bash
node scripts/import-source-expansion.mjs . --feed=tdtchannels-tv
```

Famelack defaults to a bounded country import. Use `--all-countries` for an explicit full-country pass or `--max-countries=N` for a controlled batch.

## Approval behavior

Production approval requires all of the following:

- Tier B `controlled_public_catalogue` source;
- stream URL present;
- provenance/evidence URL present;
- documented source-level rights basis;
- no duplicate marker;
- no blocking safety/DRM/rights reason;
- successful live probe;
- candidate status `probe_passed_needs_approval`.

Famelack intentionally remains held by the automated approval policy until sufficient rights/provenance evidence is available for promotion. It is valuable for discovery and comparison, but its transformed dataset is not treated as broadcaster authorization by itself.

## TDTChannels live batches

### Batch 1 — accepted 2026-08-20

- 576 candidates imported with zero import-time consumer visibility;
- 120 candidates actively live-probed;
- 95 live probes passed and 25 failed;
- 95 candidates passed approval;
- 37 were stopped by the final duplicate gate;
- 58 new routes were published;
- release verification passed with 822 catalog sources and 164 direct-player sources.

### Batch 2 — accepted 2026-08-20

Batch 2 is the first production run using the persistent resume state.

- the snapshot recovered exactly 120 terminal probes from batch 1;
- all 120 earlier probes were restored and skipped;
- the entire 120-probe budget was therefore spent on previously unprocessed candidates;
- 82 of those new probes passed and 38 failed;
- persistent probe state grew from 120 to 240 records;
- 119 candidates were approval-eligible when restored prior successes and new successes were evaluated together;
- 46 approval-passed routes were stopped by the final duplicate gate;
- 73 new routes were published;
- 332 candidates remain `needs_probe` for subsequent normal batches;
- release verification passed with 895 catalog sources and 237 direct-player sources;
- shipping catalog version remained `1.0.0`.

The cumulative TDTChannels production state after batch 2 is therefore 240 actually probed stream routes, 131 newly published MediaLens routes across the two batches, and 332 still-unprocessed candidates in the current upstream catalogue. Failed routes remain persisted and are not retried during normal continuation.

## P1/P2 behavior

| Source | Role | Current behavior |
| --- | --- | --- |
| TDTChannels | controlled Tier B | resumable candidate batches, live probe, approval gate, EPG reference |
| M3UPT | controlled Tier B | candidate import, live probe, approval gate, DRM/DASH hold, EPG reference |
| FreeCastHub | controlled Tier B | candidate import, live probe, approval gate |
| Free-TV/IPTV recovery | controlled Tier B | candidate import through the stricter path |
| Famelack Data | controlled dataset | candidate import, but automated promotion held without rights basis |
| IPTV Nexus | Tier C enrichment | health/EPG metadata only; no duplicate catalogue |
| IPTVCat | Tier C discovery | targeted discovery only; no bulk publish |
| LyngSat Stream | Tier C discovery | targeted gap analysis only; no bulk copy |

## Verification

`npm run verify` syntax-checks all source-expansion stages, validates registry policy and runs an end-to-end pipeline test in a temporary catalog before normal release verification.

The E2E test proves that:

- candidates remain non-consumer-visible after ingest;
- the duplicate gate is exercised;
- a bounded first batch persists probe state;
- a subsequent re-import may regenerate candidates without losing processed-state progress;
- `--resume` skips an already processed candidate and spends its next slot on a new candidate;
- probe evidence is required for approval;
- Famelack remains held without rights basis;
- promotion dry-run does not modify the shipping catalog;
- explicit write preserves the shipping catalog version contract.

## Operating guidance

- Never use discovery or enrichment feeds as direct publication authority.
- Snapshot probe state before re-importing a source that is being processed in batches.
- Use `--resume` for normal continuation; reserve `--retry-failed` for an explicit retry cycle.
- Inspect approval and promotion reports before `--write` publication.
- Prefer official watch routes for geo-blocked, DRM-protected or browser-incompatible streams.
- Keep generated candidate/report/state files when they form useful acceptance evidence.
- Run `npm run verify` after every import/promotion change intended to ship.
