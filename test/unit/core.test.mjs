import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../../src/core.js';
import { createBlorbo, presets, viewport } from '../../src/index.js';
import { createSignalBus } from '../../src/signals.js';
import { FakeCanvas, FakeDocument } from './support/fakes.mjs';

function coreFixture(preset = presets.gangline) {
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document);
  const bus = createSignalBus();
  const core = createCore(canvas, { preset, bus });
  core.resize(480, 320, 1);
  return { canvas, bus, core };
}

function frame(fixture, index) {
  fixture.bus.set('clock', 1000 + index / 60);
  fixture.bus.set('scroll.px', index * 11);
  fixture.canvas.draws.length = 0;
  fixture.core.draw(1 / 60);
  return fixture.canvas.draws.map((item) => [...item]);
}

test('fixed body seed and signal sequence produce the same simulated frames', () => {
  const a = coreFixture(), b = coreFixture();
  for (let i = 0; i < 24; i++) assert.deepEqual(frame(a, i), frame(b, i), `frame ${i}`);
  assert.deepEqual(a.core.snapshot(), b.core.snapshot());
  a.core.destroy(); b.core.destroy();
});

test('still(t) uses fixed time and returns the canvas', () => {
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document);
  const blorbo = createBlorbo(canvas, { inputs: [], persist: false });
  const once = blorbo.still(1000);
  const first = canvas.draws.map((item) => [...item]);
  canvas.draws.length = 0;
  const twice = blorbo.still(1000);
  assert.equal(once, canvas);
  assert.equal(twice, canvas);
  assert.deepEqual(canvas.draws, first);
  assert.equal(blorbo.signals.get('clock'), undefined);
  blorbo.destroy();
  assert.equal(document.defaultView.raf.size, 0);
});

test('all quality tiers retain glyph pitch, canvas dimensions, and content mask', () => {
  const fixture = coreFixture(), baseline = coreFixture();
  const content = { flowText: [{ l: 50, t: 40, r: 180, b: 80 }] };
  fixture.core.setContent(content);
  baseline.core.setContent(content);
  frame(fixture, 0);
  frame(baseline, 0);
  const mask = fixture.core.snapshot().mask.mask;
  assert.ok([...atob(mask)].some((byte) => byte.charCodeAt(0) > 0));
  const writes = fixture.canvas.widthWrites;
  const widths = new Set();
  for (const [index, passes] of [18, 12, 8, 5].entries()) {
    fixture.core.setQuality(1, passes);
    const draws = frame(fixture, index + 1);
    frame(baseline, index + 1);
    assert.ok(draws.length);
    for (const draw of draws) widths.add(draw[2]);
    assert.ok(fixture.core.snapshot().mask.mask === baseline.core.snapshot().mask.mask);
  }
  assert.deepEqual([...widths], [24]);
  assert.equal(fixture.canvas.widthWrites, writes);
  assert.throws(() => fixture.core.setQuality(1.2, 8), /preserve cell size/);
  fixture.core.destroy(); baseline.core.destroy();
});

test('a quality change preserves spring motion', () => {
  const baseline = coreFixture(), tiered = coreFixture();
  for (let i = 0; i < 42; i++) {
    if (i === 12) tiered.core.setQuality(1, 12);
    if (i === 24) tiered.core.setQuality(1, 8);
    if (i === 36) tiered.core.setQuality(1, 5);
    assert.deepEqual(frame(tiered, i), frame(baseline, i), `body trace at frame ${i}`);
  }
  baseline.core.destroy(); tiered.core.destroy();
});

test('viewport events resize only when dimensions or DPR change', () => {
  const document = new FakeDocument();
  const canvas = new FakeCanvas(document);
  const window = document.defaultView;
  const blorbo = createBlorbo(canvas, { inputs: [viewport()], overrides: { adaptive: false }, persist: false });
  window.frame();
  assert.equal(canvas.widthWrites, 1);
  window.dispatchEvent(new Event('resize'));
  window.frame();
  window.observers[0].fire();
  window.frame();
  assert.equal(canvas.widthWrites, 1);
  window.devicePixelRatio = 2;
  window.dispatchEvent(new Event('resize'));
  window.frame();
  assert.equal(canvas.widthWrites, 2);
  window.innerWidth = 520;
  window.dispatchEvent(new Event('resize'));
  window.frame();
  assert.equal(canvas.widthWrites, 3);
  blorbo.destroy();
  assert.equal(window.count('resize'), 0);
  assert.ok(window.observers.every((observer) => observer.disconnected));
});
