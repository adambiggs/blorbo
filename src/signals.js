// SPDX-License-Identifier: Apache-2.0
export function createSignalBus(initial = {}) {
  const values = new Map(Object.entries(initial));
  const queues = new Map();
  const listeners = new Map();
  const unsubscribe = (name, listener) => {
    const group = listeners.get(name);
    if (!group) return;
    const index = group.indexOf(listener);
    if (index !== -1) group.splice(index, 1);
    if (!group.length) listeners.delete(name);
  };
  return {
    get(name) { return values.get(name); },
    set(name, value) { values.set(name, value); },
    push(name, value) {
      if (!queues.has(name)) queues.set(name, []);
      queues.get(name).push(value);
    },
    drain(name) {
      const items = queues.get(name) || [];
      queues.set(name, []);
      return items;
    },
    subscribe(name, listener) {
      if (typeof listener !== 'function') throw new TypeError('Signal listener must be a function');
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
      return () => unsubscribe(name, listener);
    },
    unsubscribe,
    emit(name, value) {
      for (const listener of [...(listeners.get(name) || [])]) listener(value);
    },
  };
}
