import assert from 'node:assert/strict';

export class TrackedTarget extends EventTarget {
  listeners = new Map();
  addEventListener(name, listener, options) {
    super.addEventListener(name, listener, options);
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener, options) {
    super.removeEventListener(name, listener, options);
    this.listeners.get(name)?.delete(listener);
  }
  count(name) { return name ? this.listeners.get(name)?.size || 0 : [...this.listeners.values()].reduce((sum, group) => sum + group.size, 0); }
  assertEmpty() { assert.equal(this.count(), 0); }
}

export function event(name, values = {}) {
  return Object.assign(new Event(name), values);
}

export class FakeCanvas {
  constructor(document) {
    this.ownerDocument = document;
    this.style = {};
    this.widthWrites = 0;
    this.heightWrites = 0;
    this.draws = [];
    this.context = new FakeContext(this);
  }
  set width(value) { this._width = value; this.widthWrites++; }
  get width() { return this._width || 0; }
  set height(value) { this._height = value; this.heightWrites++; }
  get height() { return this._height || 0; }
  getContext(kind) { return kind === '2d' ? this.context : null; }
}

class FakeContext {
  constructor(canvas) { this.canvas = canvas; this.globalAlpha = 1; }
  setTransform() {}
  clearRect() {}
  fillRect() {}
  save() {}
  restore() {}
  translate() {}
  putImageData() {}
  getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  drawImage(_sprite, x, y, width, height) { this.canvas.draws.push([x, y, width, height, this.globalAlpha]); }
}

export class FakeWindow extends TrackedTarget {
  constructor() {
    super();
    this.innerWidth = 480;
    this.innerHeight = 320;
    this.scrollX = 0;
    this.scrollY = 0;
    this.devicePixelRatio = 1;
    this.screen = { orientation: { angle: 0 } };
    this.navigator = {};
    this.performance = { now: () => 0 };
    this.sessionStorage = { getItem: () => null, setItem() {} };
    this.raf = new Map();
    this.nextRaf = 0;
    this.queries = new Map();
    this.observers = [];
    const owner = this;
    this.ResizeObserver = class {
      disconnected = false;
      constructor(callback) { this.callback = callback; owner.observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
      fire() { this.callback(); }
    };
    this.MutationObserver = this.ResizeObserver;
  }
  requestAnimationFrame(callback) { const id = ++this.nextRaf; this.raf.set(id, callback); return id; }
  cancelAnimationFrame(id) { this.raf.delete(id); }
  frame(now = 16) {
    const pending = [...this.raf.values()];
    this.raf.clear();
    for (const callback of pending) callback(now);
  }
  matchMedia(query) {
    if (!this.queries.has(query)) this.queries.set(query, Object.assign(new TrackedTarget(), { matches: false }));
    return this.queries.get(query);
  }
  getComputedStyle(element) {
    return { position: element.position || 'static', overflow: element.overflow || 'visible', getPropertyValue: (name) => element.css?.[name] || '' };
  }
}

export class FakeDocument extends TrackedTarget {
  constructor(window = new FakeWindow()) {
    super();
    this.defaultView = window;
    this.readyState = 'complete';
    this.visibilityState = 'visible';
    this.documentElement = { scrollHeight: 960, css: { '--glyph': '1,2,3', '--ring': '4,5,6' } };
    this.body = { parentElement: null };
    this.fonts = { ready: Promise.resolve() };
    this.textNodes = [];
    this.elements = new Map();
  }
  createElement(name) { return name === 'canvas' ? new FakeCanvas(this) : {}; }
  createTreeWalker(root) {
    const nodes = root === this.body ? this.textNodes : root.textNodes || [];
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
  }
  createRange() {
    let element, node, start = 0, end = 0;
    return {
      selectNodeContents(value) { element = value; node = null; },
      setStart(value, offset) { node = value; start = offset; },
      setEnd(_value, offset) { end = offset; },
      getClientRects() { return [element?.rect || node?.rect || rect(0, 0, 0, 0)]; },
      getBoundingClientRect() {
        if (element) return element.rect;
        const box = node?.rect || rect(0, 0, 0, 0);
        return rect(box.left + start, box.top, Math.max(1, end - start), box.height);
      },
    };
  }
  querySelectorAll(selector) { return this.elements.get(selector) || []; }
}

export function rect(left, top, width, height) { return { left, top, width, height, right: left + width, bottom: top + height }; }

export function adapterContext(document = new FakeDocument()) {
  const busValues = new Map();
  const queues = new Map();
  const bus = {
    get: (name) => busValues.get(name),
    set: (name, value) => busValues.set(name, value),
    push(name, value) { if (!queues.has(name)) queues.set(name, []); queues.get(name).push(value); },
    drain(name) { const items = queues.get(name) || []; queues.set(name, []); return items; },
  };
  return { document, window: document.defaultView, bus, preset: { media: 'img', pinMode: 'element' }, requestRender() {} };
}
