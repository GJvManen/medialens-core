# IPTV/FAST import

MediaLens Core includes an IPTV/FAST import pipeline for large live-channel feed sets. The workflow is designed to add classifiable live sources without replacing the existing curated catalog.

## Main workflow

```bash
npm run import:iptv-feeds
npm run verify
```

The command performs the complete import and sync flow:

1. Load configured feeds from `data/iptv/fast-feed-registry.json`.
2. Parse and normalize M3U entries.
3. Classify country, language, channel name, category and stream route where available.
4. Exclude entries that cannot be presented safely or clearly.
5. Publish visible IPTV/FAST sources into the runtime catalog.
6. Rebuild and verify the release package.

## Sync only

When candidate or approved import files already exist, run only the sync stage:

```bash
node scripts/sync-approved-iptv-sources.mjs . --write
npm run verify
```

## Offline check

```bash
npm run import:iptv-feeds:offline
npm run sync:iptv:dry
npm run verify
```

Offline mode uses local samples and existing import files. Use the normal import command in an internet-enabled environment for the full feed set.

## Full-feed reference run

A recent full import produced the following visible output:

| Feed | Candidates | Visible imports |
| --- | ---: | ---: |
| IPTV.org index | 12,311 | 10,048 |
| Samsung TV Plus US | 539 | 536 |
| Roku Channel | 371 | 369 |
| Pluto TV US | 410 | 134 |
| LG Channels US | 434 | 88 |
| Tubi | 176 | 150 |
| Plex | 2,688 | 915 |
| Vizio WatchFree | 427 | 377 |
| DistroTV | 336 | 325 |
| Xiaomi TV Plus | 254 | 219 |
| Xumo Play | 389 | 17 |
| Local Now | 447 | 434 |
| Free TV IPTV | 1,888 | 1,203 |

Summary from that run:

- **20,670** candidates processed.
- **14,432** IPTV/FAST sources visible in the consumer interface.
- **29,296** approved IPTV/FAST inputs processed by the sync stage.
- **15,579** total sources available after sync.

The exact numbers can change as external feed providers add, remove or rename channels.

## Operating guidance

- Run `npm run verify` after every import.
- Keep the generated import files in version control only when the resulting source set should ship with the product.
- Use the source policy to decide whether a channel should be shown as an internal stream, official route, external route or unavailable item.
- Prefer clear consumer labels over technical feed terminology.
