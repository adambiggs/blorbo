// SPDX-License-Identifier: Apache-2.0
export const presets = Object.freeze({
  gangline: Object.freeze({
    glyph: 'lines',
    cell: { width: 12, height: 18 },
    clickEffect: 'line',
    pinMode: 'element',
    media: 'img,video',
    maxDpr: 2,
  }),
  adambiggs: Object.freeze({
    glyph: 'blocks',
    cell: { width: 17, height: 21 },
    clickEffect: 'ring',
    pinMode: 'words',
    media: 'img',
    maxDpr: 2,
  }),
});

export function resolvePreset(preset = presets.adambiggs, overrides = {}) {
  const base = typeof preset === 'string' ? presets[preset] : preset;
  if (!base) throw new TypeError(`Unknown Blorbo preset: ${preset}`);
  return { ...base, ...overrides, cell: { ...base.cell, ...overrides.cell } };
}
