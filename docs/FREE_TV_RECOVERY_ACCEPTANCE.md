# Free-TV/IPTV recovery acceptance checklist

This file tracks the one-time recovery acceptance of `free-tv-iptv-recovery`.

## Required gates

- source remains Tier B controlled catalogue;
- legacy source import path is not used;
- import produces zero consumer-visible candidates;
- duplicates are held;
- YouTube/Twitch/Dailymotion/Vimeo page URLs remain official-web fallbacks and are not treated as direct stream URLs;
- DRM/DASH candidates remain held and non-direct-playable;
- HTTP direct routes retain proxy-required playback policy;
- only successful live probes can be approved;
- only approved recovery candidates can reach explicit promotion;
- full release verification succeeds with catalog version `1.0.0` preserved;
- final live evidence is inspected before acceptance;
- one-shot recovery workflow is removed;
- final exact-head Verify is green before merge.

Final counts are written to `data/reports/free-tv-recovery-acceptance.json` only after the live run has been inspected.
