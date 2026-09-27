# Reference

## Entry points

`blorbo` exports `createBlorbo`, `createSignalBus`, `presets`, all input adapter
factories, and `requestOrientationPermission`. `blorbo/inputs` exports the
adapters and permission helper. `blorbo/presets` exports `presets`. The IIFE
build at `dist/blorbo.iife.js` exposes the main exports as `window.Blorbo`.

## `createBlorbo(canvas, options?)`

`canvas` must be a canvas in a browser document with a 2D context. The call
starts rendering and returns an instance.

| Option | Default | Effect |
| --- | --- | --- |
| `preset` | `presets.adambiggs` | Preset object or name: `'adambiggs'`, `'gangline'`. |
| `overrides` | `{}` | Shallow overrides of preset fields; `cell` merges by width and height. |
| `inputs` | Built-in adapters | Array of adapter instances. Supplying it replaces all defaults, even when empty. |
| `persist` | `'session'` | Stores cursor, content mask, and recent clicks in `sessionStorage`. Any other value disables storage. |

The built-in input order is `viewport()`, `clock()`, `scroll()`, `pointer()`,
`click()`, `orientation()`, `midi()`, `content()`, `visibility()`,
`reducedMotion()`, and `theme()`.

### Instance

| Member | Effect |
| --- | --- |
| `signals` | Signal bus; see below. |
| `stats` | Live object: `quality` is a zero-based tier, `lastFrameMs` and `averageFrameMs` are milliseconds, `frames` is the rendered frame count. |
| `setSignal(name, value)` | Sets a continuous signal and requests a frame. |
| `pushSignal(name, event)` | Queues an event and requests a frame. |
| `enableMIDI()` | Async; call from a user gesture. Resolves `true` on access, `false` if unavailable or denied. Requires the `midi()` adapter. |
| `remeasure()` | Calls `remeasure()` on installed adapters and requests a frame. Use after DOM changes that do not resize the root. |
| `still(t?)` | Draws a still frame at Unix time `t` in seconds and returns the canvas. Default: current `clock` signal, then current Unix time. |
| `destroy()` | Cancels rendering, removes installed listeners, and saves session state. Safe to call again. |

### Preset fields and overrides

| Field | Default / units | Effect |
| --- | --- | --- |
| `glyph` | Preset value: `'blocks'` or `'lines'` | Draw style, or a custom glyph object described below. |
| `cell.width`, `cell.height` | Preset value, CSS px | Glyph pitch. |
| `clickEffect` | Preset value: `'ring'` or `'line'` | Click animation, or a factory described below. |
| `pinMode` | Preset value | `'element'` makes one pin per marked element. `'words'` splits only elements with `data-blob="words"` into words and gaps. |
| `media` | Preset value, CSS selector | Media measured by `content()`. If omitted, the adapter uses `'img'`. |
| `maxDpr` | `2` | Cap on canvas device pixel ratio. |
| `adaptive` | Enabled | Set `false` to keep the initial quality tier. |
| `quality.frameBudget` | `12` ms | Average frame cost above which quality may step down. |
| `quality.minDwellMs` | `3000` ms | Minimum visible animation time between tier changes. |
| `quality.levels` | Spill steps `18`, `12`, `8`, `5` | Ordered `{ cellScale: 1, spillSteps }` tiers. `cellScale` must be `1`; tiers retain glyph pitch. |
| `staticBodies` | None | Array of `[x, y, radiusX, radiusY, weight]` in CSS px except dimensionless weight. Replaces the wandering body field. |
| `midiPulse` | Disabled | `true` turns MIDI note-on events into wells. |
| `mapSignals(bus)` | None | Returns optional `{ drift, gain }`; drift is CSS px/s and gain scales glyph opacity. |

`presets.adambiggs` uses block glyphs, a click ring, `17 × 21` CSS px cells,
word pins, `img`, and DPR cap `2`. See it on [adambig.gs](https://adambig.gs).
`presets.gangline` uses line glyphs, a lit column on click, `12 × 18` CSS px
cells, element pins, `img,video`, and DPR cap `2`. See it on
[gangline.ai](https://gangline.ai).

A custom `glyph` has `style` (`'blocks'` or `'lines'`), `ramp` (an array or
`({ width, height }) => array`), `steps` (one fewer threshold than ramp
entries), `halo` (one strength per entry), and `draw(ctx, entry, metrics)`.
`metrics` contains `width`, `height` (CSS px), `dpr`, `glow` (CSS px),
`spriteWidth`, `spriteHeight` (device px), and `unit` (device px). Optional
`shadow` supplies per-entry strengths for dark ink on a light ground.

A custom `clickEffect` factory runs once per instance. It returns optional
`onClick({ x, y, age, width, height, cellWidth, cellHeight })`,
`draw({ ctx, width, height, time, dt, still, over, cellWidth, cellHeight })`,
and `destroy()` callbacks. Coordinates and lengths are CSS px, `age`, `time`,
and `dt` are seconds, and `still` is a boolean.

## Content input

`content({ pin = '[data-blob]' } = {})` returns an adapter. `pin` is a CSS
selector for elements that hold bodies. Ordinary visible text outside pins
repels the field. The preset's `media` selector adds media that clears space.
Text inside `script`, `style`, `noscript`, `[hidden]`, and `.bgfx` is skipped.
Flowing content follows scroll; fixed and sticky content is read in screen
coordinates. The adapter measures on DOM readiness, load, resize, root resize,
and font readiness. Call `remeasure()` after other content changes.

Custom adapters have `attach(context)`, optional `update(context, dt)`,
optional `remeasure()`, and optional `detach(context)`. `dt` is seconds.
The context contains `canvas`, `window`, `document`, `bus`, resolved `preset`,
`onContent`, `rememberClick`, and `requestRender`. If a custom `inputs` array
should still react to page content, include `content()` in it.

## Signals and events

`createSignalBus(initial = {})` returns a bus with `get(name)`,
`set(name, value)`, `push(name, event)`, and `drain(name)`. `drain` returns
and clears a queue. `subscribe(name, listener)` returns an unsubscribe function.
`unsubscribe(name, listener)` removes one registration. `emit(name, value)`
calls listeners in registration order. `set` and `push` do not call listeners;
host code calls `emit` when it needs subscriptions.

| Built-in input | Signal or event | Value |
| --- | --- | --- |
| `clock()` | `clock` | Unix seconds. |
| `viewport()` | `viewport` | `{ width, height, dpr }`; CSS px and device pixel ratio. |
| `scroll()` | `scroll`, `scroll.px`, `scroll.x`, `scroll.height`, `scroll.velocity` | Fraction `0–1`, vertical CSS px, horizontal CSS px, document CSS px, viewport heights/s. |
| `pointer()` | `pointer`, `pointer.x`, `pointer.y` | `{ x, y, present }`, plus normalized coordinates. |
| `click()` | `click` event | `{ x, y, at }`; normalized coordinates and Unix milliseconds. Restored clicks carry `age` in seconds. |
| `orientation()` | `tilt`, `tilt.x`, `tilt.y` | `{ x, y, active }`, plus axis values. |
| `midi()` | `midi.available`, `midi.enabled`, `midi.cc.N`, `midi.pitchbend`, `midi.clock`, `midi.note` event | Booleans, normalized control `0–1`, bend `-1–1`, tick count, `{ note, velocity, on, channel }`. |
| `visibility()` | `visible` | `false` when document is hidden. |
| `reducedMotion()` | `reducedMotion` | Boolean from `prefers-reduced-motion`. |
| `theme()` | `theme` | `{ ink, gain, floor, ring, live }` from CSS variables. |
| `content()` | Content measurement | Sends measurements to the renderer rather than a named signal. |

`requestOrientationPermission()` returns a promise for a boolean. Call it
from a host button on browsers that require a gesture; elsewhere it resolves
`true`.

The host supplies the background and CSS variables on `:root`. `--glyph`,
`--ring`, and `--live` are `r,g,b` channel triplets. Without `--glyph`,
blocks use `232,230,223` and lines use `233,238,247`. The fallback for
`--ring` is `255,221,0`; for `--live` it is `240,162,60`.
`--glyph-gain` scales block opacity and defaults to `1`.
`--glyph-floor` sets the faintest block opacity and defaults to `0.025`.
