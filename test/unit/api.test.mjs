import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from 'blorbo';
import * as inputExports from 'blorbo/inputs';
import * as presetExports from 'blorbo/presets';
import { createCore } from '../../src/core.js';
import { resolvePreset } from '../../src/presets.js';
import { createSignalBus } from '../../src/signals.js';
import { FakeCanvas, FakeDocument } from './support/fakes.mjs';

test('package exports both presets, signal bus, and named input adapters', () => {
  assert.equal(typeof api.createBlorbo, 'function');
  assert.equal(typeof api.createSignalBus, 'function');
  assert.deepEqual(Object.keys(api.presets).sort(), ['adambiggs', 'gangline']);
  for (const name of ['clock', 'viewport', 'scroll', 'pointer', 'click', 'orientation', 'midi', 'content', 'visibility', 'reducedMotion', 'theme']) {
    assert.equal(typeof api[name], 'function', name);
    assert.equal(typeof inputExports[name], 'function', name);
  }
  assert.equal(presetExports.presets.gangline.glyph, 'lines');
  assert.equal(typeof api.requestOrientationPermission, 'function');
  assert.equal(typeof api.createSignalBus().subscribe, 'function');
});

test('preset overrides merge cell dimensions and reject invalid shapes', () => {
  const custom = resolvePreset('gangline', { cell: { width: 20 } });
  assert.deepEqual(custom.cell, { width: 20, height: 18 });
  assert.equal(api.presets.gangline.cell.width, 12);
  assert.throws(() => resolvePreset('missing'), /Unknown Blorbo preset/);
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document);
  const bus = createSignalBus();
  assert.throws(() => createCore(canvas, { preset: { ...custom, glyph: { style: 'blocks', ramp: [0, 1], steps: [], halo: [0, 0], draw() {} } }, bus }), /one fewer thresholds/);
  assert.throws(() => createCore(canvas, { preset: { ...custom, clickEffect: 'missing' }, bus }), /Unknown click effect/);
  assert.throws(() => api.createBlorbo(null), /requires a canvas/);
});

test('custom inputs attach once, receive updates, and release on idempotent destroy', async () => {
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document);
  const events = [];
  const adapter = {
    attach(context) { events.push('attach'); context.bus.set('clock', 1000); },
    update() { events.push('update'); },
    remeasure() { events.push('remeasure'); },
    detach() { events.push('detach'); },
  };
  const blorbo = api.createBlorbo(canvas, { preset: 'gangline', inputs: [adapter], overrides: { adaptive: false }, persist: false });
  blorbo.setSignal('scroll.px', 10);
  blorbo.pushSignal('click', { x: 0.5, y: 0.5, age: 0 });
  document.defaultView.frame();
  assert.ok(blorbo.stats.frames > 0);
  assert.equal(blorbo.signals.get('scroll.px'), 10);
  assert.equal(blorbo.still(1000), canvas);
  blorbo.remeasure();
  assert.equal(await blorbo.enableMIDI(), false);
  blorbo.destroy();
  blorbo.destroy();
  assert.deepEqual(events.filter((event) => event === 'detach'), ['detach']);
  assert.ok(events.includes('update'));
  assert.ok(events.includes('remeasure'));
  assert.equal(document.defaultView.raf.size, 0);
});

test('default adapters and persistence release listeners and observers on destroy', async () => {
  const originalNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  try {
    const document = new FakeDocument();
    document.elements.set('img', []);
    document.elements.set('[data-blob]', []);
    const canvas = new FakeCanvas(document);
    const blorbo = api.createBlorbo(canvas, { persist: false });
    document.defaultView.frame();
    blorbo.destroy();
    await document.fonts.ready;
    document.defaultView.assertEmpty();
    document.assertEmpty();
    for (const query of document.defaultView.queries.values()) query.assertEmpty();
    assert.ok(document.defaultView.observers.every((observer) => observer.disconnected));
    assert.equal(document.defaultView.raf.size, 0);
  } finally { globalThis.NodeFilter = originalNodeFilter; }
});
