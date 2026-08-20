# M3UPT controlled live ingest

M3UPT is the next P1 controlled source after completion of the normal TDTChannels backlog.

## Source basis

Registry source: `m3upt`

- tier: B (`controlled_public_catalogue`)
- M3U: `https://m3upt.com/iptv`
- EPG: `https://m3upt.com/epg`
- project evidence: `https://github.com/LITUATUI/M3UPT`
- project policy: free/legal playlist, public and official streams only
- MediaLens auto-publish: disabled
- consumer visibility at import: disabled

## M3UPT-specific safeguards

M3UPT may include HLS, radio/audio streams, nested playlists, geo-variable routes and DRM/DASH entries. MediaLens therefore applies the normal source-expansion gates plus an explicit DRM/DASH rule:

- `.mpd`, Widevine, PlayReady, `license_key` and `#KODIPROP` candidates are held as `needs_drm_official_fallback`;
- those candidates receive `direct_playback_allowed: false` and are not live-probed or approved for direct publication;
- duplicate routes remain blocked;
- only successful live probes from the Tier-B source may reach `live_policy_gate` approval;
- publication requires a separate explicit promotion write;
- catalog version `1.0.0` must remain unchanged.

## Per-feed isolation

M3UPT is the first source processed after a completed source remains in `data/candidates`. Probe, approval and promotion therefore support `--feed=<id>` and the production workflow uses `--feed=m3upt` at every operational stage.

This prevents historical TDTChannels candidates from being reprocessed, counted or reconsidered during M3UPT acceptance.

A deterministic feed-scope regression test verifies that an M3UPT run does not mutate the TDTChannels fixture candidate.

## Live acceptance flow

1. snapshot existing terminal probe state;
2. import only `m3upt`;
3. validate zero import-time consumer visibility and DRM/DASH holds;
4. live-probe only M3UPT candidates;
5. approve only M3UPT candidates;
6. promote only M3UPT `live_policy_gate` candidates;
7. run full `npm run verify`;
8. commit candidate evidence, probe state, reports and catalog output only after verification passes;
9. inspect the bot output and record acceptance evidence;
10. require a fresh exact-head Verify before merge.

The one-shot live workflow must be removed after successful acceptance so `main` does not retain a stale automatic ingestion trigger.
