# Contributing

Use Node.js 20.11 or newer. Run `npm ci`, install Playwright's Chromium with
`npx playwright-core install chromium`, then run `npm test`. Set `CHROME_PATH`
to run the browser tests in another Chromium build.
[test/README.md](test/README.md) describes the snapshot gate.

## Release

Run `npm version patch`, `npm version minor`, or `npm version major`. This
updates the package and lockfile, commits, and creates a `v*` tag. Push the
commit to `main`, wait for CI, then push the tag. The release workflow tests,
checks the package, and publishes with npm trusted publishing and provenance.
Its npm binding is `adambiggs/blorbo` with workflow filename `release.yml` and
direct publish permission. An already-published version is skipped.
