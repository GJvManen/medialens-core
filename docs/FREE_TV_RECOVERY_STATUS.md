# Free-TV/IPTV recovery status

Preflight is complete. The recovery branch is ready for pull-request-triggered verification and live ingest.

Current controls before live execution:

- source-expansion only; legacy importer not used;
- feed-scoped operations;
- zero import-time publication;
- duplicate blocking;
- official-web fallback for YouTube/Twitch/Dailymotion/Vimeo;
- DRM/DASH direct-playback hold;
- HTTP proxy requirement;
- deterministic regression coverage;
- explicit approval and promotion gates;
- exact-head CI required before merge.
