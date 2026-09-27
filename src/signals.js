// SPDX-License-Identifier: Apache-2.0
export function createSignalBus(initial = {}) {
  const values = new Map(Object.entries(initial));
  const queues = new Map();
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
  };
}
