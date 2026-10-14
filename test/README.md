# Snapshot gate

`npm run snapshots:compare` builds Blorbo and captures each fixture in
`test/fixtures/` in dark and light themes at rest, after scroll and pointer
movement, and after a click. Each fixture includes pinned text, ordinary text,
and an image. The gate uses Playwright's bundled Chromium, which must match the
version in `test/reference/manifest.json`. References are in
`test/reference/`; run `npm run snapshots:reference -- --force` only when the
intended rendering changes.

Captures use 960 × 640 CSS pixels at DPR 1, a fixed wall clock, scroll to
500 px, and controlled animation frames. A case passes when its per-channel
mean difference is at most 0.5 and at most 1% of pixels differ by more than 8.
Diffs of changed cases are written to `test-results/snapshots/`.
