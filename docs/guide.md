# Guide

## Pin page content

Mark an element with `data-blob` to anchor a body. With the
`adambiggs` preset, `data-blob="words"` anchors a body to each word and gap.
Unmarked text and selected media clear space. A custom `pin` selector can
mark other elements. After inserting text without resizing the page, call
`remeasure()`:

```js example
import { createBlorbo, content, presets } from 'blorbo';

const field = createBlorbo(document.querySelector('#blorbo'), {
  preset: presets.adambiggs,
  inputs: [content({ pin: '[data-field-pin]' })],
  persist: false,
});
const heading = document.createElement('h2');
heading.setAttribute('data-field-pin', '');
heading.textContent = 'A new heading';
document.querySelector('main').append(heading);
field.remeasure();
```

`inputs` replaces the built-in adapters. Include the adapters you need, or
omit `inputs` for all defaults. See [the content demo](../demo/content.html)
for a page that adds and removes content.

## Customize a preset

Use `overrides` for a site-specific field. `cell` merges by dimension; other
preset fields are replaced.

```js example
import { createBlorbo, presets } from 'blorbo';

const field = createBlorbo(document.querySelector('#blorbo'), {
  preset: presets.adambiggs,
  overrides: {
    cell: { width: 18, height: 22 },
    mapSignals(bus) {
      return { drift: 14 + 70 * (bus.get('midi.cc.1') ?? 0) };
    },
  },
});
```

You can also pass a complete preset object as `preset`. Start with a copy of
`presets.adambiggs` or `presets.gangline` so required fields remain present.

## Without a bundler

The IIFE build exposes `window.Blorbo`. Load it before the script that creates
the field. The canvas needs the same fixed wrapper and page stacking shown in
the [README](../README.md#install).

```html example
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    :root { --glyph: 233,238,247; --live: 255,221,0; }
    .bgfx { position: fixed; inset: 0; pointer-events: none; background: #142a35; }
    .bgfx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    main { position: relative; }
  </style>
</head>
<body>
  <div class="bgfx" aria-hidden="true"><canvas id="blorbo"></canvas></div>
  <main><h1 data-blob>Live page content</h1></main>
  <script src="https://cdn.jsdelivr.net/npm/blorbo/dist/blorbo.iife.js"></script>
  <script>
    window.field = Blorbo.createBlorbo(document.querySelector('#blorbo'), {
      preset: Blorbo.presets.gangline,
    });
  </script>
</body>
</html>
```

The same build can be copied into your site from `dist/blorbo.iife.js`.

## Rendering and motion

The canvas needs a page background; Blorbo only paints its marks. CSS colour
variables control the ink and click effect. Keep the decorative wrapper
`aria-hidden="true"`.

Hidden pages pause. When `prefers-reduced-motion: reduce` is active, Blorbo
draws a still frame and stops its animation loop; it requests a new frame when
that preference changes. `still(t)` draws at a chosen Unix time in seconds.
Adaptive quality changes spill passes after sustained frame cost; glyph pitch
and body state remain fixed. Set `overrides.adaptive = false` to disable this,
or configure `overrides.quality` in the [reference](reference.md#preset-fields-and-overrides).
