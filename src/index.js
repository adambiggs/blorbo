// SPDX-License-Identifier: Apache-2.0
import { createCore } from './core.js';
import { createSignalBus } from './signals.js';
import { resolvePreset, presets } from './presets.js';
import { clock, viewport, scroll, pointer, click, orientation, midi, content, visibility, reducedMotion, theme } from './inputs.js';

export { createSignalBus, presets };
export { clock, viewport, scroll, pointer, click, orientation, midi, content, visibility, reducedMotion, theme, requestOrientationPermission } from './inputs.js';

export function createBlorbo(canvas, { preset = presets.adambiggs, overrides = {}, inputs, persist = 'session' } = {}) {
  if (!canvas?.getContext) throw new TypeError('createBlorbo requires a canvas');
  const config = resolvePreset(preset, overrides);
  const document = canvas.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new TypeError('Canvas must belong to a browser window');
  const bus = createSignalBus();
  const core = createCore(canvas, { preset: config, bus });
  const adapters = inputs || [viewport(), clock(), scroll(), pointer(), click(), orientation(), midi(), content(), visibility(), reducedMotion(), theme()];
  let destroyed = false, frame = 0, last = 0, width = 0, height = 0, dpr = 0;
  const levels = config.quality?.levels || [
    { cellScale: 1, spillSteps: 18 },
    { cellScale: 1, spillSteps: 12 },
    { cellScale: 1, spillSteps: 8 },
    { cellScale: 1, spillSteps: 5 },
  ];
  const frameBudget = config.quality?.frameBudget ?? 12;
  const minDwellMs = config.quality?.minDwellMs ?? 3000;
  const stats = { quality: 0, lastFrameMs: 0, averageFrameMs: 0, frames: 0 };
  let sampleTotal = 0, sampleCount = 0, goodWindows = 0, pendingQuality = false, activeQualityMs = Infinity;
  let pendingRestore = null;
  let clicks = [];
  const clickKeep = 2.82;
  let storage = null;
  if (persist === 'session') {
    try { storage = window.sessionStorage; } catch { /* Storage can be disabled by the browser. */ }
  }

  if (storage) {
    try {
      const cursor = JSON.parse(storage.getItem('blorbo'));
      const mask = JSON.parse(storage.getItem('blorbo:mask'));
      if (cursor || (mask && Date.now() - mask.at < 10000)) pendingRestore = { cursor, mask };
      clicks = (JSON.parse(storage.getItem('blorbo:clicks')) || []).filter((item) => Date.now() - item.at < clickKeep * 1000);
    } catch { /* Storage can be disabled by the browser. */ }
  }

  const rememberClick = (value) => {
    if (!storage) return;
    const item = { x: value.x * window.innerWidth, y: value.y * window.innerHeight, at: value.at };
    clicks = clicks.filter((entry) => Date.now() - entry.at < clickKeep * 1000).slice(-3);
    clicks.push(item);
    try { storage.setItem('blorbo:clicks', JSON.stringify(clicks)); } catch { /* Storage can be disabled. */ }
  };
  const save = () => {
    if (!storage) return;
    const state = core.snapshot();
    try {
      storage.setItem('blorbo', JSON.stringify(state.cursor));
      storage.setItem('blorbo:mask', JSON.stringify({ ...state.mask, at: Date.now() }));
    } catch { /* Storage can be disabled. */ }
  };
  const ensureSize = () => {
    const size = bus.get('viewport') || { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
    if (size.width === width && size.height === height && size.dpr === dpr) return;
    width = size.width; height = size.height; dpr = size.dpr;
    core.resize(width, height, dpr);
    canvas.style.top = `-${core.over}px`;
    canvas.style.height = `calc(100% + ${2 * core.over}px)`;
    if (pendingRestore) { core.restore(pendingRestore); pendingRestore = null; }
  };
  const context = { canvas, window, document, bus, preset: config, onContent: core.setContent, rememberClick, requestRender };
  const render = (now) => {
    frame = 0;
    if (destroyed || bus.get('visible') === false) return;
    const started = window.performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    for (const input of adapters) input.update?.(context, dt);
    ensureSize();
    if (pendingQuality) {
      core.setQuality(levels[stats.quality].cellScale, levels[stats.quality].spillSteps);
      pendingQuality = false;
      activeQualityMs = 0;
    }
    core.draw(bus.get('reducedMotion') ? 0 : dt);
    activeQualityMs += dt * 1000;
    stats.lastFrameMs = window.performance.now() - started;
    stats.frames++;
    if (config.adaptive !== false && !bus.get('reducedMotion')) {
      sampleTotal += stats.lastFrameMs; sampleCount++;
      if (sampleCount >= 20) {
        stats.averageFrameMs = sampleTotal / sampleCount;
        sampleTotal = 0; sampleCount = 0;
        const canChange = activeQualityMs >= minDwellMs;
        if (stats.averageFrameMs > frameBudget && stats.quality < levels.length - 1 && canChange) {
          stats.quality++;
          goodWindows = 0;
          pendingQuality = true;
        } else if (stats.averageFrameMs < frameBudget * 0.55 && stats.quality > 0) {
          goodWindows = Math.min(4, goodWindows + 1);
          if (goodWindows >= 4 && canChange) {
            stats.quality--;
            goodWindows = 0;
            pendingQuality = true;
          }
        } else goodWindows = 0;
      }
    }
    if (!bus.get('reducedMotion')) requestRender();
  };
  function requestRender() {
    if (!destroyed && !frame && bus.get('visible') !== false) frame = window.requestAnimationFrame(render);
  }
  const onPageHide = () => save();
  for (const input of adapters) input.attach(context);
  if (storage) {
    for (const item of clicks) bus.push('click', { x: item.x / window.innerWidth, y: item.y / window.innerHeight, age: (Date.now() - item.at) / 1000 });
    window.addEventListener('pagehide', onPageHide);
  }
  requestRender();

  return {
    signals: bus,
    stats,
    setSignal(name, value) { bus.set(name, value); requestRender(); },
    pushSignal(name, value) { bus.push(name, value); requestRender(); },
    async enableMIDI() { return await adapters.find((input) => input.enable)?.enable() || false; },
    remeasure() { for (const input of adapters) input.remeasure?.(); requestRender(); },
    still(t = bus.get('clock') ?? Date.now() / 1000) {
      for (const input of adapters) input.update?.(context, 0);
      ensureSize();
      if (pendingQuality) {
        core.setQuality(levels[stats.quality].cellScale, levels[stats.quality].spillSteps);
        pendingQuality = false;
        activeQualityMs = 0;
      }
      const liveClock = bus.get('clock');
      bus.set('clock', t);
      try { core.draw(0, t, true); }
      finally { bus.set('clock', liveClock); }
      return canvas;
    },
    destroy() {
      if (destroyed) return;
      save();
      destroyed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pagehide', onPageHide);
      for (const input of [...adapters].reverse()) input.detach?.(context);
      core.destroy();
    },
  };
}
