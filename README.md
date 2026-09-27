# Blorbo

A canvas field of soft bodies and fixed glyph cells. It reacts to page content,
scroll, pointer, click, orientation, theme, and optional MIDI input. The
simulation and renderer share one core; adapters own browser listeners and can
be detached. The included presets draw vertical rules or block glyphs.

## Install and use

```sh
npm install blorbo
```

```html
<div class="bgfx" aria-hidden="true"><canvas id="blorbo"></canvas></div>
```

```css
:root { --g1: #182a35; --g2: #254758; --g3: #142a35;
  --glyph: 232,230,223; --ring: 255,221,0; }
.bgfx { position: fixed; inset: 0; pointer-events: none;
  background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3)); }
.bgfx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
```

```js
import { createBlorbo, presets } from 'blorbo';

const blorbo = createBlorbo(document.getElementById('blorbo'), {
  preset: presets.adambiggs, // or presets.gangline
  persist: 'session',
});
```

For client-side routing, call `blorbo.remeasure()` after mounting new page
content. Call `blorbo.destroy()` when removing the canvas.

For pages without a bundler, load the IIFE build from a CDN or copy
`dist/blorbo.iife.js` into your site. It exposes `window.Blorbo`:

```html
<script src="https://cdn.jsdelivr.net/npm/blorbo@0.1.0/dist/blorbo.iife.js"></script>
<script>
  const blorbo = Blorbo.createBlorbo(document.getElementById('blorbo'), {
    preset: Blorbo.presets.adambiggs,
  });
</script>
```

The package's module API is ESM only. `blorbo/inputs` and `blorbo/presets`
expose the individual adapters and presets for bundlers. The CDN fields
select the separate IIFE build.

The host supplies the gradient and CSS variables: `--glyph` is an `r,g,b`
triplet. The block preset also reads `--glyph-gain`, `--glyph-floor`, and
`--ring`; the line preset reads `--live`. Mark content that should attract the
field with `data-blob`. `data-blob="words"` gives the block preset one body per
word and gap. Text and media outside those elements repel the field.

## Presets and signals

`presets.gangline` uses six vertical-rule glyphs, a live column pulse on
click, and video avoidance. `presets.adambiggs` uses four block glyphs, a
click ring, smaller per-word pinned bodies, and a brightness cap. Both use
the same physics and mask/spill renderer. Pass `overrides` for another site's
cell, glyph, click effect, content mode, quality settings, or signal mapping.

```js
const blorbo = createBlorbo(canvas, {
  preset: presets.adambiggs,
  overrides: {
    cell: { width: 18, height: 22 },
    clickEffect: 'line',
    mapSignals(bus) {
      const knob = bus.get('midi.cc.1') ?? 0;
      return { drift: 14 + 70 * knob, gain: 1 + 0.7 * knob };
    },
  },
});
```

For a new glyph set, pass a `glyph` object with `style: 'blocks'` or
`'lines'`, a `ramp` array (or function of `{ width, height }`), one fewer
`steps` thresholds than ramp entries, a `halo` strength per entry, and
`draw(ctx, entry, metrics)`. The draw callback paints one glyph sprite;
`metrics` contains `width`, `height`, `dpr`, `glow`, `spriteWidth`,
`spriteHeight`, and `unit`. The library calls it when sprites are built, not
on every frame. A custom `clickEffect` is a factory returning an object with
`onClick({ x, y, age, width, height, cellWidth, cellHeight })` and
`draw({ ctx, width, height, time, dt, still, over, cellWidth, cellHeight })`.
The draw callback paints above the field. The factory creates independent
state per Blorbo instance; it may also return `destroy()` for cleanup.

The signal bus is available as `blorbo.signals`, `blorbo.setSignal(name, value)`,
and `blorbo.pushSignal(name, event)`. Continuous values include `scroll` (0–1),
`scroll.px`, `scroll.velocity` (viewport heights per second), `pointer.x/y`
(0–1), `tilt.x/y` (gravity), `clock` (Unix seconds), and `midi.cc.N` (0–1).
Event queues include `click` and `midi.note`. Default adapters attach for
viewport, clock, scroll, pointer, click, orientation, MIDI, page content,
visibility, reduced motion, and theme. Passing `inputs` replaces that set;
each adapter has `attach` and `detach`, and can optionally have `update`.

MIDI access starts only after a user gesture:

```js
button.addEventListener('click', async () => {
  const enabled = await blorbo.enableMIDI();
  // The call returns false when MIDI is unavailable or permission is denied.
});
```

The MIDI adapter emits note on/off with velocity, control changes, pitch bend,
and clock ticks. Set `overrides.midiPulse = true` to turn note-on messages into
field wells. `demo/midi.html` has a CC 1 knob and note button. Orientation
permission can be requested from a host button with
`requestOrientationPermission()`; the listener itself never prompts.

## Still frames and performance

`blorbo.still(t)` draws a frame at Unix time `t` and returns the canvas. It
works for share cards and reduced-motion views. `destroy()` removes all
listeners and cancels the animation loop. Hidden pages pause, reduced-motion
changes redraw once, and theme changes rebuild glyph sprites without reading
computed style every frame. Device pixel ratio is capped at 2 by default.
For a fixed card composition, `overrides.staticBodies` replaces the wandering
bodies with `[x, y, radiusX, radiusY, weight]` entries in CSS pixels.

The default 12 ms frame budget reduces spill passes when a rolling sample
exceeds it, then restores detail after sustained spare time. Tier changes
require at least three seconds of visible animation between applied tiers.
Glyph spacing stays fixed across quality tiers.
Inspect `blorbo.stats` for frame cost and quality level. Override the budget
with `quality: { frameBudget: 10, minDwellMs: 3000 }` or disable adaptation with
`adaptive: false` for a fixed render. Custom `quality.levels` may change
`spillSteps`; each level must keep `cellScale: 1`.

## Browser support and testing

The builds target Safari 16.4+, Chrome 100+, and Firefox 100+. The runtime
test runs in headless Chromium; the integrated backgrounds have also been
measured in desktop Safari. Other browser and device combinations are not
part of a tested support matrix. MIDI needs Web MIDI and a user gesture;
orientation permission depends on the browser and host page. The canvas is
decorative and should have `aria-hidden="true"` on its wrapper, as above.

From a checkout, run `npm ci` and `npm test`. On macOS, the test uses Google
Chrome if installed. Otherwise install Playwright Chromium with
`npx playwright-core install chromium`, or set `CHROME_PATH` to a Chrome
executable.
`npm run perf` measures headless Chromium frame costs at three viewport sizes.
The visual snapshots compare two integration fixtures that live in sibling
repositories, so they are a local gate rather than part of package CI. Set
`BLORBO_GANGLINE_SITE` and `BLORBO_ADAMBIGGS_PROJECT` when those checkouts use
other paths; see [test/README.md](test/README.md) for details. Serve this
directory over HTTP to open `demo/midi.html` or `demo/phone-perf.html`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release steps and
[CHANGELOG.md](CHANGELOG.md) for the published changes.

## License

Apache-2.0. See [LICENSE](LICENSE).
