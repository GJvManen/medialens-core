# FreeCastHub controlled live ingest

FreeCastHub public-iptv is the next P1 controlled catalogue after completion of TDTChannels and M3UPT.

## Source basis

Registry source: `freecasthub-public-iptv`

- tier: B (`controlled_public_catalogue`)
- playlist: `https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u`
- project evidence: `https://github.com/freecasthub/public-iptv`
- project inclusion policy: free, legal, publicly available, official broadcaster streams
- explicit exclusions: paid/subscription, pirated/unauthorized, premium geo-restricted, adult and unofficial third-party streams
- MediaLens auto-publish: disabled
- consumer visibility at import: disabled

## FreeCastHub-specific safeguards

The upstream list mixes HLS and DASH/MPD routes and often omits explicit country metadata. MediaLens therefore applies these additional acceptance rules:

- `.mpd`, Widevine, PlayReady, `license_key` and `#KODIPROP` candidates are held for official fallback and never directly published;
- duplicate routes are blocked before probing when possible and again at final promotion;
- missing country metadata is not guessed; such candidates remain `international` and promote as `Internationaal`;
- HTTP routes may only promote with the existing proxy-required playback policy;
- only successful live probes may reach `live_policy_gate` approval;
- publication requires a separate explicit promotion write;
- catalog version `1.0.0` must remain unchanged.

A deterministic FreeCastHub regression test verifies duplicate blocking, international-country handling and MPD/DASH safety.

## Accepted live run — 2026-08-20

The feed-scoped production run completed successfully and was accepted for exact-head verification.

- 108 candidates imported;
- 0 consumer-visible at import;
- 17 import duplicates;
- 3 DRM/DASH holds;
- 88 candidates actively live-probed;
- 63 live probes passed;
- 25 live probes failed;
- 63 candidates approved and 45 held;
- 63 candidates passed promotion and were published;
- 0 additional final promotion duplicates;
- persisted probe-state increased to 1,474 records;
- release verification passed with catalog version `1.0.0` preserved;
- resulting catalog: 1,902 sources, including 1,244 direct-player sources.

Inspection confirmed that unknown country metadata remains `Internationaal` rather than being guessed. Real upstream MPD entries such as BBC Persian remained `needs_drm_official_fallback`, direct playback was disabled, the probe was skipped by policy and approval remained held.

Machine-readable evidence is stored in `data/reports/freecasthub-acceptance.json`.

## Live acceptance flow

1. snapshot existing terminal probe state;
2. import only `freecasthub-public-iptv`;
3. validate zero import-time consumer visibility and DRM/DASH holds;
4. live-probe only eligible FreeCastHub candidates;
5. approve only FreeCastHub candidates;
6. promote only FreeCastHub `live_policy_gate` candidates;
7. run full `npm run verify`;
8. commit candidate evidence, probe state, reports and catalog output only after verification passes;
9. inspect the generated output and record acceptance evidence;
10. remove the one-shot live workflow;
11. require a fresh exact-head Verify before merge.
