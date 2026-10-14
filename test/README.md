# Snapshot gate

`npm run snapshots:compare` captures the three synthetic fixtures in
`test/fixtures/`: rules, blocks, and shorthand, each in dark and light themes
at rest, after scroll and pointer movement, and after a click. CI runs these
18 cases.
The command builds Blorbo and uses Playwright's bundled Chromium. References
are in `test/reference/`; use `npm run snapshots:reference -- --force`
only when the intended rendering changes. Each fixture includes pinned text,
ordinary text, and an image.

The gate uses 960 × 640 CSS pixels at DPR 1, a fixed wall clock, scroll to
500 px, and controlled animation frames. A case passes when its per-channel
mean difference is at most 0.5 and at most 1% of pixels differ by more than 8.
The PNGs capture the canvas alone. They do not measure motion smoothness,
other browsers, or phone performance.
