# Blorbo

A canvas field of soft bodies and fixed glyph cells. It reacts to page content,
scroll, pointer, click, orientation, theme, and optional MIDI input. The
simulation and renderer share one core; adapters own browser listeners and can
be detached. The Gangline and Adam Biggs presets reproduce their original
backgrounds.

## Install and use

```sh
npm install blorbo
```

```html
<div class="bgfx" aria-hidden="true"><canvas id="blorbo"></canvas></div>
```

```css
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

// On a client-side route change, after its new content has been mounted:
blorbo.remeasure();
// When removing the canvas:
blorbo.destroy();
```

The package also includes `dist/blorbo.iife.js` for pages without a
bundler. It exposes `window.Blorbo`. Load it before a script that calls
`Blorbo.createBlorbo(canvas, { preset: Blorbo.presets.gangline })`.

## Updating the two sites

The current integrations vendor built files because this package is not yet
published. Gangline has no bundler: its page loads a copy of the IIFE, then
`site/blorbo.js` initializes it. GitHub Pages hashes both script URLs when it
assembles the site. Adam Biggs imports a copy of the ESM build from
`src/components/Blorbo.astro`; Astro bundles it for the deployed page. Its
standalone share-card source loads a copy of the IIFE from `public/`.

After a library change, run `npm run build` here, then copy
`dist/blorbo.iife.js` to `gangline/site/blorbo.iife.js` and
`adambiggs/public/blorbo.iife.js`, and `dist/blorbo.js` to
`adambiggs/src/lib/blorbo.js`. Check the copied files' hashes, run the
snapshot comparison against both sites, and commit the bundle copies with
their consumers. The sites' deployment builds cannot read this sibling
checkout, so a local `file:` dependency would not work there.

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
Glyph spacing stays fixed across quality
tiers.
Inspect `blorbo.stats` for frame cost and quality level. Override the budget
with `quality: { frameBudget: 10, minDwellMs: 3000 }` or disable adaptation with
`adaptive: false` for a fixed render. Custom `quality.levels` may change
`spillSteps`; each level must keep `cellScale: 1`.

Run `npm run snapshots:compare` to compare both integrated sites against their
reference frames, and `npm run perf` for headless Chromium frame costs. Set
`BLORBO_GANGLINE_SITE` and `BLORBO_ADAMBIGGS_PROJECT` to compare site worktrees.
See `test/README.md` for the visual tolerance and fixture limits. Serve this
directory over HTTP to open `demo/midi.html` or `demo/phone-perf.html`.

## License

Apache-2.0. See [LICENSE](LICENSE).
