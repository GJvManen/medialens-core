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

## Full operational pipeline

### Production/live review run

```bash
npm run pipeline:source-expansion:live
```

This performs:

1. network import into `data/candidates/*.candidates.json`;
2. exact-stream dedupe against the MediaLens catalog and within the import batch;
3. live stream probes;
4. policy approval evaluation;
5. promotion dry-run.

The live pipeline intentionally stops at a dry-run. Review `data/reports/source-expansion-promotion-report.json` before publication.

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

## P1/P2 behavior

| Source | Role | Current behavior |
| --- | --- | --- |
| TDTChannels | controlled Tier B | candidate import, live probe, approval gate, EPG reference |
| M3UPT | controlled Tier B | candidate import, live probe, approval gate, DRM/DASH hold, EPG reference |
| FreeCastHub | controlled Tier B | candidate import, live probe, approval gate |
| Free-TV/IPTV recovery | controlled Tier B | candidate import through the stricter path |
| Famelack Data | controlled dataset | candidate import, but automated promotion held without rights basis |
| IPTV Nexus | Tier C enrichment | health/EPG metadata only; no duplicate catalogue |
| IPTVCat | Tier C discovery | targeted discovery only; no bulk publish |
| LyngSat Stream | Tier C discovery | targeted gap analysis only; no bulk copy |

## Verification

`npm run verify` now syntax-checks all source-expansion stages, validates registry policy and runs an end-to-end pipeline test in a temporary catalog before the normal release verification.

The E2E test proves that:

- candidates remain non-consumer-visible after ingest;
- the duplicate gate is exercised;
- probe evidence is required;
- controlled Tier-B fixtures can become approval-eligible in test mode;
- Famelack remains held without rights basis;
- promotion dry-run does not modify the shipping catalog.

## Operating guidance

- Never use discovery or enrichment feeds as direct publication authority.
- Run a live pipeline before reviewing a new provider batch.
- Inspect approval and promotion reports before `--write` publication.
- Prefer official watch routes for geo-blocked, DRM-protected or browser-incompatible streams.
- Keep generated candidate/report files only when they are useful acceptance evidence.
- Run `npm run verify` after every import/promotion change intended to ship.
