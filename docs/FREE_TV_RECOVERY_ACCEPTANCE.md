# Free-TV/IPTV recovery acceptance

The one-time controlled recovery of `free-tv-iptv-recovery` completed successfully through the source-expansion pipeline. The legacy import path was not reactivated.

## Accepted live run

- workflow run: `32385011779`
- live output commit: `7ae01bae1c22adbb92eacf281bc83491529fa3ac`
- imported candidates: **2,041**
- consumer-visible at import: **0**
- import duplicates: **106**
- DRM/DASH holds: **22**
- official-web fallback holds: **139**
- policy-blocked before direct probing: **400**
- direct candidates live-probed: **1,641**
- live probe passes: **1,064**
- live probe failures: **577**
- deferred/unprobed backlog: **0**
- approved: **1,064**
- held: **977**
- final promotion duplicate blocks: **66**
- newly published recovery routes: **998**
- persisted terminal probe records after run: **3,115**

## Release state

- catalog version: **1.0.0**
- catalog sources: **2,900**
- direct-player sources: **2,242**
- imported IPTV inputs: **49**
- watch graph: **287 channels / 289 routes / 23 countries**

## Safety evidence

- YouTube/Twitch/Dailymotion/Vimeo pages are no longer eligible to pass the direct-stream probe simply because the web page returns HTTP 200.
- A real upstream Twitch route, **ABC News Albania**, was held as `needs_official_web_fallback` and probe-skipped by policy.
- DRM/DASH candidates remain non-direct and held for fallback handling.
- HTTP direct streams retain the proxy-required playback policy.
- deterministic recovery regression covers duplicate blocking, country preservation, HTTP proxy, web-only fallback and DRM/DASH hold.

Machine-readable acceptance evidence is stored in `data/reports/free-tv-recovery-acceptance.json`.

## Remaining merge gates

- remove the one-shot live recovery workflow;
- require a fresh green Verify on the exact final PR head;
- merge only with expected-head protection.
