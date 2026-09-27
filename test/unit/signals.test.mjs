import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalBus } from '../../src/signals.js';

test('values and queued events keep insertion order', () => {
  const bus = createSignalBus({ clock: 1 });
  assert.equal(bus.get('clock'), 1);
  bus.set('clock', 2);
  assert.equal(bus.get('clock'), 2);
  bus.push('click', 'first');
  bus.push('click', 'second');
  assert.deepEqual(bus.drain('click'), ['first', 'second']);
  assert.deepEqual(bus.drain('click'), []);
});

test('subscribers receive each emit in registration order and can unsubscribe', () => {
  const bus = createSignalBus();
  const seen = [];
  const offA = bus.subscribe('pulse', (value) => seen.push(`a:${value}`));
  const b = (value) => seen.push(`b:${value}`);
  bus.subscribe('pulse', b);
  bus.emit('pulse', 1);
  offA();
  bus.emit('pulse', 2);
  bus.unsubscribe('pulse', b);
  bus.emit('pulse', 3);
  assert.deepEqual(seen, ['a:1', 'b:1', 'b:2']);
});

test('emit uses a stable listener list when subscriptions change in a callback', () => {
  const bus = createSignalBus();
  const seen = [];
  let offB;
  bus.subscribe('x', () => {
    seen.push('a');
    offB();
    bus.subscribe('x', () => seen.push('c'));
  });
  offB = bus.subscribe('x', () => seen.push('b'));
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'b']);
  bus.emit('x');
  assert.deepEqual(seen, ['a', 'b', 'a', 'c']);
});

test('each duplicate subscription has its own idempotent unsubscribe', () => {
  const bus = createSignalBus();
  let calls = 0;
  const listener = () => calls++;
  const first = bus.subscribe('pulse', listener);
  const second = bus.subscribe('pulse', listener);
  first();
  first();
  bus.emit('pulse');
  assert.equal(calls, 1);
  second();
  bus.emit('pulse');
  assert.equal(calls, 1);
});
