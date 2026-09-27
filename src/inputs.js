// SPDX-License-Identifier: Apache-2.0
const adapter = (attach, update = () => {}, detach = () => {}) => ({ attach, update, detach });

export function clock() {
  return adapter(({ bus }) => bus.set('clock', Date.now() / 1000), ({ bus }) => bus.set('clock', Date.now() / 1000));
}

export function viewport() {
  let onResize, observer;
  return adapter(({ bus, window, document, requestRender }) => {
    onResize = () => {
      bus.set('viewport', { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
      requestRender();
    };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) { observer = new window.ResizeObserver(onResize); observer.observe(document.documentElement); }
    onResize();
  }, () => {}, ({ window }) => {
    window.removeEventListener('resize', onResize);
    observer?.disconnect();
  });
}

export function scroll() {
  let onScroll, previous = 0;
  return adapter(({ bus, window, document }) => {
    onScroll = () => {
      const px = window.scrollY;
      bus.set('scroll.px', px);
      bus.set('scroll.x', window.scrollX);
      const height = document.documentElement.scrollHeight;
      bus.set('scroll.height', height);
      bus.set('scroll', Math.max(0, Math.min(1, px / Math.max(1, height - window.innerHeight))));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); previous = window.scrollY;
  }, ({ bus, window }, dt) => {
    const px = window.scrollY;
    bus.set('scroll.velocity', dt > 0 ? (px - previous) / dt / Math.max(1, window.innerHeight) : 0);
    previous = px;
    onScroll();
  }, ({ window }) => window.removeEventListener('scroll', onScroll));
}

export function pointer() {
  let onMove, onLeave;
  return adapter(({ bus, window, document }) => {
    onMove = (event) => {
      const value = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight, present: true };
      bus.set('pointer', value);
      bus.set('pointer.x', value.x); bus.set('pointer.y', value.y);
    };
    onLeave = () => {
      const value = bus.get('pointer');
      if (value) bus.set('pointer', { ...value, present: false });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
  }, () => {}, ({ window, document }) => {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
  });
}

export function click() {
  let onClick;
  return adapter(({ bus, window, rememberClick }) => {
    onClick = (event) => {
      const value = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight, at: Date.now() };
      bus.push('click', value);
      rememberClick?.(value);
    };
    window.addEventListener('click', onClick);
  }, () => {}, ({ window }) => window.removeEventListener('click', onClick));
}

export async function requestOrientationPermission() {
  const request = globalThis.DeviceOrientationEvent?.requestPermission;
  return request ? (await request.call(globalThis.DeviceOrientationEvent)) === 'granted' : true;
}

export function orientation() {
  let onOrientation;
  return adapter(({ bus, window }) => {
    onOrientation = (event) => {
      if (event.beta === null || event.gamma === null) return;
      const b = event.beta * Math.PI / 180, g = event.gamma * Math.PI / 180;
      const r = ((window.screen.orientation && window.screen.orientation.angle) || 0) * Math.PI / 180;
      const x = Math.cos(b) * Math.sin(g), y = Math.sin(b);
      const tilt = { x: x * Math.cos(r) + y * Math.sin(r), y: y * Math.cos(r) - x * Math.sin(r), active: true };
      bus.set('tilt', tilt);
      bus.set('tilt.x', tilt.x); bus.set('tilt.y', tilt.y);
    };
    window.addEventListener('deviceorientation', onOrientation);
  }, () => {}, ({ window }) => window.removeEventListener('deviceorientation', onOrientation));
}

export function midi() {
  let ctx, access, clockTicks = 0, active = false, generation = 0;
  const connected = new Set();
  const onMessage = (event) => {
    if (!active) return;
    const [status, a = 0, b = 0] = event.data;
    if (status === 0xf8) {
      ctx.bus.set('midi.clock', ++clockTicks);
    } else {
      const kind = status & 0xf0, channel = status & 0x0f;
      if (kind === 0x80 || kind === 0x90) ctx.bus.push('midi.note', { note: a, velocity: b / 127, on: kind === 0x90 && b > 0, channel });
      else if (kind === 0xb0) ctx.bus.set(`midi.cc.${a}`, b / 127);
      else if (kind === 0xe0) ctx.bus.set('midi.pitchbend', ((b << 7) | a) / 8192 - 1);
    }
    ctx.requestRender();
  };
  const refresh = () => {
    if (!active || !access) return;
    for (const input of connected) input.removeEventListener('midimessage', onMessage);
    connected.clear();
    for (const input of access.inputs.values()) {
      input.addEventListener('midimessage', onMessage);
      connected.add(input);
    }
  };
  return {
    attach(context) { ctx = context; active = true; generation++; ctx.bus.set('midi.available', !!ctx.window.navigator.requestMIDIAccess); },
    async enable() {
      if (!active || !ctx?.window.navigator.requestMIDIAccess) return false;
      const requestGeneration = generation;
      try {
        const granted = await ctx.window.navigator.requestMIDIAccess({ sysex: false });
        if (!active || generation !== requestGeneration) return false;
        access = granted;
        access.addEventListener('statechange', refresh);
        refresh();
        ctx.bus.set('midi.enabled', true);
        return true;
      } catch { return false; }
    },
    detach() {
      active = false;
      generation++;
      if (access) access.removeEventListener('statechange', refresh);
      for (const input of connected) input.removeEventListener('midimessage', onMessage);
      connected.clear(); access = null;
      ctx?.bus.set('midi.enabled', false);
      ctx = null;
    },
  };
}

export function visibility() {
  let onVisibility;
  return adapter(({ bus, document, requestRender }) => {
    onVisibility = () => {
      bus.set('visible', document.visibilityState !== 'hidden');
      requestRender();
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
  }, () => {}, ({ document }) => document.removeEventListener('visibilitychange', onVisibility));
}

export function reducedMotion() {
  let query, onChange;
  return adapter(({ bus, window, requestRender }) => {
    query = window.matchMedia('(prefers-reduced-motion: reduce)');
    onChange = () => { bus.set('reducedMotion', query.matches); requestRender(); };
    query.addEventListener('change', onChange);
    onChange();
  }, () => {}, () => query?.removeEventListener('change', onChange));
}

export function theme() {
  let observer, query, onChange, onResize;
  return adapter(({ bus, window, document, requestRender }) => {
    onChange = () => {
      const cs = window.getComputedStyle(document.documentElement);
      bus.set('theme', {
        ink: cs.getPropertyValue('--glyph').trim(),
        gain: parseFloat(cs.getPropertyValue('--glyph-gain')) || 1,
        floor: parseFloat(cs.getPropertyValue('--glyph-floor')) || 0.025,
        ring: cs.getPropertyValue('--ring').trim(),
        live: cs.getPropertyValue('--live').trim(),
      });
      requestRender();
    };
    observer = new window.MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', onChange);
    onResize = onChange;
    window.addEventListener('resize', onResize);
    onChange();
  }, () => {}, ({ window }) => {
    observer?.disconnect();
    query?.removeEventListener('change', onChange);
    window.removeEventListener('resize', onResize);
  });
}

export function content({ pin = '[data-blob]' } = {}) {
  let ctx, ready = false, flowText = [], flowMedia = [], fixedText = [], fixedMedia = [];
  let ranges = [], stuckText = [], stuckMedia = [], observer, onReady, onResize, onLoad;
  const isStuck = (el, held) => {
    if (!el || el === ctx.document.body) return false;
    if (held.has(el)) return held.get(el);
    const position = ctx.window.getComputedStyle(el).position;
    const value = position === 'fixed' || position === 'sticky' || isStuck(el.parentElement, held);
    held.set(el, value);
    return value;
  };
  const rect = (b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height });
  const measure = () => {
    if (!ready) return;
    const { document, window, preset } = ctx;
    flowText = []; flowMedia = []; stuckText = []; stuckMedia = []; ranges = [];
    const held = new Map();
    const add = (src, el) => {
      if (isStuck(el, held)) { stuckText.push(src); return; }
      for (const b of src.getClientRects()) if (b.width > 0 && b.height > 0)
        flowText.push({ l: b.left + window.scrollX, t: b.top + window.scrollY, r: b.right + window.scrollX, b: b.bottom + window.scrollY });
    };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!n.nodeValue.trim() || !el || el.closest(`${pin},script,style,noscript,[hidden],.bgfx`)) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      add(range, el);
    }
    for (const pic of document.querySelectorAll(preset.media || 'img')) {
      const media = pic.parentElement && window.getComputedStyle(pic.parentElement).overflow === 'hidden' ? pic.parentElement : pic;
      if (isStuck(media, held)) { stuckMedia.push(media); continue; }
      const b = media.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) flowMedia.push({ l: b.left + window.scrollX, t: b.top + window.scrollY, r: b.right + window.scrollX, b: b.bottom + window.scrollY });
    }
    for (const el of document.querySelectorAll(pin)) {
      if (preset.pinMode !== 'words' || el.dataset.blob !== 'words') {
        const range = document.createRange(); range.selectNodeContents(el); ranges.push(range); continue;
      }
      const words = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = words.nextNode(); n; n = words.nextNode()) for (const m of n.nodeValue.trim() ? n.nodeValue.matchAll(/\S+|(?<=\S)\s+(?=\S)/g) : []) {
        const range = document.createRange(); range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length); ranges.push(range);
      }
    }
    update();
    ctx.requestRender();
  };
  const update = () => {
    if (!ready) return;
    fixedText = stuckText.flatMap((range) => [...range.getClientRects()].filter((b) => b.width > 0).map(rect));
    fixedMedia = stuckMedia.map((media) => media.getBoundingClientRect()).filter((b) => b.width > 0).map(rect);
    ctx.onContent({
      flowText, flowMedia, fixedText, fixedMedia,
      pins: ranges.map((range, i) => ({ id: i, rect: rect(range.getBoundingClientRect()) })),
    });
  };
  return {
    attach(context) {
      ctx = context;
      onReady = () => { ready = true; measure(); };
      if (ctx.document.readyState === 'loading') ctx.document.addEventListener('DOMContentLoaded', onReady, { once: true });
      else onReady();
      onResize = measure; onLoad = measure;
      ctx.window.addEventListener('resize', onResize);
      ctx.window.addEventListener('load', onLoad);
      if (ctx.window.ResizeObserver) { observer = new ctx.window.ResizeObserver(measure); observer.observe(ctx.document.documentElement); }
      ctx.document.fonts?.ready.then(measure);
    },
    update,
    remeasure: measure,
    detach() {
      ctx.document.removeEventListener('DOMContentLoaded', onReady);
      ctx.window.removeEventListener('resize', onResize);
      ctx.window.removeEventListener('load', onLoad);
      observer?.disconnect();
    },
  };
}
