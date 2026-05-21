# Project structure

```txt
assets/                 Application code, styling, runtime catalog bundles and visual assets
data/                   Source data, manifests and IPTV/FAST import files
locales/                Interface translations
scripts/                Import, validation, watch-graph and player tools
screenshots/            Product screenshots and interface references
docs/                   Public project documentation
```

## Core runtime files

- `index.html` — application entry point.
- `assets/app.js` — interface, routing, player flow and interactions.
- `assets/platform.css` — visual system and responsive layout.
- `assets/starter-catalog.js` — packaged source catalog.
- `assets/imported-iptv-catalog.js` — synced IPTV/FAST runtime inputs.
- `assets/watch-graph.js` — grouped watch routes generated from the catalog.

## Core scripts

- `scripts/build-watch-graph.mjs` — builds the grouped watch graph.
- `scripts/import-iptv-feeds.mjs` — imports configured IPTV/FAST feed sources.
- `scripts/sync-approved-iptv-sources.mjs` — syncs approved and classifiable IPTV/FAST inputs into runtime data.
- `scripts/player-server.mjs` — optional local compatibility server for the player.
- `scripts/verify-release.mjs` — release validation entry point.

## Runtime model

MediaLens separates raw source data from consumer presentation:

1. Source records describe channels, platforms, stream routes and external watch pages.
2. The watch graph groups related routes around a single watch destination.
3. The route engine presents the best available primary action.
4. The interface renders a clean consumer experience for countries, channels and live sources.
