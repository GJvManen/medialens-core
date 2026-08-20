# Free-TV/IPTV recovery design decisions

1. **Recovery is not legacy reactivation.** The old Free-TV candidate history remains historical evidence only. The active source is `free-tv-iptv-recovery` and uses the source-expansion gates.
2. **Web pages are not streams.** Official YouTube, Twitch, Dailymotion and Vimeo live pages are useful watch targets but must not pass a direct-stream HTTP probe merely because the page returns HTTP 200. They are held as `needs_official_web_fallback` for a later embed/player integration path.
3. **DRM/DASH remains non-direct.** MPD/license-bearing routes stay in official fallback review.
4. **HTTP direct streams remain proxy-only.** Existing `requires_proxy` behavior is retained.
5. **EPG is separate metadata.** The upstream aggregate `x-tvg-url` header is not used as broadcaster authority evidence during recovery.
6. **Publication stays explicit.** No import or probe step publishes. Only the explicit promotion write can add a route after approval.
