# Vendored playback library

`hls.min.js` is bundled so supported browsers can play HLS/IPTV streams through Media Source Extensions without requiring a separate package install for normal local use.

To refresh the vendored file from an installed dependency:

```bash
cp node_modules/hls.js/dist/hls.min.js assets/vendor/hls.min.js
```
