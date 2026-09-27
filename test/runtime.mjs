import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const here = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const path = resolve(here, relative);
    if (!path.startsWith(here + sep)) throw new Error('outside fixture');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/html' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (error) => { throw error; });
  await page.addInitScript(() => {
    const input = new EventTarget();
    const access = new EventTarget();
    access.inputs = new Map([['fake', input]]);
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.sendTestMIDI = (bytes) => {
      const event = new Event('midimessage');
      Object.defineProperty(event, 'data', { value: bytes });
      input.dispatchEvent(event);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/perf.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.makeField);
  const result = await page.evaluate(async () => {
    const next = () => new Promise((done) => requestAnimationFrame(done));
    const frames = async (count) => { for (let i = 0; i < count; i++) await next(); };
    const field = window.makeField(false);
    await frames(5);
    if (!field.stats.frames) throw new Error('Field did not animate');
    const canvas = document.getElementById('field');
    if (field.still(1000) !== canvas) throw new Error('Still frame did not return the canvas');
    const enabled = await field.enableMIDI();
    if (!enabled) throw new Error('Fake MIDI access was not enabled');
    window.sendTestMIDI([0xb0, 1, 64]);
    window.sendTestMIDI([0xe0, 0, 64]);
    window.sendTestMIDI([0xf8]);
    const cc = field.signals.get('midi.cc.1');
    if (Math.abs(cc - 64 / 127) > 1e-6 || field.signals.get('midi.pitchbend') !== 0 || field.signals.get('midi.clock') !== 1)
      throw new Error('MIDI signals are wrong');
    const originalStyle = getComputedStyle;
    let styleReads = 0;
    window.getComputedStyle = (...args) => { styleReads++; return originalStyle(...args); };
    await frames(5);
    window.getComputedStyle = originalStyle;
    if (styleReads) throw new Error(`Computed style was read ${styleReads} times during steady frames`);
    field.destroy();
    const after = field.stats.frames;
    await frames(5);
    if (field.stats.frames !== after) throw new Error('Field kept animating after destroy');
    window.sendTestMIDI([0xb0, 1, 10]);
    if (field.signals.get('midi.cc.1') !== cc) throw new Error('MIDI listener survived destroy');
    return { animatedFrames: after, cc, styleReads, destroyedFrames: field.stats.frames };
  });
  await page.evaluate(() => { window.runtimeField = window.makeField(false); });
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((done) => requestAnimationFrame(done)); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done)); });
  const pausedAt = await page.evaluate(() => window.runtimeField.stats.frames);
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((done) => requestAnimationFrame(done)); });
  if (await page.evaluate(() => window.runtimeField.stats.frames) !== pausedAt) throw new Error('Reduced motion kept animating');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((done) => requestAnimationFrame(done)); });
  if (await page.evaluate(() => window.runtimeField.stats.frames) <= pausedAt) throw new Error('Field did not resume after reduced motion changed');
  await page.evaluate(() => window.runtimeField.destroy());
  result.reducedMotionPausedAt = pausedAt;
  await page.evaluate(() => {
    window.runtimeField = window.makeField(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenAt = await page.evaluate(() => window.runtimeField.stats.frames);
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((done) => requestAnimationFrame(done)); });
  if (await page.evaluate(() => window.runtimeField.stats.frames) !== hiddenAt) throw new Error('Hidden field kept animating');
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise((done) => requestAnimationFrame(done)); });
  if (await page.evaluate(() => window.runtimeField.stats.frames) <= hiddenAt) throw new Error('Visible field did not resume');
  await page.evaluate(() => window.runtimeField.destroy());
  result.hiddenPausedAt = hiddenAt;
  result.focused = await page.evaluate(async () => {
    const { createField, presets, midi, clock } = await import('../src/index.js');
    const canvas = document.getElementById('field');
    const stillField = createField(canvas, { preset: presets.adambiggs, inputs: [], persist: false });
    stillField.pushSignal('click', { x: 0.5, y: 0.5, age: 0 });
    const first = stillField.still(1000).toDataURL();
    const second = stillField.still(1000).toDataURL();
    stillField.destroy();
    if (first !== second) throw new Error('Still frame changed at the same time after a click');

    const clockField = createField(canvas, {
      preset: presets.adambiggs, inputs: [clock()], persist: false,
      overrides: { mapSignals: (bus) => ({ gain: 1 + (Math.floor(bus.get('clock')) % 2) }) },
    });
    const realNow = Date.now;
    let mappedFirst, mappedSecond;
    try {
      Date.now = () => 1001000;
      mappedFirst = clockField.still(1000).toDataURL();
      Date.now = () => 1002000;
      mappedSecond = clockField.still(1000).toDataURL();
    } finally { Date.now = realNow; clockField.destroy(); }
    if (mappedFirst !== mappedSecond) throw new Error('Still frame mapping used wall time instead of its fixed time');

    const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
      createField(canvas, { inputs: [], persist: 'session' }).destroy();
    } finally { Object.defineProperty(window, 'sessionStorage', storageDescriptor); }

    let clicks = 0, glyphDraws = 0;
    const custom = createField(canvas, {
      preset: presets.adambiggs,
      overrides: {
        glyph: {
          style: 'blocks', ramp: [0, 1], steps: [0.5], halo: [0.2, 0.4],
          draw(g, ink, { spriteWidth, spriteHeight }) {
            glyphDraws++;
            g.fillRect(spriteWidth / 2, spriteHeight / 2, 2, 2);
          },
        },
        clickEffect: () => ({
          onClick() { clicks++; },
          draw({ ctx }) { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 5, 5); },
        }),
      },
      inputs: [], persist: false,
    });
    custom.pushSignal('click', { x: 0.5, y: 0.5, age: 0 });
    custom.still(1000);
    const red = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
    custom.destroy();
    if (!glyphDraws || clicks !== 1 || red[0] !== 255 || red[1] !== 0) throw new Error('Custom glyph or click strategy did not run');

    const input = new EventTarget(), access = new EventTarget();
    access.inputs = new Map([['delayed', input]]);
    let grant;
    const midiDescriptor = Object.getOwnPropertyDescriptor(navigator, 'requestMIDIAccess');
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: () => new Promise((done) => { grant = done; }) });
    try {
      const delayed = createField(canvas, { inputs: [midi()], persist: false });
      const enabling = delayed.enableMIDI();
      delayed.destroy();
      grant(access);
      if (await enabling) throw new Error('MIDI permission enabled a destroyed field');
      const event = new Event('midimessage');
      Object.defineProperty(event, 'data', { value: [0xb0, 1, 127] });
      input.dispatchEvent(event);
      if (delayed.signals.get('midi.cc.1') !== undefined) throw new Error('Late MIDI permission attached a listener after destroy');
    } finally { Object.defineProperty(navigator, 'requestMIDIAccess', midiDescriptor); }
    return { stillRepeatable: true, clockMappingRepeatable: true, blockedStorage: true, customGlyphDraws: glyphDraws, customClickEvents: clicks, lateMIDI: true };
  });
  result.qualityTransitions = await page.evaluate(async () => {
    const field = window.makeField(true, 0.1);
    const canvas = document.getElementById('field');
    let prior = 0, transitions = 0;
    for (let i = 0; i < 70; i++) {
      await new Promise((done) => requestAnimationFrame(done));
      if (field.stats.quality === prior) continue;
      prior = field.stats.quality;
      transitions++;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = false;
      for (let p = 3; p < pixels.length; p += 4) if (pixels[p]) { visible = true; break; }
      if (!visible) throw new Error(`Quality transition ${prior} cleared the visible canvas`);
    }
    field.destroy();
    if (transitions !== 3) throw new Error(`Expected three quality transitions, got ${transitions}`);
    return transitions;
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
