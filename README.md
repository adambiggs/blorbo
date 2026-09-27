# Blorbo

Blorbo draws a canvas field behind a web page. Page content is an input to the
field: ordinary text and media move the marks out of their way, while elements
you mark with `data-blob` hold moving bodies in place. Scroll, pointer, clicks,
device orientation, theme, and optional MIDI can shape the same field.

See it on [adambig.gs](https://adambig.gs) with `presets.adambiggs` and
[gangline.ai](https://gangline.ai) with `presets.gangline`.

## Install

Run `npm install blorbo`. In a bundled site, put the canvas behind the page
content and import the ESM package:

```html example
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    :root { --glyph: 232,230,223; --ring: 255,221,0; }
    .bgfx { position: fixed; inset: 0; pointer-events: none; background: #182a35; }
    .bgfx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    main { position: relative; }
  </style>
</head>
<body>
  <div class="bgfx" aria-hidden="true"><canvas id="blorbo"></canvas></div>
  <main>
    <h1 data-blob>Content shapes the field</h1>
    <p>This paragraph clears space in it.</p>
  </main>
  <script type="module">
    import { createBlorbo, presets } from 'blorbo';

    const blorbo = createBlorbo(document.querySelector('#blorbo'), {
      preset: presets.adambiggs,
    });
  </script>
</body>
</html>
```

Call `blorbo.remeasure()` after content changes that do not resize the page,
and `blorbo.destroy()` when removing the canvas. The
[content demo](demo/content.html) shows changing content.

For a site without a bundler, use the [IIFE build](docs/guide.md#without-a-bundler).
See the [guide](docs/guide.md) for recipes and the [reference](docs/reference.md)
for every option, method, and signal.

The canvas is decorative; keep its wrapper `aria-hidden="true"`. License:
Apache-2.0.
