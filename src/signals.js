// SPDX-License-Identifier: Apache-2.0
export function createSignalBus(initial = {}) {
  const values = new Map(Object.entries(initial));
  const queues = new Map();
  const listeners = new Map();
  const remove = (name, entry) => {
    const group = listeners.get(name);
    if (!group) return;
    const index = group.indexOf(entry);
    if (index !== -1) group.splice(index, 1);
    if (!group.length) listeners.delete(name);
  };
  const unsubscribe = (name, listener) => {
    const entry = listeners.get(name)?.find((item) => item.listener === listener);
    if (entry) remove(name, entry);
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
      const entry = { listener };
      listeners.get(name).push(entry);
      return () => remove(name, entry);
    },
    unsubscribe,
    emit(name, value) {
      for (const entry of [...(listeners.get(name) || [])]) entry.listener(value);
    },
  };
}
