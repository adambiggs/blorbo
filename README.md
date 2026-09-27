# Blorbo

Blorbo draws a canvas background shaped by page content. Elements marked
`data-blob` attract soft bodies; other text and images clear space in the glyph
grid. Scroll, pointer, clicks, orientation, theme, and optional MIDI also affect it.

## Install and use

```sh
npm install blorbo
```

```html
<div class="bgfx" aria-hidden="true"><canvas id="blorbo"></canvas></div>
<main>
  <h1 data-blob>Content shapes the background</h1>
  <p>This paragraph pushes the field aside.</p>
</main>
```

```css
:root { --glyph: 232,230,223; --ring: 255,221,0; }
.bgfx { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(135deg, #182a35, #254758, #142a35); }
.bgfx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
main { position: relative; z-index: 1; }
```

```js
import { createBlorbo, presets } from 'blorbo';

const blorbo = createBlorbo(document.getElementById('blorbo'), {
  preset: presets.adambiggs,
});
```

Call `blorbo.remeasure()` after client-side content changes and
`blorbo.destroy()` when removing the canvas. The
[content demo](https://github.com/adambiggs/blorbo/blob/main/demo/content.html)
adds and removes text while the field runs.

By default, `persist: 'session'` restores recent cursor, mask, and click state
from `sessionStorage`; pass `persist: false` to disable it.

Without a bundler, load `dist/blorbo.iife.js` from a CDN or copy it into the
site. It exposes `window.Blorbo`:

```html
<script src="https://cdn.jsdelivr.net/npm/blorbo@0.1.1/dist/blorbo.iife.js"></script>
<script>
  Blorbo.createBlorbo(document.getElementById('blorbo'), {
    preset: Blorbo.presets.adambiggs,
  });
</script>
```

The module exports `createBlorbo` and `presets`; `blorbo/inputs` exports the
individual adapters. The host sets the background and CSS colours: `--glyph`
is an `r,g,b` triplet; blocks also read `--glyph-gain`, `--glyph-floor`, and
`--ring`, while rules read `--live`.

## Content and other inputs

The default `content({ pin: '[data-blob]' })` adapter measures text and the
preset's media selector (`img` or `img,video`). Unmarked content repels the
field. `data-blob` pins a body to an element; `data-blob="words"` with the
`adambiggs` preset pins one body per word and gap. Flowing content follows
scroll; fixed and sticky content stays at its screen position. The adapter
remeasures on load, resize, root size change, and font readiness. Call
`remeasure()` after DOM changes that do not resize the root.

Passing `inputs` to `createBlorbo` replaces the defaults. Include `content()`
if the custom set should still react to the page. Each adapter has `attach`,
`detach`, and optionally `update`. The defaults are content, viewport, clock,
scroll, pointer, click, orientation, MIDI, visibility, reduced motion, and
theme.

`blorbo.signals` is the bus. `setSignal(name, value)` sets continuous values;
`pushSignal(name, event)` queues events. Continuous names include `scroll`
(0–1), `scroll.px`, `scroll.velocity` (viewport heights per second),
`pointer.x/y` (0–1), `tilt.x/y`, `clock` (Unix seconds), and `midi.cc.N`
(0–1). Events include `click` and `midi.note`.
For host events, `signals.subscribe(name, listener)` returns an unsubscribe
function; `signals.unsubscribe(name, listener)` removes one registration of
that listener. `signals.emit(name, value)` calls listeners in registration order.

Call `blorbo.enableMIDI()` from a user gesture; it returns `false` if MIDI is
unavailable or denied. The adapter emits notes, controls, pitch bend, and
clock ticks. `overrides.midiPulse = true` turns note-on messages into wells.
On browsers that require orientation permission, call the exported
`requestOrientationPermission()` from a host button.

## Presets and rendering

`presets.gangline` draws six vertical-rule glyphs, pulses a column on click,
and avoids videos. `presets.adambiggs` draws four block glyphs, a click ring,
per-word pins, and a brightness cap. Pass `overrides` for cell dimensions,
glyphs, click effect, content mode, quality, or signal mapping:

```js
createBlorbo(canvas, {
  preset: presets.adambiggs,
  overrides: {
    cell: { width: 18, height: 22 },
    mapSignals(bus) {
      return { drift: 14 + 70 * (bus.get('midi.cc.1') ?? 0) };
    },
  },
});
```

A custom `glyph` supplies `style`, a `ramp` (array or function of cell size),
`steps` (one fewer than ramp entries), one `halo` value per entry, and
`draw(ctx, entry, metrics)`. `metrics` has cell size, DPR, glow, sprite size,
and unit. A custom `clickEffect` factory returns `onClick(...)` and `draw(...)`
callbacks and may return `destroy()`. The factory runs once per instance.

`blorbo.still(t)` returns a frame at Unix time `t`. For cards,
`overrides.staticBodies` accepts `[x, y, radiusX, radiusY, weight]` entries in
CSS pixels. `destroy()` removes listeners and cancels animation. Hidden pages
pause; reduced motion draws a still frame. DPR is capped at 2 by default.

Adaptive quality samples frame cost against a 12 ms budget and changes spill
passes after at least three seconds of visible animation; glyph pitch and body
state stay fixed. Read `blorbo.stats` for frame cost and tier. Configure
`overrides.quality.frameBudget`, `minDwellMs`, or `levels` (with `spillSteps` and
`cellScale: 1`), or set `overrides.adaptive = false`.

## Browser support and tests

The runtime suite uses Chromium; the integrated sites have also been measured
in desktop Safari. Firefox and mobile browsers have not been tested. MIDI
requires Web MIDI and a user gesture. The canvas is decorative; keep its
wrapper `aria-hidden="true"`.

Run `npm ci && npm test` for unit and Chromium runtime tests. On macOS the
runtime uses Google Chrome if installed; otherwise run
`npx playwright-core install chromium` or set `CHROME_PATH`. Run
`npm run snapshots:compare` for the 12 synthetic fixture frames used in CI;
it uses Playwright's bundled Chromium. The real-site gate needs sibling
Gangline and Adam Biggs checkouts: run `npm run snapshots:sites` before a
release. `npm run perf` measures frame cost at three viewport sizes. See
[test/README.md](https://github.com/adambiggs/blorbo/blob/main/test/README.md)
for paths and overrides.

See [CONTRIBUTING.md](CONTRIBUTING.md) for release steps. License: Apache-2.0.
