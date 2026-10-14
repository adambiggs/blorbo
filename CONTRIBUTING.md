# Contributing

Use Node.js 20.11 or newer. Run `npm ci && npm test`. Tests use Google Chrome
on macOS when available; otherwise install Chromium with
`npx playwright-core install chromium` or set `CHROME_PATH`.

The snapshot gate in `npm test` always uses Playwright's bundled Chromium;
[test/README.md](test/README.md) describes it.

## Release

Run `npm version patch`, `npm version minor`, or `npm version major`. This
updates the package and lockfile, commits, and creates a `v*` tag. Push the
commit to `main`, wait for CI, check `npm pack --dry-run`, then push the tag.
The release workflow tests and publishes with npm trusted
publishing and provenance. Its npm binding is `adambiggs/blorbo` with workflow
filename `release.yml` and direct publish permission. An already-published
version is skipped.
