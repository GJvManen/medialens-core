# Free-TV/IPTV recovery release gate

Merge is permitted only when all of the following are true:

- deterministic recovery regression is green;
- live source import completed from the current upstream playlist;
- web-only and DRM/DASH safety gates passed;
- all eligible direct routes were live-probed;
- approval and explicit promotion completed feed-scoped;
- release verifier is green on the promoted catalog;
- live output was inspected and final acceptance evidence recorded;
- one-shot workflow removed;
- exact final PR head has a green Verify run.
