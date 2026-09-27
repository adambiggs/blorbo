// SPDX-License-Identifier: Apache-2.0
export function createCore(c, { preset, bus }) {
  if (!c?.getContext) throw new TypeError('createField requires a canvas');
  const ctx = c.getContext('2d');
  if (!ctx) throw new TypeError('Canvas 2D context is unavailable');
  let rm = false;
  const glyph = typeof preset.glyph === 'object' ? preset.glyph : null;
  const lines = (glyph?.style ?? preset.glyph) === 'lines';
  const lineEffect = preset.clickEffect === 'line';
  const ringEffect = preset.clickEffect === 'ring';
  const customClick = typeof preset.clickEffect === 'function' ? preset.clickEffect() : null;
  if (!lineEffect && !ringEffect && !customClick) throw new TypeError('Unknown click effect');

  // The ramp, in rising ink, after the block-element set · ░ ▒: a dot, a
  // sparse shade below light, then light and medium shade. There is no
  // full block: the field never goes solid. Each is drawn as
  // a pixel pattern rather than from a font, so it is the same in every
  // browser and on every platform. A block is narrower than its cell, like
  // a monospace glyph in its advance, so a run of blocks keeps its grid.
  const baseCW = preset.cell.width, baseCH = preset.cell.height;
  let cw = baseCW, ch = baseCH;
  let spillSteps = 18;
  const BW = 9, BH = 13;
  // Each entry says which unit pixels of the block are inked, on a grid of
  // UNIT CSS pixels: coarse enough that the shades read as patterns rather
  // than averaging to a flat tone.
  const UNIT = 1;
  const BLOCK_RAMP = [
    (i, j, n, m) => i >= n / 2 - 1 && i < n / 2 + 1 && j >= m / 2 - 1 && j < m / 2 + 1,
    (i, j) => (j & 3) === 0 ? (i & 3) === 0 : (j & 3) === 2 && (i & 3) === 2,
    (i, j) => (j & 1 ? (i & 3) === 2 : (i & 3) === 0),
    (i, j) => ((i + j) & 1) === 0,
  ];
  const dashes = (n, w) => {
    const gap = 2, len = (ch - gap * n) / n, out = [];
    for (let i = 0; i < n; i++) out.push([w, i * (len + gap) + gap / 2, len]);
    return out;
  };
  const lineRamp = () => [
    [[1, 5, 1], [1, 8.5, 1], [1, 12, 1]],
    dashes(4, 1), dashes(3, 1), dashes(4, 2), dashes(3, 2),
    [[2, 0, ch]],
  ];
  const ramp = () => glyph ? (typeof glyph.ramp === 'function' ? glyph.ramp({ width: cw, height: ch }) : glyph.ramp) : lines ? lineRamp() : BLOCK_RAMP;
  let RAMP = ramp();
  const STEPS = glyph?.steps ?? (lines ? [0.2, 0.29, 0.36, 0.5, 0.62] : [0.2, 0.36, 0.78]);
  if (!Array.isArray(RAMP) || !RAMP.length || STEPS.length !== RAMP.length - 1) throw new TypeError('Glyph ramp needs one fewer thresholds than glyphs');
  // One sprite per step in the current ink; painted with the cell's alpha.
  // Each carries a soft glow baked in around the marks, reaching GLOW px
  // past the cell, so the halo costs nothing per frame. The glow is stronger
  // up the ramp, and it is broken into coarse grain: a few variants per
  // step, chosen by cell, so the grain does not tile.
  const GLOW = 6, GRAIN = 2, VARIANTS = 4;
  const HALO = glyph?.halo ?? (lines ? [0.3, 0.4, 0.5, 0.65, 0.8, 1] : [0.22, 0.27, 0.33, 0.42]);
  if (glyph && (typeof glyph.draw !== 'function' || !Array.isArray(HALO) || HALO.length !== RAMP.length))
    throw new TypeError('Custom glyphs need draw and one halo strength per glyph');
  // Light ink on a dark ground glows. Dark ink on a light ground gets the
  // same glow as a shadow: no offset, more weight, and it does not keep
  // climbing up the ramp, or the densest blocks sit in a dark pool.
  const SHADOW = [0.48, 0.56, 0.6, 0.52], SHADOW_PASSES = 3;
  const SHADOW_X = 1.5, SHADOW_Y = 2, SHADOW_A = 1;
  // On a light ground the sparse and light shades read fainter than their
  // coverage suggests, so they are painted heavier there; the dot and the
  // medium shade are left alone.
  const LIGHT_STEP = [1, 1.45, 1.3, 1];
  let inkDark = false;
  const inkIsDark = () => { const [r, g, b] = col.split(',').map(Number); return (r * 299 + g * 587 + b * 114) / 1000 < 128; };
  let sprites = [], spriteCol = '', dpr = 1;
  const sprite = (ink, halo, seed) => {
    const c2 = c.ownerDocument.createElement('canvas');
    const sw = Math.ceil((cw + 2 * GLOW) * dpr), sh = Math.ceil((ch + 2 * GLOW) * dpr);
    c2.width = sw; c2.height = sh;
    const g = c2.getContext('2d');
    g.fillStyle = 'rgb(' + col + ')';
    const u = Math.max(1, Math.round(dpr * UNIT)), n = Math.round(BW * dpr / u), m = Math.round(BH * dpr / u);
    const x0 = Math.round((sw - n * u) / 2), y0 = Math.round((sh - m * u) / 2);
    const draw = glyph?.draw
      ? () => glyph.draw(g, ink, { width: cw, height: ch, dpr, glow: GLOW, spriteWidth: sw, spriteHeight: sh, unit: u })
      : lines
      ? () => { for (const [w, y, h] of ink) g.fillRect(Math.round((sw - w) / 2), Math.round((y + GLOW) * dpr), w, Math.round(h * dpr)); }
      : () => { for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (ink(i, j, n, m)) g.fillRect(x0 + i * u, y0 + j * u, u, u); };
    // The inked pixels' bounding box: the block's footprint, or the dot's.
    let i0 = n, i1 = -1, j0 = m, j1 = -1;
    if (!lines && !glyph?.draw) for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (ink(i, j, n, m)) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const cast = inkIsDark();
    g.shadowColor = 'rgba(' + col + ',' + Math.min(1, lines && cast ? halo * SHADOW_A : halo) + ')'; g.shadowBlur = GLOW * dpr;
    if (lines && cast) { g.shadowOffsetX = SHADOW_X * dpr; g.shadowOffsetY = SHADOW_Y * dpr; }
    for (let k = 0; k < (cast ? SHADOW_PASSES : 2); k++) draw();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
    // Grain: the glow's alpha is scaled by noise in GRAIN-pixel blocks.
    const img = g.getImageData(0, 0, sw, sh), d = img.data;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const n = 0.35 + hash(x / GRAIN | 0, y / GRAIN | 0, seed) * 0.9;
      const i = (y * sw + x) * 4 + 3;
      d[i] = Math.min(255, d[i] * n);
    }
    g.putImageData(img, 0, 0);
    // The glow stays outside the block: the gaps in the pattern show the
    // page, not glow, so the blocks stay crisp.
    if (!lines && i1 >= 0) g.clearRect(x0 + i0 * u, y0 + j0 * u, (i1 - i0 + 1) * u, (j1 - j0 + 1) * u);
    draw();
    return c2;
  };
  const build = () => RAMP.map((r, i) => Array.from({ length: VARIANTS }, (_, k) => sprite(r, lines ? HALO[i] : inkIsDark() ? (glyph?.shadow?.[i] ?? SHADOW[i] ?? HALO[i]) : HALO[i], 100 + i * VARIANTS + k)));

  let W = 0, H = 0, cols = 0, rows = 0, perBand = 0, gridX = 1, gridY = 1;
  // Free bodies, pinned bodies, and the cursor body are summed apart: the
  // text repels only the free field, and the cursor is capped.
  let acc = new Float32Array(0), pacc = new Float32Array(0), cacc = new Float32Array(0);
  const f = {
    t: 0, last: 0, mx: -1e4, my: -1e4, tx: -1e4, ty: -1e4, cur: 0, pres: 0,
    scroll: 0, lastScroll: 0, vel: 0, slow: 0, acc: 0, amp: 0, pull: 0, zeta: 1,
    // Tilt: gravity across the screen in g, its rest pose, and the pull in px.
    ax: 0, ay: 0, bx: null, by: null, gx: 0, gy: 0, tilt: false,
  };

  // Parallax: the whole glyph matrix slides this much per pixel scrolled,
  // with the page. The offset is split into whole cells, which the grid
  // samples ahead by, and a remainder the canvas is translated by. The
  // remainder is what the whole part overshoots, not what is left over: the
  // grid steps a cell the moment the offset passes one, and the translate
  // gives it back until the offset catches up.
  const PARALLAX = 0.16;
  // Pulled past either end of the page, some browsers drag the fixed
  // background along with the rubber band. The canvas runs OVER px past the
  // top and bottom of the screen so there is field to show there; matrix
  // row 0 sits that far above the screen, and the spare rows are only drawn
  // while the page rests at, or is pulled past, that end.
  const OVER = 240;
  const step = (o) => { const whole = Math.floor(o); return { whole, frac: whole - o }; };

  // Two things move the bodies. Drag: the liquid pulls them to a lag set by
  // the page's speed, taken up at once as it speeds up and given back over
  // FOLLOW seconds as it slows; the grip fades as the page slows below
  // RELEASE px/s and the spring loosens from critical to ZETA with it.
  // Inertia: the page's acceleration throws them the other way, so the
  // moment a flick starts to decelerate they begin swinging home, and a hard
  // stop throws them through rest for a full bounce.
  const LAG = 0.022, MAX_LAG = 75, FOLLOW = 0.25, RELEASE = 2000, INERTIA = 0.008;
  const HZ = 1.1, ZETA = 0.5, STRETCH = 1100;
  // Tilt: px of pull per g of gravity across the screen, capped; the rest
  // pose follows the hand over TILT_SETTLE seconds, so a phone held at a new
  // angle settles rather than sitting downhill for good, and the pull is
  // eased over TILT_EASE seconds to take the noise out of the sensor.
  const TILT = 260, MAX_TILT = 120, TILT_SETTLE = 5, TILT_EASE = 0.08;
  // Slow drift of the whole field across the screen, px/s.
  const DRIFT = 14;
  let driftOffset = 0;
  // The dots twinkle: each one's brightness rises and falls on its own slow
  // phase, mostly resting a little under its level and now and then peaking
  // TWINKLE above it.
  const TWINKLE = 0.9, TWINKLE_REST = 0.75;

  const hash = (a, b, k) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Bodies live in bands one viewport tall stacked down the field, made from
  // their band and index so the field is the same on every visit; only the
  // spring state is kept, for the bands in view.
  const live = new Map();
  const blob = (b, i) => {
    const key = b * 1024 + i;
    let o = live.get(key);
    if (!o) {
      const r = 230 + hash(b, i, 1) * 120;
      // Each body has its own cell of a gridX by gridY grid over the band
      // and lands anywhere inside it, so the bodies spread evenly, with no
      // clumps and no bare stretches, and still never line up.
      o = {
        x: (i % gridX + hash(b, i, 2)) / gridX, y: b + (Math.floor(i / gridX) + hash(b, i, 3)) / gridY, r, a: 0.5 + hash(b, i, 4) * 0.2,
        w: 2 * Math.PI * HZ * (0.85 + hash(b, i, 5) * 0.3), ph: hash(b, i, 6) * 6.28,
        m: 0.8 + hash(b, i, 7) * 0.4,
        s: 0, v: 0, sx: 0, vx: 0, st: 1, sw: 1, seen: 0,
      };
      live.set(key, o);
    }
    return o;
  };

  // One step of a body's springs, y and x, and of its shape. Dragged without
  // bounce at speed; sprung home as the page settles. The shape eases toward
  // the speed rather than reading it raw, so a one-frame spike in the spring
  // cannot draw a one-frame streak: st is the stretch along y, sw along x.
  const spring = (o, dt) => {
    const k = o.w * o.w, cd = 2 * f.zeta * o.w;
    o.v += (k * ((f.pull + f.gy) * o.m - o.s) - cd * o.v) * dt; o.s += o.v * dt;
    o.vx += (k * (f.gx * o.m - o.sx) - cd * o.vx) * dt; o.sx += o.vx * dt;
    const e = Math.min(1, dt / 0.12);
    o.st += (1 + Math.min(1.4, Math.abs(o.v) / STRETCH) - o.st) * e;
    o.sw += (1 + Math.min(1.4, Math.abs(o.vx) / STRETCH) - o.sw) * e;
  };
  // The shape's x and y factors: long and thin along the faster axis.
  const shape = (o) => [o.sw / Math.sqrt(o.st), o.st / Math.sqrt(o.sw)];
  // Add one body to a field: an ellipse of half-axes rx, ry at cx, cy, in
  // matrix coordinates, with a soft (1 - d²)² falloff.
  const splat = (cx, cy, rx, ry, a, into) => {
    cy += OVER;
    const x0 = Math.max(0, Math.floor((cx - rx) / cw)), x1 = Math.min(cols - 1, Math.ceil((cx + rx) / cw));
    const y0 = Math.max(0, Math.floor((cy - ry) / ch)), y1 = Math.min(rows - 1, Math.ceil((cy + ry) / ch));
    for (let y = y0; y <= y1; y++) {
      const dy = (y * ch + ch / 2 - cy) / ry, row = y * cols;
      for (let x = x0; x <= x1; x++) {
        const dx = (x * cw + cw / 2 - cx) / rx, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const k = 1 - d;
        into[row + x] += a * k * k;
      }
    }
  };
  // Pinned bodies wander less and are shoved less by the scroll than the
  // free ones, so they never stray far from their element. Each is a core
  // and a halo. The core's weight is high enough that the element itself
  // sits in solid line nearly all the time, with the fall-off just past its
  // edges; the halo is a larger, far lighter body that reaches further
  // above and below in dots and light dashes only.
  // PIN_SIZE scales every radius of a pinned body together.
  const PIN_SIZE = lines ? 1 : 0.5, PIN_SCALE = 0.9, PIN_PAD_X = lines ? 60 : 120, PIN_PAD_Y = lines ? 50 : 100, PIN_A = lines ? 2.5 : 1.45, PIN_HOLD = 0.45, PIN_WANDER = 5;
  const HALO_PAD_X = 80, HALO_PAD_Y = 300, HALO_A = 0.4;
  // A pinned body is carried along with the matrix parallax as the page
  // scrolls, then drawn back to its element over about PIN_RETURN seconds.
  const PIN_RETURN = 1.8, PIN_DRIFT_MAX = 160;
  // Around the core, LOBES smaller bodies orbit slowly on their own phases,
  // each swelling and shrinking as it goes. Summed with the core they keep
  // its centre solid but pull its outline into a shape that is never the
  // same ellipse twice.
  const LOBES = 4, LOBE_A = lines ? 1.1 : 0.7;
  // Summed pinned bodies are capped so a headline's brightness is bounded.
  const PIN_CAP = lines ? Infinity : 1.9;
  // The cursor is a body too, pinned to the pointer the same way but held
  // much tighter: a firmer spring, a short parallax carry and a quick
  // return, so it stays under the hand. It fades in and out over CUR_FADE
  // seconds as the pointer arrives and leaves, and is capped so on its own
  // it never reaches the solid step of the ramp.
  const CUR_RX = 90, CUR_RY = 70, CUR_A = 1.0, CUR_HOLD = 0.35, CUR_RETURN = 0.75, CUR_DRIFT_MAX = 90;
  const CUR_HALO_RX = 200, CUR_HALO_RY = 240, CUR_HALO_A = 0.5, CUR_LOBES = 3, CUR_LOBE_A = 0.6, CUR_FADE = 0.35;
  const CUR_CAP = 0.7, CUR_EASE = 0.11;
  const cur = { w: 2 * Math.PI * HZ * 1.3, m: 0.6, s: 0, v: 0, sx: 0, vx: 0, st: 1, sw: 1, drift: 0, lastOff: 0 };
  const pins = [];
  const pinState = new Map();
  // A click or tap draws the goo to it, as the cursor does but heavier: a
  // body wells up at the point over WELL_IN seconds and sinks back over
  // WELL_OUT, and the free bodies within WELL_RANGE are tugged toward it
  // once, then swing home on their springs.
  const WELL_IN = 0.22, WELL_OUT = 2.6, WELL_R = 170, WELL_A = 1.1, WELL_RANGE = 700, WELL_TUG = 150;
  const wells = [];
  // The click also sends out a ring of warmer light: no new marks, only a
  // tint on the marks already there, RING_W px wide, moving out slowly at
  // RING_SPEED px/s and gone after RING_LIFE seconds. Its colour is --ring,
  // and the marks under it are drawn up to 1 + RING_LIFT times as strong.
  const RING_SPEED = 480, RING_LIFE = 1.125, RING_W = 56, RING_A = 1, RING_LIFT = 2.5;
  const rings = [];
  const ringAt = (o) => { const u = o.age / RING_LIFE; return Math.min(1, o.age / 0.1) * (1 - u) * (1 - u) * (1 - u); };
  let ringCol = '255,221,0';
  const LIVE_SPEED = 3800, LIVE_TAIL = 1100, LIVE_A = 0.28, LIVE_TINT = 0.8;
  const lives = [];
  let liveCol = '240,162,60';
  const liveAt = (o, dy) => {
    const behind = o.age * LIVE_SPEED - dy;
    if (behind < 0 || behind >= LIVE_TAIL) return 0;
    const u = 1 - behind / LIVE_TAIL;
    return u * u;
  };
  // Content repels the field, as the headline and the cursor attract it.
  // Every line of text on the page, and every image, is stamped into a mask
  // over the cells; the mask eases toward the stamp, quickly as content
  // arrives and slowly as it leaves, so the goo is pushed out of the way of
  // a paragraph and flows back into the space it leaves. Under the blurred
  // mask the free bodies are sampled from PUSH cells up its slope and CLEAR
  // of their weight is lifted out. None of that weight is thrown away: it
  // spreads outward, SPILL_STEPS times, and wherever it finds itself clear
  // of the content it settles, so the goo taken from under a paragraph is
  // heaped along its edges, most where most was taken. What is still under
  // the content after the last step is shared out over what has settled, so
  // no goo is lost however much of the page is content (up to SPILL_MAX
  // times what settled, in case there is next to nowhere to go). Text
  // inside a data-blob element is exempt: that is where the field gathers.
  const CLEAR = 0.25, PUSH = 7, SPILL_MAX = 3, SPILL_STEPS = 18, LIFT = 1.8, PAD_X = 28, PAD_Y = 16, REPEL_IN = 0.35, REPEL_OUT = 0.8;
  // Lines in the page's flow are kept in document coordinates. Anything
  // stuck to the screen is read where it is each frame.
  let flow = [], stuck = [], lastWhole = null, measured = false;
  // An image repels most at its centre and hardly at all at its edges, up to
  // IMG times what text does, so the field is not seen stepping around it;
  // what shows is the hollow it leaves filling in once it has gone.
  const IMG = 2;
  let mask = new Float32Array(0), want = new Float32Array(0), soft = new Float32Array(0), tmp = new Float32Array(0);
  let freed = new Float32Array(0), disp = new Float32Array(0), dep = new Float32Array(0);
  let imask = new Float32Array(0), iwant = new Float32Array(0), flowImg = [], stuckImg = [];

  const resize = (width, height, pixelRatio = 1) => {
    dpr = Math.min(preset.maxDpr ?? 2, pixelRatio || 1);
    W = width; H = height;
    c.width = Math.round(W * dpr); c.height = Math.round((H + 2 * OVER) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spriteCol = '';
    cols = Math.ceil(W / cw) + 1; rows = Math.ceil((H + 2 * OVER) / ch) + 2;
    acc = new Float32Array(cols * rows); pacc = new Float32Array(cols * rows); cacc = new Float32Array(cols * rows);
    imask = new Float32Array(cols * rows); iwant = new Float32Array(cols * rows);
    mask = new Float32Array(cols * rows); want = new Float32Array(cols * rows); soft = new Float32Array(cols * rows); tmp = new Float32Array(cols * rows);
    freed = new Float32Array(cols * rows); disp = new Float32Array(cols * rows); dep = new Float32Array(cols * rows);
    lastWhole = null;
    gridX = Math.max(1, Math.round(W / 240)); gridY = Math.max(1, Math.round(H / 240));
    perBand = gridX * gridY; live.clear();
  };

  let col = lines ? '233,238,247' : '232,230,223', gain = 1, floor = 0.025;
  // The ink, its gain and the alpha of the faintest mark come from the
  // theme: dark ink on a light ground needs more alpha to read the same as
  // light ink on a dark one, and its faintest marks need more still.
  const rgb = () => {
    const theme = bus.get('theme') || {};
    gain = theme.gain ?? 1;
    floor = theme.floor ?? 0.025;
    ringCol = theme.ring || ringCol;
    liveCol = theme.live || liveCol;
    return theme.ink || col;
  };

  const draw = (dt, at, forceStill = false) => {
    rm = forceStill || !!bus.get('reducedMotion');
    f.scroll = bus.get('scroll.px') ?? f.scroll;
    const pointer = bus.get('pointer');
    if (pointer) {
      f.tx = pointer.x * W; f.ty = pointer.y * H; f.cur = pointer.present ? 1 : 0;
    }
    const tilt = bus.get('tilt');
    if (tilt?.active) { f.ax = tilt.x; f.ay = tilt.y; f.tilt = true; }
    for (const click of bus.drain('click')) {
      const x = click.x * W, y = click.y * H, age = click.age || 0;
      if (age < WELL_IN + WELL_OUT) wells.push({ x, y, age, fresh: age === 0 });
      if (lineEffect) {
        if (age < (H + OVER + LIVE_TAIL) / LIVE_SPEED) lives.push({ col: Math.floor(x / cw), y, age });
      } else if (ringEffect && age < RING_LIFE) rings.push({ x, y, age });
      else customClick?.onClick?.({ x, y, age, width: W, height: H, cellWidth: cw, cellHeight: ch });
    }
    for (const note of bus.drain('midi.note')) {
      if (preset.midiPulse && note.on) wells.push({ x: note.note / 127 * W, y: H * 0.5, age: 0, fresh: true, power: note.velocity });
    }
    ctx.clearRect(0, 0, W, H + 2 * OVER);
    if (at !== undefined) f.t = at;
    if (!rm) {
      // The field's clock is the wall clock, so the field is a function of
      // the time of day: it carries on across reloads and from page to page,
      // and is the same for everyone watching at the same size and scroll.
      f.t = at ?? bus.get('clock') ?? Date.now() / 1000;
      if (f.mx < -1e3) { f.mx = f.tx; f.my = f.ty; }
      f.mx += (f.tx - f.mx) * CUR_EASE; f.my += (f.ty - f.my) * CUR_EASE;
      f.pres += (f.cur - f.pres) * Math.min(1, dt / CUR_FADE);
      // Tray speed in px/s, eased just enough that a wheel tick is a shove.
      // Its acceleration is taken from a slower speed and smoothed again:
      // scroll deltas arrive in uneven bunches, and a derivative of them
      // flickers unless it is filtered harder than the speed itself.
      const v = (f.scroll - f.lastScroll) / dt; f.lastScroll = f.scroll;
      f.vel += (v - f.vel) * 0.5;
      const was = f.slow; f.slow += (v - f.slow) * 0.25;
      f.acc += ((f.slow - was) / dt - f.acc) * 0.3;
      const lag = Math.max(-MAX_LAG, Math.min(MAX_LAG, -f.vel * LAG));
      // Taken up at once in the same direction; a reversal turns over
      // quickly but not in a single frame, which would flash the field.
      if (Math.abs(lag) > Math.abs(f.amp) && lag * f.amp >= 0) f.amp = lag;
      else f.amp += (lag - f.amp) * Math.min(1, dt / (lag * f.amp < 0 ? 0.08 : FOLLOW));
      const u = Math.min(1, Math.abs(f.vel) / RELEASE), grip = u * u * (3 - 2 * u);
      // The sliding matrix is the tray. The goop hangs back behind it while
      // dragged and is thrown on past it as the tray slows: it lags the
      // tray, never leads it.
      f.pull = -Math.max(-MAX_LAG * 1.5, Math.min(MAX_LAG * 1.5, f.amp * grip - f.acc * INERTIA));
      f.zeta = ZETA + (1 - ZETA) * grip;
      // Tilt: the pull is the hand's lean from its slowly following rest pose.
      if (f.bx === null && f.tilt) { f.bx = f.ax; f.by = f.ay; }
      if (f.bx !== null) {
        const s = Math.min(1, dt / TILT_SETTLE), e = Math.min(1, dt / TILT_EASE);
        f.bx += (f.ax - f.bx) * s; f.by += (f.ay - f.by) * s;
        f.gx += (Math.max(-MAX_TILT, Math.min(MAX_TILT, (f.ax - f.bx) * TILT)) - f.gx) * e;
        f.gy += (Math.max(-MAX_TILT, Math.min(MAX_TILT, (f.ay - f.by) * TILT)) - f.gy) * e;
      }
    }
    // Sprites are rebuilt whenever the ink changes, so a theme switch
    // recolours the field on its next frame.
    col = rgb();
    if (col !== spriteCol) { spriteCol = col; inkDark = inkIsDark(); sprites = build(); }
    const mapped = preset.mapSignals?.(bus) || {};
    const drift = mapped.drift ?? DRIFT, gainScale = mapped.gain ?? 1;
    if (!rm) driftOffset += (drift - DRIFT) * dt;
    const t = f.t, off = f.scroll * PARALLAX;
    const staticGridShift = preset.staticBodies ? OVER % ch : 0;
    const slide = step(off / ch), shift = (slide.frac - 1) * ch + staticGridShift;
    // Matrix row 0 shows this much of the field above the top of the screen.
    const top = (slide.whole - 1) * ch;
    acc.fill(0); pacc.fill(0);
    for (let i = wells.length - 1; i >= 0; i--) {
      const o = wells[i];
      o.fresh = !rm && o.age === 0; o.age += dt;
      if (o.age >= WELL_IN + WELL_OUT) wells.splice(i, 1);
    }
    if (preset.staticBodies) {
      for (const [x, y, rx, ry, weight] of preset.staticBodies) splat(x, y - top - staticGridShift, rx, ry, weight, acc);
    } else {
      const b0 = Math.floor(off / H) - 1, b1 = Math.floor((off + H) / H) + 1;
      for (let b = b0; b <= b1; b++) for (let i = 0; i < perBand; i++) {
        const o = blob(b, i);
        o.seen = t;
        if (!rm) spring(o, dt);
        // The whole field drifts slowly across the screen, wrapping at the
        // edges, and each body wanders and breathes on its own on top of that.
        const wander = Math.sin(t * 0.3 + o.ph) * 40, breathe = 1 + 0.1 * Math.sin(t * 0.5 + o.ph * 2);
        const span = W + 2 * o.r;
        const cx = ((o.x * W + t * DRIFT + driftOffset + wander + o.r) % span + span) % span - o.r + o.sx;
        const cy = o.y * H - top + o.s + Math.cos(t * 0.23 + o.ph) * 30;
        for (const p of wells) {
          if (!p.fresh) continue;
          const dx = p.x - cx, dy = p.y - shift - cy, d = Math.sqrt(dx * dx + dy * dy);
          if (d >= WELL_RANGE) continue;
          const k = 1 - d / WELL_RANGE, imp = WELL_TUG * k * k / (d || 1);
          o.vx += dx * imp; o.v += dy * imp;
        }
        const [ax, ay] = shape(o);
        splat(cx, cy, o.r * breathe * ax, o.r * breathe * ay, o.a, acc);
      }
      for (const [key, o] of live) if (o.seen !== t) live.delete(key);
    }
    // Pinned bodies sit behind marked elements. They hang on the same
    // springs and wander and breathe like the rest, but their rest point is
    // the element itself, wherever it is on screen this frame, so they
    // follow it through the page's own scroll rather than the parallax.
    for (const o of pins) {
      // The text's own box, not the element's, which for a heading is the
      // whole column.
      const b = o.rect;
      if (!lines && (b.bottom < -HALO_PAD_Y || b.top > H + HALO_PAD_Y)) { o.lastOff = off; continue; }
      if (!rm) {
        spring(o, dt);
        // Carried with the matrix as it slides, then eased home.
        o.drift = Math.max(-PIN_DRIFT_MAX, Math.min(PIN_DRIFT_MAX, o.drift - (off - o.lastOff)));
        o.drift -= o.drift * Math.min(1, dt / PIN_RETURN);
      }
      o.lastOff = off;
      const breathe = 1 + 0.06 * Math.sin(t * 0.5 + o.ph * 2);
      const cx = b.left + b.width / 2 + o.sx * PIN_HOLD + Math.sin(t * 0.3 + o.ph) * PIN_WANDER;
      const cy = b.top + b.height / 2 - shift + o.drift + o.s * PIN_HOLD + Math.cos(t * 0.23 + o.ph) * PIN_WANDER;
      const sc = PIN_SCALE * PIN_SIZE * breathe, hs = PIN_SIZE * breathe, [ax, ay] = shape(o);
      splat(cx, cy, (b.width / 2 + PIN_PAD_X) * sc * ax, (b.height / 2 + PIN_PAD_Y) * sc * ay, PIN_A, pacc);
      splat(cx, cy, (b.width / 2 + HALO_PAD_X) * hs * ax, (b.height / 2 + HALO_PAD_Y) * hs * ay, HALO_A, pacc);
      for (let j = 0; j < LOBES; j++) {
        const q = lines ? j : j + o.i * LOBES, p1 = hash(8, q, 1) * 6.28, p2 = hash(8, q, 2) * 6.28, p3 = hash(8, q, 3) * 6.28;
        const w1 = 0.11 + hash(8, q, 4) * 0.1, w2 = 0.13 + hash(8, q, 5) * 0.1;
        const lx = cx + Math.cos(t * w1 + p1) * (b.width * 0.45) * PIN_SIZE, ly = cy + Math.sin(t * w2 + p2) * (b.height * 0.5 + 30) * PIN_SIZE;
        const swell = (0.8 + 0.25 * Math.sin(t * 0.37 + p3)) * PIN_SCALE * PIN_SIZE;
        splat(lx, ly, (b.width * 0.35 + 30) * swell * ax, (b.height * 0.6 + 30) * swell * ay, LOBE_A, pacc);
      }
    }
    // The cursor body.
    if (f.pres > 0.01 && f.mx > -1e3) {
      if (!rm) {
        spring(cur, dt);
        cur.drift = Math.max(-CUR_DRIFT_MAX, Math.min(CUR_DRIFT_MAX, cur.drift - (off - cur.lastOff)));
        cur.drift -= cur.drift * Math.min(1, dt / CUR_RETURN);
      }
      cur.lastOff = off;
      const breathe = 1 + 0.06 * Math.sin(t * 0.6), pres = f.pres * f.pres;
      const cx = f.mx + cur.sx * CUR_HOLD, cy = f.my - shift + cur.drift + cur.s * CUR_HOLD;
      const [ax, ay] = shape(cur);
      const rx = CUR_HALO_RX * breathe * ax, ry = CUR_HALO_RY * breathe * ay;
      const bx0 = Math.max(0, Math.floor((cx - rx) / cw)), bx1 = Math.min(cols - 1, Math.ceil((cx + rx) / cw));
      const by0 = Math.max(0, Math.floor((cy + OVER - ry) / ch)), by1 = Math.min(rows - 1, Math.ceil((cy + OVER + ry) / ch));
      for (let y = by0; y <= by1; y++) cacc.fill(0, y * cols + bx0, y * cols + bx1 + 1);
      splat(cx, cy, CUR_RX * breathe * ax, CUR_RY * breathe * ay, CUR_A * pres, cacc);
      splat(cx, cy, rx, ry, CUR_HALO_A * pres, cacc);
      for (let j = 0; j < CUR_LOBES; j++) {
        const p1 = hash(9, j, 1) * 6.28, p2 = hash(9, j, 2) * 6.28, p3 = hash(9, j, 3) * 6.28;
        const w1 = 0.15 + hash(9, j, 4) * 0.12, w2 = 0.17 + hash(9, j, 5) * 0.12;
        const lx = cx + Math.cos(t * w1 + p1) * 50, ly = cy + Math.sin(t * w2 + p2) * 45;
        const swell = 0.8 + 0.25 * Math.sin(t * 0.4 + p3);
        splat(lx, ly, 55 * swell * ax, 50 * swell * ay, CUR_LOBE_A * pres, cacc);
      }
      for (let y = by0; y <= by1; y++) for (let i = y * cols + bx0, e = y * cols + bx1; i <= e; i++) pacc[i] += Math.min(CUR_CAP, cacc[i]);
    } else if (!rm) { cur.lastOff = off; }
    // Wells ride with the pinned bodies, so text does not push them away.
    for (const p of wells) {
      const u = p.age < WELL_IN ? p.age / WELL_IN : 1 - (p.age - WELL_IN) / WELL_OUT;
      const e = p.age < WELL_IN ? u * u * (3 - 2 * u) : u * u;
      splat(p.x, p.y - shift, WELL_R * (0.55 + 0.45 * e), WELL_R * (0.55 + 0.45 * e), WELL_A * e * (p.power ?? 1), pacc);
    }
    // The mask is fixed to the screen, and the matrix steps a row under it
    // whenever the parallax passes a whole cell, so it is rolled to match.
    if (lastWhole !== null && slide.whole !== lastWhole) {
      const d = slide.whole - lastWhole, n = Math.abs(d) * cols;
      for (const m of [mask, imask]) {
        if (n >= m.length) m.fill(0);
        else if (d > 0) { m.copyWithin(0, n); m.fill(0, m.length - n); }
        else { m.copyWithin(n, 0, m.length - n); m.fill(0, 0, n); }
      }
    }
    lastWhole = slide.whole;
    want.fill(0); iwant.fill(0);
    const stamp = (l, t, r, b) => {
      l -= PAD_X; r += PAD_X; t += OVER - shift - PAD_Y; b += OVER - shift + PAD_Y;
      if (r <= 0 || l >= cols * cw || b <= 0 || t >= rows * ch) return;
      const x0 = Math.max(0, Math.floor(l / cw)), x1 = Math.min(cols - 1, Math.floor(r / cw));
      const y0 = Math.max(0, Math.floor(t / ch)), y1 = Math.min(rows - 1, Math.floor(b / ch));
      for (let y = y0; y <= y1; y++) {
        const fy = (Math.min(b, y * ch + ch) - Math.max(t, y * ch)) / ch, row = y * cols;
        for (let x = x0; x <= x1; x++) {
          const k = fy * (Math.min(r, x * cw + cw) - Math.max(l, x * cw)) / cw;
          if (k > want[row + x]) want[row + x] = k;
        }
      }
    };
    const dome = (l, t, r, b) => {
      t += OVER - shift; b += OVER - shift;
      if (r <= 0 || l >= cols * cw || b <= 0 || t >= rows * ch) return;
      const mx = (l + r) / 2, my = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
      const x0 = Math.max(0, Math.floor(l / cw)), x1 = Math.min(cols - 1, Math.floor(r / cw));
      const y0 = Math.max(0, Math.floor(t / ch)), y1 = Math.min(rows - 1, Math.floor(b / ch));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x * cw + cw / 2 - mx) / rx, dy = (y * ch + ch / 2 - my) / ry, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const k = (1 - d) * (1 - d);
        if (k > iwant[y * cols + x]) iwant[y * cols + x] = k;
      }
    };
    const sx = bus.get('scroll.x') ?? 0, sy = bus.get('scroll.px') ?? 0;
    for (const o of flow) if (o.b - sy > -OVER && o.t - sy < H + OVER) stamp(o.l - sx, o.t - sy, o.r - sx, o.b - sy);
    for (const b of stuck) if (b.width > 0) stamp(b.left, b.top, b.right, b.bottom);
    for (const o of flowImg) if (o.b - sy > -OVER && o.t - sy < H + OVER) dome(o.l - sx, o.t - sy, o.r - sx, o.b - sy);
    for (const b of stuckImg) if (b.width > 0) dome(b.left, b.top, b.right, b.bottom);
    // Until the page has been measured the mask is held as it is: it may be
    // the one carried over from the last page.
    const up = rm ? 1 : measured ? Math.min(1, dt / REPEL_IN) : 0, down = rm ? 1 : measured ? Math.min(1, dt / REPEL_OUT) : 0;
    let anyMask = false;
    for (let i = 0; i < mask.length; i++) {
      const d = want[i] - mask[i];
      mask[i] += d * (d > 0 ? up : down);
      const e = iwant[i] - imask[i];
      imask[i] += e * (e > 0 ? up : down);
      if (mask[i] > 0.004 || imask[i] > 0.004) anyMask = true;
    }
    // Two binomial passes each way soften the mask into a slope to push along.
    if (anyMask) {
      let from = mask;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < rows; y++) for (let x = 0, i = y * cols; x < cols; x++, i++)
          tmp[i] = (from[x > 0 ? i - 1 : i] + 2 * from[i] + from[x < cols - 1 ? i + 1 : i]) * 0.25;
        for (let y = 0; y < rows; y++) for (let x = 0, i = y * cols; x < cols; x++, i++)
          soft[i] = (tmp[y > 0 ? i - cols : i] + 2 * tmp[i] + tmp[y < rows - 1 ? i + cols : i]) * 0.25;
        from = soft;
      }
      // A single line is thinner than the blur, so the slope is lifted until
      // one line clears as well as a paragraph does.
      for (let i = 0; i < soft.length; i++) soft[i] = Math.min(1, soft[i] * LIFT) + IMG * imask[i];
      let taken = 0, settled = 0;
      dep.fill(0);
      for (let y = 0; y < rows; y++) for (let x = 0, i = y * cols; x < cols; x++, i++) {
        let a = acc[i];
        const gx = (soft[x < cols - 1 ? i + 1 : i] - soft[x > 0 ? i - 1 : i]) * 0.5;
        const gy = (soft[y < rows - 1 ? i + cols : i] - soft[y > 0 ? i - cols : i]) * 0.5;
        if (gx || gy) {
          // The goo here came from up the slope, toward the content.
          const ux = Math.max(0, Math.min(cols - 1.001, x + gx * PUSH)), uy = Math.max(0, Math.min(rows - 1.001, y + gy * PUSH));
          const ix = ux | 0, iy = uy | 0, fx = ux - ix, fy = uy - iy, j = iy * cols + ix;
          a = (acc[j] * (1 - fx) + acc[j + 1] * fx) * (1 - fy) + (acc[j + cols] * (1 - fx) + acc[j + cols + 1] * fx) * fy;
        }
        const take = a * Math.min(1, CLEAR * soft[i]);
        freed[i] = a - take; disp[i] = take; taken += take;
      }
      // Wide strides and narrow ones by turns: the wide carry the weight out
      // from the middle of a paragraph, the narrow smooth what they leave.
      for (let k = 0; k < spillSteps; k++) {
        const d = [4, 2, 1][k % 3], dc = d * cols;
        for (let y = 0; y < rows; y++) for (let x = 0, i = y * cols; x < cols; x++, i++)
          tmp[i] = (disp[x >= d ? i - d : i] + 2 * disp[i] + disp[x < cols - d ? i + d : i]) * 0.25;
        for (let y = 0; y < rows; y++) for (let x = 0, i = y * cols; x < cols; x++, i++) {
          const v = (tmp[y >= d ? i - dc : i] + 2 * tmp[i] + tmp[y < rows - d ? i + dc : i]) * 0.25, s = Math.min(1, soft[i]);
          const out = v * (1 - s);
          dep[i] += out; settled += out; disp[i] = v * s;
        }
      }
      const share = settled > 1e-6 ? Math.min(SPILL_MAX, taken / settled) : 0;
      for (let i = 0; i < freed.length; i++) freed[i] += dep[i] * share;
    }
    const free = anyMask ? freed : acc;

    ctx.save();
    ctx.translate(0, shift);
    const y0 = rm || f.scroll <= 0 ? 0 : Math.max(0, Math.floor((OVER - shift) / ch) - 1);
    const y1 = rm || f.scroll >= (bus.get('scroll.height') ?? H) - H - 1 ? rows : Math.min(rows, Math.ceil((OVER + H - shift) / ch) + 1);
    for (let y = y0; y < y1; y++) {
      const py = y * ch, row = y * cols;
      for (let x = 0; x < cols; x++) {
        const px = x * cw;
        const v = (free[row + x] + Math.min(PIN_CAP, pacc[row + x])) * 0.62;
        let lit = 0;
        if (lineEffect) for (const o of lives) {
          if (o.col !== x) continue;
          lit = Math.max(lit, liveAt(o, Math.abs(py + ch / 2 + shift - OVER - o.y)));
        }
        // Under everything is a stipple: half the cells carry faint dots,
        // fixed to the matrix so it slides with it. Toward a body the dashes
        // fill in to a fringe, and the body's heavier lines sit on top.
        if (lit < 0.02 && v < 0.36 && hash(x, y + slide.whole, 9) >= 0.5 + 0.5 * Math.max(0, Math.min(1, (v - 0.08) / 0.28))) continue;
        // The ramp leans light: the dot and sparse shade carry the stipple
        // and fringe, the light and medium shades the body.
        let i = 0; while (i < STEPS.length && v >= STEPS[i]) i++;
        if (lineEffect && lit >= 0.02) i = RAMP.length - 1;
        let lift = 0;
        if (ringEffect) for (const o of rings) {
          const dx = px + cw / 2 - o.x, dy = py + ch / 2 + shift - OVER - o.y;
          const d = Math.abs(Math.sqrt(dx * dx + dy * dy) - o.age * RING_SPEED) / (RING_W / 2);
          if (d < 1) lift += (1 - d) * (1 - d) * ringAt(o);
        }
        let tw = 1;
        if (i === 0 && !rm) {
          const k = 0.5 + 0.5 * Math.sin(t * (0.4 + hash(x, y + slide.whole, 21) * 1.2) + hash(x, y + slide.whole, 22) * 6.28);
          tw = TWINKLE_REST + TWINKLE * k * k * k;
        }
        const baseAlpha = lines
          ? Math.min(0.11, 0.06 + Math.max(0, v - 0.1) * 0.1) * tw
          : Math.min(0.17 * gain, floor + Math.max(0, v - 0.1) * 0.12 * gain) * (inkDark ? (LIGHT_STEP[i] ?? 1) : 1) * tw;
        ctx.globalAlpha = (lineEffect ? baseAlpha + LIVE_A * lit : baseAlpha * (1 + RING_LIFT * Math.min(1, lift))) * gainScale;
        ctx.drawImage(sprites[i][hash(x, y + slide.whole, 13) * VARIANTS | 0], px - GLOW, py - GLOW, cw + 2 * GLOW, ch + 2 * GLOW);
      }
    }
    ctx.restore();
    if (lineEffect && lives.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = lives.length - 1; i >= 0; i--) {
        const o = lives[i];
        const reach = o.age * LIVE_SPEED + ch, g = ctx.createLinearGradient(0, o.y + OVER - reach, 0, o.y + OVER + reach);
        for (let k = 0; k <= 32; k++) g.addColorStop(k / 32, 'rgba(' + liveCol + ',' + LIVE_TINT * liveAt(o, Math.abs(k / 16 - 1) * reach) + ')');
        ctx.globalAlpha = 1; ctx.fillStyle = g;
        ctx.fillRect(o.col * cw - 3, o.y + OVER - reach, cw + 6, 2 * reach);
        o.age += dt;
        if (o.age >= (H + OVER + LIVE_TAIL) / LIVE_SPEED) lives.splice(i, 1);
      }
      ctx.restore();
    }
    // The rings tint what is drawn and nothing else.
    if (ringEffect && rings.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = rings.length - 1; i >= 0; i--) {
        const o = rings[i];
        o.age += dt;
        if (o.age >= RING_LIFE) { rings.splice(i, 1); continue; }
        const R = o.age * RING_SPEED, a = RING_A * ringAt(o);
        const r0 = Math.max(0, R - RING_W / 2), r1 = R + RING_W / 2, mid = (R - r0) / (r1 - r0);
        const g = ctx.createRadialGradient(o.x, o.y + OVER, r0, o.x, o.y + OVER, r1);
        g.addColorStop(0, 'rgba(' + ringCol + ',0)'); g.addColorStop(mid, 'rgba(' + ringCol + ',' + a + ')'); g.addColorStop(1, 'rgba(' + ringCol + ',0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g;
        ctx.fillRect(o.x - r1, o.y + OVER - r1, 2 * r1, 2 * r1);
      }
      ctx.restore();
    }
    customClick?.draw?.({ ctx, width: W, height: H, time: f.t, dt, still: rm, over: OVER, cellWidth: cw, cellHeight: ch });
  };

  const setContent = (content) => {
    flow = content.flowText || [];
    stuck = content.fixedText || [];
    flowImg = content.flowMedia || [];
    stuckImg = content.fixedMedia || [];
    pins.length = 0;
    const active = new Set();
    for (const [i, pin] of (content.pins || []).entries()) {
      const id = pin.id ?? i;
      active.add(id);
      let o = pinState.get(id);
      if (!o) {
        o = {
          i, w: 2 * Math.PI * HZ * (0.85 + hash(7, i, 5) * 0.3), ph: hash(7, i, 6) * 6.28,
          m: 0.8 + hash(7, i, 7) * 0.4, s: 0, v: 0, sx: 0, vx: 0, st: 1, sw: 1, drift: 0, lastOff: 0,
        };
        pinState.set(id, o);
      }
      o.rect = pin.rect;
      pins.push(o);
    }
    for (const id of pinState.keys()) if (!active.has(id)) pinState.delete(id);
    measured = true;
  };

  const pack = (m) => {
    let s = '';
    for (let i = 0; i < m.length; i++) s += String.fromCharCode(Math.round(Math.max(0, Math.min(1, m[i])) * 255));
    return btoa(s);
  };
  const unpack = (s, m) => {
    const b = atob(s);
    if (b.length === m.length) for (let i = 0; i < m.length; i++) m[i] = b.charCodeAt(i) / 255;
  };
  const snapshot = () => ({
    cursor: { x: f.mx, y: f.my, cur: f.cur },
    mask: { cols, rows, mask: pack(mask), imask: pack(imask) },
  });
  const restore = (state) => {
    const k = state?.cursor;
    if (k?.cur && k.x > -1e3) { f.tx = f.mx = k.x; f.ty = f.my = k.y; f.cur = f.pres = 1; }
    const m = state?.mask;
    if (m?.cols === cols && m.rows === rows) { unpack(m.mask, mask); unpack(m.imask, imask); }
  };

  const setQuality = (cellScale, passes) => {
    if (cellScale === cw / baseCW && passes === spillSteps) return;
    cw = baseCW * cellScale; ch = baseCH * cellScale;
    spillSteps = passes;
    RAMP = ramp();
    if (W && H) resize(W, H, dpr);
  };

  return { resize, draw, setContent, snapshot, restore, setQuality, destroy: () => customClick?.destroy?.(), over: OVER };
}
