# Snapshot gates

`npm run snapshots:compare` captures the two synthetic fixtures in
`test/fixtures/`: rules and blocks, each in dark and light themes at rest,
after scroll and pointer movement, and after a click. CI runs these 12 cases.
The command builds Blorbo and uses Playwright's bundled Chromium. References
are in `test/reference/fixtures/`; use `npm run snapshots:reference -- --force`
only when the intended rendering changes. Each fixture includes pinned text,
ordinary text, and an image.

`npm run snapshots:sites` captures the same scene matrix on the Gangline and
Adam Biggs sites. It needs those checkouts beside this repository and the
Chromium version recorded in `test/reference/manifest.json`. It builds the
Adam Biggs site and writes the build log and diffs under
`.evidence/snapshots/sites/`. Set `BLORBO_GANGLINE_SITE` and
`BLORBO_ADAMBIGGS_PROJECT` for other checkout locations; set
`BLORBO_GANGLINE_SOURCE` and `BLORBO_ADAMBIGGS_SOURCE` for other source paths.
Use `npm run snapshots:sites:reference -- --force` only for an intended site
reference update.

Both gates use 960 × 640 CSS pixels at DPR 1, a fixed wall clock, scroll to
500 px, and controlled animation frames. A case passes when its per-channel
mean difference is at most 0.5 and at most 1% of pixels differ by more than 8.
The PNGs capture the canvas alone. They do not measure motion smoothness,
other browsers, or phone performance.
