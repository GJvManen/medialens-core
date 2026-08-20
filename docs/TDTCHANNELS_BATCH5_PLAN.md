# TDTChannels batch 5 — normal backlog completed

TDTChannels batch 5 completed the controlled Tier-B normal probe backlog on 2026-08-20.

## Starting state

- 576 candidates in the upstream catalogue;
- 480 terminal probe records persisted from batches 1–4;
- 92 candidates remained in the normal `needs_probe` backlog;
- catalog version contract: `1.0.0`;
- catalog after batch 4: 1,070 sources and 412 direct-player sources.

## Live result

The batch-5 workflow restored all 480 previous terminal probe records and spent its probe budget only on the remaining unprocessed routes.

- 576 candidates imported with zero import-time consumer visibility;
- 480 previously processed routes restored and skipped;
- 92 candidates actively live-probed;
- 86 new live probes passed;
- 6 new live probes failed;
- 4 candidates remained blocked by non-probe gates and did not require a normal live attempt;
- persistent terminal probe state grew from 480 to 572 records;
- `deferred_needs_probe` reached **0**;
- 165 candidates passed the approval evaluation;
- 98 approval-passed/considered routes were blocked by the final publication gate;
- 67 new routes were published;
- release verification passed with 1,137 catalog sources and 479 direct-player sources;
- shipping catalog version remained `1.0.0`.

## Completion decision

The normal TDTChannels backlog is complete. No batch 6 is required for ordinary continuation.

Across batches 1–5:

- 572 unique routes received terminal live probe evidence;
- 471 live probes passed;
- 101 live probes failed;
- 373 new TDTChannels routes were published to MediaLens after approval and final dedupe;
- the remaining non-probed candidates are blocked by policy/safety/deduplication conditions rather than waiting for normal probe capacity.

Failed terminal routes remain persisted and are not automatically retried. A future `--retry-failed` cycle, upstream refresh, or source-health review is a separate operational decision and must not be conflated with the completed normal backlog.

## Next source-expansion priority

With TDTChannels normal ingestion complete, the next controlled P1 source is **M3UPT**, using the same import → safety/DRM gate → live probe → approval → final dedupe → explicit promotion → release verification discipline.
