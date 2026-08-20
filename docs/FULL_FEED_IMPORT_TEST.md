# Full-feed import test — 2026-08-20

This page records a live, non-shipping validation run of the current legacy/full-feed IPTV/FAST importer against the current MediaLens `main` catalog.

## Safety model

- the real live importer ran in an isolated temporary copy of the repository;
- the temporary `data/candidates` directory started empty, so source-expansion evidence could not inflate the legacy/full-feed counts;
- the current **2,900-source** shipping catalog was used as the dedupe baseline;
- the sync stage ran with `--dry-run` only;
- no shipping catalog file was overwritten;
- only the resulting evidence JSON was committed back to the test branch.

Machine-readable evidence is stored in:

`data/reports/full-feed-import-test-2026-08-20.json`

## Current live test result

The run successfully fetched and processed all **13 feeds** currently registered in `data/iptv/fast-feed-registry.json`.

| Metric | Result |
| --- | ---: |
| Shipping baseline | **2,900 sources** |
| Registered feeds tested | **13** |
| Candidates processed | **21,341** |
| Import duplicates blocked | **6,369** |
| Globally rebuilt visible imported sources | **13,922** |
| Feed-level eligible/visible candidates presented to sync | **14,059** |
| Sync approved inputs processed | **28,030** |
| Projected new sources from sync | **14,059** |
| Projected existing-source updates | **13,971** |
| Projected skipped inputs | **0** |
| **Projected catalog after legacy full sync** | **16,959 sources** |

The projected **16,959** is a dry-run result. It is not the current shipping catalog and the test did not publish those sources.

## Per-feed result

| Feed | Candidates | Feed-level visible/eligible | Duplicates blocked |
| --- | ---: | ---: | ---: |
| IPTV-org | 12,738 | 9,992 | 2,701 |
| Samsung TV Plus US | 539 | 536 | 1 |
| Roku Channel | 294 | 294 | 0 |
| Pluto TV US | 421 | 132 | 289 |
| LG Channels US | 450 | 91 | 54 |
| Tubi | 181 | 155 | 23 |
| Plex Watch Free | 2,818 | 939 | 1,874 |
| Vizio WatchFree+ | 433 | 380 | 4 |
| DistroTV | 336 | 325 | 7 |
| Xiaomi TV+ | 254 | 219 | 35 |
| Xumo Play | 389 | 17 | 3 |
| Local Now | 447 | 434 | 12 |
| Free-TV/IPTV | 2,041 | 545 | 1,366 |
| **Total** | **21,341** | **14,059** | **6,369** |

## Comparison with the May 2026 full-feed run

The earlier documented full-feed run reported:

- **20,670 candidates**;
- **14,432 visible IPTV/FAST additions**;
- **29,296 approved inputs** processed by sync;
- **15,579 total sources after sync**.

The new test therefore confirms that the full-feed universe has not disappeared. The current feed registry actually yielded **671 more candidates** than the May run. The difference between the current 2,900-source shipping catalog and the former 15,579-source/full-feed state is a packaging/publication-state difference, not the disappearance of the upstream feed inventory.

## Legacy dedupe/reporting discrepancy found by this test

Two current importer views differ by **137 records**:

- the per-feed candidate pass reports **14,059** visible/eligible candidates;
- `buildVisibleImportedCatalog()` rebuilds all candidate files in filename order and reports **13,922** globally visible imported sources.

The dry-run sync then processes the candidate set plus the generated imported catalog and projects **14,059 net new sources**, reaching **16,959** total sources. This is useful test evidence but also shows that the legacy importer has order-dependent duplicate/reporting behavior. The stricter source-expansion pipeline does not use this legacy bulk-publication model.

For that reason this test is evidence for catalog capacity and feed availability, not authorization to bulk-publish the projected 14,059 routes without the applicable safety, rights, DRM, probe and approval review.
