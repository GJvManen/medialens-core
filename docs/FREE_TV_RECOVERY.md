# Free-TV/IPTV controlled recovery

Free-TV/IPTV is reintroduced only through the strict source-expansion pipeline. The historical legacy import path is not used for this recovery.

## Source basis

Registry source: `free-tv-iptv-recovery`

- tier: B (`controlled_public_catalogue`)
- playlist: `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`
- project evidence: `https://github.com/Free-TV/IPTV/blob/master/README.md`
- project policy: free channels only; no paid channels; only channels officially provided for free
- project policy also excludes adult content and other non-mainstream categories listed by the upstream project
- MediaLens auto-publish: disabled
- consumer visibility at import: disabled

## Recovery-specific safeguards

The upstream playlist mixes direct stream manifests with HTTP routes and official web-only endpoints such as YouTube and Twitch. Recovery therefore adds a new generic source-expansion invariant:

- YouTube, Twitch, Dailymotion and Vimeo page URLs are `needs_official_web_fallback` candidates;
- web-only candidates receive `direct_playback_allowed: false`, retain `official_page_url`, are never network-probed as direct streams and cannot reach direct promotion;
- `.mpd`, Widevine, PlayReady, `license_key` and `#KODIPROP` candidates remain `needs_drm_official_fallback` and non-direct-playable;
- HTTP direct-stream candidates retain `requires_proxy: true` and may promote only through the existing proxy-required playback policy;
- duplicates are blocked before probing when possible and again at final promotion;
- explicit `tvg-country` or terminal country code in `tvg-id` is preserved; unsupported guessing is not introduced;
- only successful live probes may reach `live_policy_gate` approval;
- publication requires a separate explicit promotion write;
- catalog version `1.0.0` must remain unchanged.

A deterministic recovery regression test verifies duplicate blocking, HTTP proxy policy, web-only fallback, DRM/DASH blocking, feed isolation and promotion scoping.

## Live acceptance flow

1. snapshot existing terminal probe state;
2. import only `free-tv-iptv-recovery` from the current upstream playlist;
3. validate zero import-time visibility plus DRM/DASH and web-only fallback invariants;
4. live-probe only eligible recovery candidates;
5. approve only recovery candidates;
6. promote only recovery `live_policy_gate` candidates;
7. run full `npm run verify`;
8. commit candidate evidence, probe state, reports and catalog output only after verification passes;
9. inspect the generated output and record machine-readable acceptance evidence;
10. remove the one-shot recovery workflow;
11. require a fresh exact-head Verify before merge.

The large `x-tvg-url` header in the upstream playlist is not treated as broadcaster authority evidence and is not required for direct-stream acceptance. EPG enrichment remains a separate metadata concern.
