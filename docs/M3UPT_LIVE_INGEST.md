# M3UPT controlled live ingest — accepted

M3UPT is the first P1 controlled source processed after completion of the normal TDTChannels backlog. Its live ingest was accepted on 2026-08-20 after a full source-specific import, safety, probe, approval, publication and release-verification cycle.

## Source basis

Registry source: `m3upt`

- tier: B (`controlled_public_catalogue`)
- M3U: `https://m3upt.com/iptv`
- EPG: `https://m3upt.com/epg`
- project evidence: `https://github.com/LITUATUI/M3UPT`
- project policy: free/legal playlist, public and official streams only
- MediaLens auto-publish: disabled
- consumer visibility at import: disabled

## Per-feed isolation

M3UPT exposed a multi-source operational requirement: completed TDTChannels candidates remain stored as evidence, so probe, approval and promotion must never implicitly reconsider every historical source.

The source-expansion probe, approval and promotion commands now accept `--feed=<id>`. The M3UPT production run used `--feed=m3upt` at every operational stage. A deterministic regression test proves that an M3UPT run does not mutate the TDTChannels fixture candidate.

## DRM/DASH safety

M3UPT contains HLS, radio/audio streams, nested playlists and DRM/DASH entries.

MediaLens keeps `.mpd`, Widevine, PlayReady, `license_key` and `#KODIPROP` routes non-publishable for direct playback. They retain the DRM/DASH blocked reason and `direct_playback_allowed: false`, even when another terminal gate such as duplicate detection becomes the visible review status.

In the accepted live import:

- 898 candidates were imported;
- 28 were import duplicates;
- 56 had terminal DRM/DASH review status;
- zero candidates were consumer-visible at import;
- 84 candidates were policy-blocked before a live probe;
- no normal probe backlog remained after the run.

## Metadata correction discovered during acceptance

The first fully green provisional live run was intentionally rejected during evidence inspection. M3UPT often omits `tvg-country` for international channels, and the original fallback labeled those channels as Portugal because the source market is PT. For example, CNN Brasil was incorrectly becoming PT.

That provisional catalog was discarded by resetting the branch before its live-output commit. The importer was then changed to resolve country in this order:

1. explicit `tvg-country`;
2. terminal country suffix in `tvg-id` such as `.br`, `.fr`, `.pt`;
3. source market hint only as the final fallback.

The corrected deterministic test proves that `CNNBrasil.br` becomes BR. The final live promotion report confirms CNN Brasil as BR and Euronews PT (`...fr`) as FR.

The same correction also propagates the registered M3UPT EPG URL (`https://m3upt.com/epg`) into imported candidates and promoted catalog sources.

## Accepted live result

The corrected final run produced:

- 898 candidates checked;
- 814 candidates actively live-probed;
- 707 live probe passes;
- 107 live probe failures;
- 191 candidates held in total after policy/probe evaluation;
- 707 candidates approved by the M3UPT-scoped live policy gate;
- 5 additional candidates blocked by the final publication/deduplication gate;
- **702 new M3UPT routes published**;
- `deferred_needs_probe = 0`;
- persistent global probe state increased to 1,386 terminal records;
- MediaLens catalog increased to **1,839 sources**;
- direct-player sources increased to **1,181**;
- shipping catalog version remained **1.0.0**.

Full `npm run verify` passed on the live-generated catalog, including the generic source-expansion E2E test, feed-isolation/country/EPG/DRM regression test, registry validation and release verifier.

Machine-readable acceptance evidence is stored in `data/reports/m3upt-acceptance.json`.

## Operational conclusion

The normal M3UPT live-ingest backlog is complete for the accepted upstream snapshot. Failed probes remain terminal evidence and are not automatically retried. DRM/DASH candidates remain official-fallback/review items rather than direct-player routes.

The one-shot M3UPT GitHub Actions workflow is removed before merge so `main` does not retain a stale live-ingestion trigger.

## Next source-expansion priority

The next controlled P1 source is **FreeCastHub public-iptv**, using the same feed-scoped import → safety/dedupe → live probe → approval → explicit promotion → release verification discipline.
