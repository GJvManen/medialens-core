# MediaLens Core 1.0.0

MediaLens Core 1.0.0 is the current stable public repository package.

## Current shipping catalog

The verified `main` catalog currently contains:

- **2,900 total sources**;
- **2,242 direct-player sources**;
- **49 imported IPTV inputs**;
- **287 watch-graph channels**;
- **289 watch-graph routes**;
- **23 watch-graph countries**;
- catalog contract version **1.0.0**.

The current source-count breakdown is documented in [`docs/SOURCE_STATUS.md`](docs/SOURCE_STATUS.md).

## Verify

```bash
npm run verify
```

The release verifier is the authoritative check for the shipping source count and generated catalog consistency.

## Optional controlled IPTV/FAST import

```bash
npm run import:iptv-feeds
npm run verify
```

New source-expansion inputs are subject to the separate dedupe, provenance/rights, live-probe, approval and explicit-promotion gates documented in [`docs/IPTV_FAST_IMPORT.md`](docs/IPTV_FAST_IMPORT.md).
