# Changelog

## [0.1.2] - 2026-09-27

- Rewrote the README and added a guide and API reference.
- CI executes the documentation examples.
- Clarified that the gangline preset measures images and videos as media.

## [0.1.1] - 2026-09-27

- Added signal-bus `subscribe`, `unsubscribe`, and `emit`. Listeners run in
  registration order; each unsubscribe removes one registration, including
  when the same listener is subscribed more than once.
- Content input no longer measures the page after detach when fonts finish loading.
- `createBlorbo` rejects an invalid canvas with a clear `TypeError`.

## [0.1.0] - 2026-09-26

- Page text and media shape a canvas glyph field; marked elements pin bodies.
- ESM and IIFE builds expose input adapters, signals, and two glyph presets.
- Adaptive spill quality keeps glyph pitch and body state stable; `still(t)`
  draws a fixed-time frame.

0.1.0 was published without a provenance attestation.

[0.1.2]: https://github.com/adambiggs/blorbo/releases/tag/v0.1.2
[0.1.1]: https://github.com/adambiggs/blorbo/releases/tag/v0.1.1
[0.1.0]: https://github.com/adambiggs/blorbo/releases/tag/v0.1.0
