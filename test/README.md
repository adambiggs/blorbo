# Field reference frames

These PNGs capture the canvas alone from the current Gangline and Adam Biggs
sites. They cover dark and light themes at 960 × 640 CSS pixels and DPR 1, with
a fixed wall clock, instant scroll to 500 px, pointer, and click sequence. The
harness controls animation frames and waits for fonts and media metadata.
Gangline's unrelated demo controls are held fixed during capture.

Run `npm run snapshots:compare` here; it first builds the Adam Biggs site and
stores the build output in `.evidence/snapshots/baseline/astro-build.log`. The
comparison writes metrics and any diff PNGs to `.evidence/snapshots/baseline/`.
`npm run snapshots:reference -- --force`
replaces the checked-in references deliberately. The reference manifest
records source hashes and the Chromium version used to make them.

To compare integration worktrees, set `FIELD_GANGLINE_SITE` to the Gangline
site directory and `FIELD_ADAMBIGGS_PROJECT` to the Astro project root. Set
`FIELD_GANGLINE_SOURCE` and `FIELD_ADAMBIGGS_SOURCE` if their source files are
elsewhere; these paths are used only for manifest hashes.

Set `FIELD_CANDIDATE=1` with `snapshots:compare` to load the library onto
the original site pages in place of their existing field scripts. This keeps
the same foreground content while checking the new renderer, before either
site is integrated.
Candidate metrics and diff PNGs go to `.evidence/snapshots/candidate/`.

The PNGs show the field marks, not the page gradient or foreground content.
Chromium's canvas output may differ slightly between runs; compare uses a
per-channel mean difference limit of 0.5 and permits at most 1% of pixels to
differ by more than 8. Visual inspection is still needed when comparing a
new renderer, especially near text and media edges. This harness does not
measure motion smoothness, browser portability, or phone performance.
