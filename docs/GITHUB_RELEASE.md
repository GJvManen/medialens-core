# GitHub release

This repository package is prepared as **MediaLens Core 1.0.0**.

## Upload to the GitHub repository

Use the empty repository:

```bash
git clone https://github.com/GJvManen/medialens-core.git
cd medialens-core
rsync -a --delete /path/to/medialens_core_v1_0/ ./
git add .
git commit -m "Release MediaLens Core 1.0.0"
git tag -a v1.0.0 -m "MediaLens Core 1.0.0"
git push origin main --tags
```

## Upload from the supplied Git bundle

```bash
git clone medialens-core-v1.0.0.bundle medialens-core
cd medialens-core
git remote add origin https://github.com/GJvManen/medialens-core.git
git push -u origin main --tags
```

## Create the GitHub release

```bash
gh release create v1.0.0   --repo GJvManen/medialens-core   --title "MediaLens Core 1.0.0"   --notes-file docs/RELEASE_1_0.md
```

## Verify after upload

```bash
npm install
npm run verify
```

Optional full IPTV/FAST import:

```bash
npm run import:iptv-feeds
npm run verify
```
