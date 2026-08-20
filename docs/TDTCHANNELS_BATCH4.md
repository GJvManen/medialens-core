# TDTChannels production batch 4

Accepted: 2026-08-20

Batch 4 continued the resumable TDTChannels production backlog using the persistent probe state already established by batches 1–3.

## Result

- upstream candidates: 576
- import-time consumer-visible candidates: 0
- prior terminal probes restored/skipped: 360
- newly live-probed candidates: 120
- newly passed live probes: 110
- newly failed live probes: 10
- persistent terminal probe records after batch: 480
- approval-passed candidates: 166
- blocked by final duplicate gate: 79
- newly published routes: 87
- remaining normal probe backlog: 92
- catalog sources after promotion: 1,070
- direct-player sources after promotion: 412
- shipping catalog version: 1.0.0

## Release gate

The live workflow completed import, resumable probe, approval, explicit promotion and the full `npm run verify` release verifier successfully before writing the generated evidence and catalog changes back to the PR branch.

The machine-readable acceptance record is `data/reports/tdtchannels-batch4-acceptance.json`.

## Cumulative TDTChannels state

After four production batches, MediaLens has actively probed 480 unique TDTChannels stream routes and published 306 new non-duplicate routes. Failed probes remain persisted and are not retried during normal continuation. The remaining 92 candidates form the final normal TDTChannels backlog before failed-route retry review or moving to the next P1 source.
