# TDTChannels batch 5 — final normal backlog run

This run continues the controlled Tier-B TDTChannels source expansion from the accepted batch-4 production state.

## Starting state

- 576 candidates in the current upstream catalogue at batch 4;
- 480 terminal probe records persisted;
- 92 candidates remained in the normal `needs_probe` backlog;
- catalog version contract: `1.0.0`;
- catalog after batch 4: 1,070 sources and 412 direct-player sources.

## Execution

The batch-5 workflow:

1. snapshots existing terminal probe evidence;
2. re-imports the current TDTChannels feed;
3. hydrates persisted probe state using `source_feed_id + normalized stream URL`;
4. live-probes up to 120 previously unprocessed candidates;
5. applies the approval gate;
6. applies the final duplicate/publication gate;
7. performs an explicit promotion write;
8. runs full release verification;
9. commits live evidence and catalog output only if verification succeeds.

## Acceptance criteria

- no prior terminal route is re-probed during normal continuation;
- import-time consumer visibility remains zero;
- only live-policy-approved candidates may be promoted;
- shipping catalog version remains `1.0.0`;
- full `npm run verify` passes;
- if the upstream catalogue has not materially changed, `deferred_needs_probe` reaches zero and the normal TDTChannels backlog is complete.

Failed terminal probes remain persisted and are not retried in this normal completion run. Any later retry of failures must be an explicit `--retry-failed` cycle and is a separate operational decision.
