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
