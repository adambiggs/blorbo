# Living Field

A canvas field of soft bodies and fixed glyph cells. It reacts to page content,
scroll, pointer, click, orientation, theme, and optional MIDI input. The
simulation and renderer share one core; adapters own browser listeners and can
be detached. The Gangline and Adam Biggs presets reproduce their original
backgrounds.

## Install and use

```sh
npm install living-field
```

```html
<div class="bgfx" aria-hidden="true"><canvas id="field"></canvas></div>
```

```css
.bgfx { position: fixed; inset: 0; pointer-events: none;
  background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3)); }
.bgfx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
```

```js
import { createField, presets } from 'living-field';

const field = createField(document.getElementById('field'), {
  preset: presets.adambiggs, // or presets.gangline
  persist: 'session',
});

// On a client-side route change, after its new content has been mounted:
field.remeasure();
// When removing the canvas:
field.destroy();
```

The package also includes `dist/living-field.iife.js` for pages without a
bundler. It exposes `window.LivingField`. Load it before a script that calls
`LivingField.createField(canvas, { preset: LivingField.presets.gangline })`.

## Updating the two sites

The current integrations vendor built files because this package is not yet
published. Gangline has no bundler: its page loads a copy of the IIFE, then
`site/field.js` initializes it. GitHub Pages hashes both script URLs when it
assembles the site. Adam Biggs imports a copy of the ESM build from
`src/components/Field.astro`; Astro bundles it for the deployed page. Its
standalone share-card source loads a copy of the IIFE from `public/`.

After a library change, run `npm run build` here, then copy
`dist/living-field.iife.js` to `gangline/site/living-field.iife.js` and
`adambiggs/public/living-field.iife.js`, and `dist/living-field.js` to
`adambiggs/src/lib/living-field.js`. Check the copied files' hashes, run the
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
const field = createField(canvas, {
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
state per field instance; it may also return `destroy()` for cleanup.

The signal bus is available as `field.signals`, `field.setSignal(name, value)`,
and `field.pushSignal(name, event)`. Continuous values include `scroll` (0–1),
`scroll.px`, `scroll.velocity` (viewport heights per second), `pointer.x/y`
(0–1), `tilt.x/y` (gravity), `clock` (Unix seconds), and `midi.cc.N` (0–1).
Event queues include `click` and `midi.note`. Default adapters attach for
viewport, clock, scroll, pointer, click, orientation, MIDI, page content,
visibility, reduced motion, and theme. Passing `inputs` replaces that set;
each adapter has `attach` and `detach`, and can optionally have `update`.

MIDI access starts only after a user gesture:

```js
button.addEventListener('click', async () => {
  const enabled = await field.enableMIDI();
  // The call returns false when MIDI is unavailable or permission is denied.
});
```

The MIDI adapter emits note on/off with velocity, control changes, pitch bend,
and clock ticks. Set `overrides.midiPulse = true` to turn note-on messages into
field wells. `demo/midi.html` has a CC 1 knob and note button. Orientation
permission can be requested from a host button with
`requestOrientationPermission()`; the listener itself never prompts.

## Still frames and performance

`field.still(t)` draws a frame at Unix time `t` and returns the canvas. It
works for share cards and reduced-motion views. `destroy()` removes all
listeners and cancels the animation loop. Hidden pages pause, reduced-motion
changes redraw once, and theme changes rebuild glyph sprites without reading
computed style every frame. Device pixel ratio is capped at 2 by default.
For a fixed card composition, `overrides.staticBodies` replaces the wandering
bodies with `[x, y, radiusX, radiusY, weight]` entries in CSS pixels.

The default 12 ms frame budget reduces spill passes when a rolling sample
exceeds it, then restores detail after sustained spare time. Glyph spacing
stays fixed across quality tiers.
Inspect `field.stats` for frame cost and quality level. Override the budget
with `quality: { frameBudget: 10 }` or disable adaptation with
`adaptive: false` for a fixed render.

Run `npm run snapshots:compare` for original-site references,
`FIELD_CANDIDATE=1 npm run snapshots:compare` for the bundled library on both
site pages, and `npm run perf` for headless Chromium frame costs. See
`test/README.md` for the visual tolerance and fixture limits. Serve this
directory over HTTP to open `demo/midi.html` or `demo/phone-perf.html`.

## License

Apache-2.0. See [LICENSE](LICENSE).
