# Getting started

MediaLens Core runs as a static web application with optional local player compatibility support for streams that need preparation before browser playback.

## Requirements

- Node.js 18 or newer
- A modern browser such as Chrome, Safari, Edge or Firefox

## Install and verify

```bash
npm install
npm run verify
```

## Run the interface

```bash
npm run serve
```

Open `http://localhost:5173`.

## Optional local player server

Some IPTV/FAST streams use formats that browsers cannot open directly. The optional local player server prepares selected streams for the MediaLens player flow.

```bash
npm run serve:player
```

The app remains useful without this server. When direct playback is not available, MediaLens shows an official or trusted watch route instead of a misleading play button.
