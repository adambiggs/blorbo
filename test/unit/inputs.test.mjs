import test from 'node:test';
import assert from 'node:assert/strict';
import * as inputs from '../../src/inputs.js';
import { adapterContext, event, FakeDocument, rect, TrackedTarget } from './support/fakes.mjs';

function verifyDetached(input, context) {
  input.detach?.(context);
  context.window.assertEmpty();
  context.document.assertEmpty();
  for (const query of context.window.queries.values()) query.assertEmpty();
  assert.ok(context.window.observers.every((observer) => observer.disconnected));
}

test('clock updates without listeners', () => {
  const context = adapterContext();
  const input = inputs.clock();
  input.attach(context);
  assert.ok(context.bus.get('clock') > 0);
  input.update(context);
  verifyDetached(input, context);
});

test('viewport records size and DPR, then releases resize observers', () => {
  const context = adapterContext();
  let renders = 0;
  context.requestRender = () => renders++;
  const input = inputs.viewport();
  input.attach(context);
  assert.deepEqual(context.bus.get('viewport'), { width: 480, height: 320, dpr: 1 });
  context.window.devicePixelRatio = 2;
  context.window.dispatchEvent(new Event('resize'));
  assert.equal(context.bus.get('viewport').dpr, 2);
  assert.equal(renders, 2);
  verifyDetached(input, context);
});

test('scroll maps position and velocity and detaches', () => {
  const context = adapterContext();
  const input = inputs.scroll();
  input.attach(context);
  context.window.scrollY = 160;
  context.window.scrollX = 15;
  context.window.dispatchEvent(new Event('scroll'));
  input.update(context, 0.1);
  assert.equal(context.bus.get('scroll.px'), 160);
  assert.equal(context.bus.get('scroll.x'), 15);
  assert.equal(context.bus.get('scroll'), 0.25);
  assert.equal(context.bus.get('scroll.velocity'), 5);
  verifyDetached(input, context);
});

test('pointer and click map CSS coordinates and detach', () => {
  const context = adapterContext();
  const remembered = [];
  context.rememberClick = (value) => remembered.push(value);
  const pointer = inputs.pointer(), click = inputs.click();
  pointer.attach(context); click.attach(context);
  context.window.dispatchEvent(event('pointermove', { clientX: 120, clientY: 80 }));
  assert.deepEqual(context.bus.get('pointer'), { x: 0.25, y: 0.25, present: true });
  context.document.dispatchEvent(new Event('pointerleave'));
  assert.equal(context.bus.get('pointer').present, false);
  context.window.dispatchEvent(event('click', { clientX: 240, clientY: 160 }));
  assert.equal(context.bus.drain('click')[0].x, 0.5);
  assert.equal(remembered[0].y, 0.5);
  pointer.detach(context); click.detach(context);
  context.window.assertEmpty(); context.document.assertEmpty();
});

test('orientation maps angles, ignores incomplete events, and detaches', () => {
  const context = adapterContext();
  const input = inputs.orientation();
  input.attach(context);
  context.window.dispatchEvent(event('deviceorientation', { beta: null, gamma: 10 }));
  assert.equal(context.bus.get('tilt'), undefined);
  context.window.dispatchEvent(event('deviceorientation', { beta: 0, gamma: 30 }));
  assert.ok(Math.abs(context.bus.get('tilt.x') - 0.5) < 1e-12);
  assert.equal(context.bus.get('tilt.y'), 0);
  verifyDetached(input, context);
});

test('visibility, reduced motion, and theme update on events and detach', () => {
  const context = adapterContext();
  let renders = 0;
  context.requestRender = () => renders++;
  const visibility = inputs.visibility(), reduced = inputs.reducedMotion(), theme = inputs.theme();
  visibility.attach(context); reduced.attach(context); theme.attach(context);
  context.document.visibilityState = 'hidden';
  context.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(context.bus.get('visible'), false);
  const motion = context.window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.matches = true;
  motion.dispatchEvent(new Event('change'));
  assert.equal(context.bus.get('reducedMotion'), true);
  assert.deepEqual(context.bus.get('theme'), { ink: '1,2,3', gain: 1, floor: 0.025, ring: '4,5,6', live: '' });
  context.document.documentElement.css['--glyph'] = '9,8,7';
  context.window.observers[0].fire();
  assert.equal(context.bus.get('theme').ink, '9,8,7');
  assert.ok(renders >= 5);
  visibility.detach(context); reduced.detach(context); theme.detach(context);
  context.window.assertEmpty(); context.document.assertEmpty();
  for (const query of context.window.queries.values()) query.assertEmpty();
  assert.ok(context.window.observers.every((observer) => observer.disconnected));
});

test('MIDI maps notes, controls, pitch and clock, then releases every listener', async () => {
  const context = adapterContext();
  const access = new TrackedTarget(), device = new TrackedTarget();
  access.inputs = new Map([['one', device]]);
  context.window.navigator.requestMIDIAccess = async () => access;
  const input = inputs.midi();
  input.attach(context);
  assert.equal(context.bus.get('midi.available'), true);
  assert.equal(await input.enable(), true);
  device.dispatchEvent(event('midimessage', { data: [0x90, 64, 127] }));
  device.dispatchEvent(event('midimessage', { data: [0xb0, 1, 64] }));
  device.dispatchEvent(event('midimessage', { data: [0xe0, 0, 64] }));
  device.dispatchEvent(event('midimessage', { data: [0xf8] }));
  assert.deepEqual(context.bus.drain('midi.note'), [{ note: 64, velocity: 1, on: true, channel: 0 }]);
  assert.equal(context.bus.get('midi.cc.1'), 64 / 127);
  assert.equal(context.bus.get('midi.pitchbend'), 0);
  assert.equal(context.bus.get('midi.clock'), 1);
  verifyDetached(input, context);
  access.assertEmpty(); device.assertEmpty();
  assert.equal(context.bus.get('midi.enabled'), false);
});

test('content measures flow text, fixed text, media, and pins, then detaches', async () => {
  const originalNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  try {
    const document = new FakeDocument();
    const context = adapterContext(document);
    const body = document.body;
    const ordinary = { parentElement: body, closest: () => null };
    const fixed = { parentElement: body, position: 'fixed', closest: () => null };
    const pin = { parentElement: body, dataset: { blob: '' }, rect: rect(70, 80, 60, 20), closest: () => true };
    document.textNodes = [
      { nodeValue: 'flow', parentElement: ordinary, rect: rect(10, 20, 40, 10) },
      { nodeValue: 'fixed', parentElement: fixed, rect: rect(30, 40, 40, 10) },
      { nodeValue: 'pinned', parentElement: pin, rect: pin.rect },
    ];
    const image = { parentElement: body, getBoundingClientRect: () => rect(100, 120, 50, 30) };
    document.elements.set('img', [image]);
    document.elements.set('[data-blob]', [pin]);
    context.window.scrollY = 12;
    const observed = [];
    context.onContent = (value) => observed.push(value);
    const input = inputs.content();
    input.attach(context);
    const value = observed.at(-1);
    assert.deepEqual(value.flowText, [{ l: 10, t: 32, r: 50, b: 42 }]);
    assert.deepEqual(value.fixedText, [rect(30, 40, 40, 10)]);
    assert.deepEqual(value.flowMedia, [{ l: 100, t: 132, r: 150, b: 162 }]);
    assert.deepEqual(value.pins, [{ id: 0, rect: pin.rect }]);
    input.update(context);
    assert.equal(observed.length, 2);
    verifyDetached(input, context);
    await document.fonts.ready;
  } finally { globalThis.NodeFilter = originalNodeFilter; }
});

test('content words mode creates pins and ignores font readiness after detach', async () => {
  const originalNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  try {
    const document = new FakeDocument();
    let fontsReady;
    document.fonts.ready = new Promise((resolve) => { fontsReady = resolve; });
    const context = adapterContext(document);
    context.preset.pinMode = 'words';
    const pin = { parentElement: document.body, dataset: { blob: 'words' }, rect: rect(10, 20, 90, 12), closest: () => true };
    const word = { nodeValue: 'two words', parentElement: pin, rect: pin.rect };
    pin.textNodes = [word];
    document.textNodes = [word];
    document.elements.set('img', []);
    document.elements.set('[data-blob]', [pin]);
    let measured;
    context.onContent = (value) => { measured = value; };
    const input = inputs.content();
    input.attach(context);
    assert.equal(measured.pins.length, 3);
    assert.deepEqual(measured.pins.map((pin) => pin.id), [0, 1, 2]);
    let afterDetach = 0;
    context.onContent = () => { afterDetach++; };
    verifyDetached(input, context);
    fontsReady();
    await document.fonts.ready;
    assert.equal(afterDetach, 0);
  } finally { globalThis.NodeFilter = originalNodeFilter; }
});
