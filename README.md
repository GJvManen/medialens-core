# MediaLens Core

**MediaLens Core** is a consumer-facing streaming discovery interface for live television, official streaming platforms and verified IPTV/FAST routes. It is designed to turn a fragmented media landscape into a clear watch experience: viewers choose a country, channel or category, and MediaLens presents the best available route to watch.

![MediaLens interface](screenshots/home.png)

## What MediaLens does

MediaLens combines channel data, official platform links, live stream routes and IPTV/FAST imports into a single discovery layer. Instead of exposing a raw source list, the interface groups related routes around a watchable destination and shows a clear primary action.

Core capabilities:

- **Global media discovery** across countries, regions and international sources.
- **Watch-route grouping** for channels that have multiple possible viewing paths.
- **Internal player flow** for browser-compatible streams, with an explicit viewer-controlled start action.
- **Official route fallback** when a stream is not suitable for direct browser playback.
- **IPTV/FAST import pipeline** for large verified feed sets.
- **Multilingual interface foundation** with a compact cinematic leader and international visual direction.

## How the system is structured

MediaLens is built around four layers:

1. **Source catalog** — normalized source records for channels, platforms, live streams and external watch routes.
2. **Watch graph** — a grouped view that connects a channel or destination to all available routes.
3. **Route engine** — chooses the most appropriate primary action for the viewer: internal player, verified IPTV/FAST route, official watch page or trusted fallback.
4. **Consumer interface** — presents the result as a simple streaming product rather than a technical catalog.

This structure makes it possible to add thousands of IPTV/FAST entries while keeping the end-user experience clean and predictable.

## IPTV/FAST expansion

The included import workflow can process large live-channel feed sets and publish classified sources into the consumer interface. A full reference import processed more than **20,000 candidates** and produced approximately **14,400 visible IPTV/FAST additions**, bringing the synced catalog to **15,579 total sources** in that run.

See [IPTV/FAST import](docs/IPTV_FAST_IMPORT.md) for the workflow.

## Screenshots

| Home | Country directory | Watch routes |
| --- | --- | --- |
| ![Home](screenshots/home.png) | ![Country directory](screenshots/countries.png) | ![Watch routes](screenshots/watch.png) |

Additional visual references are available in [`screenshots/interface-references.png`](screenshots/interface-references.png).

## Quick start

```bash
npm install
npm run verify
npm run serve
```

Open `http://localhost:5173`.

For local stream compatibility support:

```bash
npm run serve:player
```

## Useful commands

```bash
npm run verify                 # Validate the release package
npm run build:watch-graph      # Rebuild grouped watch routes
npm run import:iptv-feeds      # Import and sync IPTV/FAST sources
npm run serve                  # Start the static app
npm run serve:player           # Start the local player compatibility server
```

## Documentation

- [Getting started](docs/GETTING_STARTED.md)
- [Project structure](docs/PROJECT_STRUCTURE.md)
- [Source policy](docs/SOURCE_POLICY.md)
- [IPTV/FAST import](docs/IPTV_FAST_IMPORT.md)
- [Release 1.0.0](docs/RELEASE_1_0.md)
- [Screenshots](docs/SCREENSHOTS.md)
- [Disclaimer](DISCLAIMER.md)
- [Third-party content and source data](THIRD_PARTY_CONTENT.md)

## License

MediaLens Core is licensed under the [Apache License 2.0](LICENSE).

The license applies to the MediaLens Core software, documentation, build scripts and project-owned interface assets. It does not grant rights to third-party media content, channel brands, logos, IPTV/FAST streams, broadcaster services, external platform content or third-party metadata. See [`DISCLAIMER.md`](DISCLAIMER.md), [`THIRD_PARTY_CONTENT.md`](THIRD_PARTY_CONTENT.md) and [`NOTICE`](NOTICE) for additional terms and context.
