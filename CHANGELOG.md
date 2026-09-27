# Changelog

## [0.1.1] - 2026-09-27

- Signal subscriptions now run in registration order and can be removed individually.
- Content input no longer measures the page after detach when fonts finish loading.
- `createBlorbo` rejects an invalid canvas with a clear `TypeError`.
- Unsubscribing one registration no longer removes another registration of the same listener.

## [0.1.0] - 2026-09-26

- Page text and media shape a canvas glyph field; marked elements pin bodies.
- ESM and IIFE builds expose input adapters, signals, and two glyph presets.
- Adaptive spill quality keeps glyph pitch and body state stable; `still(t)`
  draws a fixed-time frame.

0.1.0 was published without a provenance attestation.

[0.1.1]: https://github.com/adambiggs/blorbo/releases/tag/v0.1.1
[0.1.0]: https://github.com/adambiggs/blorbo/releases/tag/v0.1.0
