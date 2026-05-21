# Architecture overview

MediaLens Core is organized as a layered streaming discovery system.

## 1. Source catalog

The source catalog stores normalized information about channels, platforms, live streams and watch pages. A source can represent a direct player route, an official platform, an IPTV/FAST stream or a trusted external watch route.

## 2. Watch graph

The watch graph groups related records into a single consumer-facing destination. This avoids presenting one channel as many unrelated entries and allows the interface to show one primary action with secondary routes.

## 3. Route engine

The route engine evaluates the available paths for a destination and chooses the clearest action for the viewer. Direct playback is preferred when a stream is suitable for browser playback; otherwise the app presents a verified IPTV/FAST route, an official watch page or a trusted fallback.

## 4. Player flow

The player flow is explicit: the viewer chooses a source, then starts playback. This prevents confusing autoplay behavior and keeps browser restrictions understandable.

## 5. IPTV/FAST pipeline

The import pipeline processes large feed sets, classifies usable entries and syncs them into runtime data. The system is designed to scale from a curated base catalog to a much larger live-channel inventory while keeping the interface consumer-friendly.
