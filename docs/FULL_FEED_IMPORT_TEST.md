# Full-feed import test — 2026-08-20

This is a non-shipping validation run of the current legacy/full-feed IPTV/FAST importer against the current `main` catalog.

## Safety model

- the live importer runs in an isolated temporary copy of the repository;
- the temporary candidate directory starts empty, so source-expansion evidence cannot inflate the legacy/full-feed counts;
- the current shipping catalog is used as the dedupe baseline;
- the sync stage runs with `--dry-run` only;
- the shipping catalog on the PR branch is not overwritten;
- only the resulting evidence JSON is committed back to the branch.

## Test scope

The run tests every feed currently registered in `data/iptv/fast-feed-registry.json`, including IPTV-org, Samsung TV Plus, Roku, Pluto TV, LG Channels, Tubi, Plex, Vizio WatchFree+, DistroTV, Xiaomi TV+, Xumo Play, Local Now and Free-TV/IPTV.

After the live run the actual candidate, visible-import, duplicate and projected sync counts will be recorded here and in `data/reports/full-feed-import-test-2026-08-20.json`.
