# Contributing

Use Node.js 20.11 or newer. Install dependencies with `npm ci`, then run
`npm test`. The test builds both bundles and exercises the browser runtime in
headless Chromium. On macOS it uses Google Chrome if installed. Otherwise run
`npx playwright-core install chromium`; set `CHROME_PATH` to use another Chrome
executable.

`npm run snapshots:compare` is a local visual gate. It needs the Gangline and
Adam Biggs site checkouts beside this repository and a matching Chromium
version for the checked-in reference frames. Set `BLORBO_GANGLINE_SITE` to a
site directory and `BLORBO_ADAMBIGGS_PROJECT` to an Astro project root if
they are elsewhere. The reference frames, tolerance, and fixture limitations
are in [test/README.md](test/README.md). The snapshots stay out of CI because
they depend on those separate site trees and an exact browser version. CI runs
the standalone runtime test instead.

To change a preset or rendering behavior, add a runtime assertion that checks
the behavior, then run the local visual gate against both sites. Keep the
bundled files reproducible with `npm run build`. Check the consumer tarball
with `npm pack --dry-run` before a release.

## Releases

Keep [CHANGELOG.md](CHANGELOG.md) up to date. `npm version patch`,
`npm version minor`, or `npm version major` updates the package and lockfile,
creates a commit, and creates a `v*` tag. Push the version commit to `main`,
wait for CI, then push the tag. The tag workflow builds, tests, and publishes
through npm trusted publishing with provenance. In npm package settings, set
the GitHub user to `adambiggs`, repository to `blorbo`, workflow filename to
`release.yml`, and allow direct `npm publish`.

For the first publish, npm needs the package to exist before its trusted
publisher can be configured. From a clean checkout of the version commit, run
`npm ci`, `npm test`, and `npm pack --dry-run`. Check that `git status --porcelain`
is empty, then tag that commit `v0.1.0`. Publish that same checkout once with
an authenticated local `npm publish --access public`. Configure the trusted
publisher in npm package settings with workflow filename `release.yml`, then
push the tag. The tag workflow checks the registry and skips a version already
published. Version 0.1.0 predates provenance; versions 0.1.1 and later publish
with provenance from the tag workflow.
