import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { launchChromium } from './browser.mjs';

const mode = process.argv[2];
const siteMode = process.argv.includes('--sites');
if (!['reference', 'compare'].includes(mode)) {
  console.error('Usage: npm run snapshots:reference|snapshots:compare');
  process.exit(2);
}

const here = resolve(import.meta.dirname, '..');
const adambiggsProject = siteMode ? resolve(process.env.BLORBO_ADAMBIGGS_PROJECT || resolve(here, '../adambiggs')) : null;
const sites = siteMode ? {
  gangline: resolve(process.env.BLORBO_GANGLINE_SITE || resolve(here, '../gangline/site')),
  adambiggs: join(adambiggsProject, 'dist'),
} : { rules: here, blocks: here };
const referenceDir = join(here, 'test/reference', ...(siteMode ? [] : ['fixtures']));
const evidenceDir = join(here, '.evidence/snapshots', siteMode ? 'sites' : 'fixtures');
const viewport = { width: 960, height: 640 };
const epoch = Date.UTC(2026, 8, 26, 12);
const cases = ['rest', 'scroll-pointer', 'click'];
const siteSources = siteMode ? {
  gangline: resolve(process.env.BLORBO_GANGLINE_SOURCE || join(sites.gangline, 'blorbo.js')),
  adambiggs: resolve(process.env.BLORBO_ADAMBIGGS_SOURCE || join(adambiggsProject, 'src/components/Blorbo.astro')),
} : null;
const fixtureShared = ['fixture.css', 'fixture.js', 'shape.svg'].map((name) => join(here, 'test/fixtures', name));
const sources = siteMode ? { gangline: [siteSources.gangline], adambiggs: [siteSources.adambiggs] } : {
  rules: [join(here, 'test/fixtures/rules.html'), ...fixtureShared],
  blocks: [join(here, 'test/fixtures/blocks.html'), ...fixtureShared],
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

function serve(root, site) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const path = resolve(root, relative);
      if (path !== root && !path.startsWith(root + sep)) throw new Error('outside site');
      if (!siteMode && path !== join(here, 'dist/blorbo.iife.js') && !path.startsWith(join(here, 'test/fixtures') + sep))
        throw new Error('outside fixture');
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function capture(browser, site, baseUrl, theme, scene) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  // Keep the unrelated demo controls fixed during Blorbo captures.
  if (site === 'gangline') await page.route('**/demo.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((fixedTime) => {
    Date.now = () => fixedTime;
    let callbacks = [], frame = 0;
    window.requestAnimationFrame = (callback) => { callbacks.push(callback); return callbacks.length; };
    window.cancelAnimationFrame = () => {};
    window.__stepBlorboFrames = (count) => {
      for (let i = 0; i < count; i++) {
        frame++;
        const current = callbacks;
        callbacks = [];
        for (const callback of current) callback(frame * (1000 / 60));
      }
    };
  }, epoch);
  const target = siteMode ? baseUrl : new URL(`test/fixtures/${site}.html`, baseUrl).href;
  const response = await page.goto(target, { waitUntil: 'load' });
  if (!response.ok()) throw new Error(`Fixture request returned HTTP ${response.status()}: ${target}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].filter((image) => image.loading !== 'lazy').map((image) => image.decode().catch(() => {}))));
  await page.waitForFunction(() => [...document.querySelectorAll('video')].every((video) => video.readyState >= 1));
  await page.evaluate(() => document.querySelectorAll('video').forEach((video) => video.pause()));
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  await page.evaluate(() => window.__stepBlorboFrames(12));
  if (scene === 'scroll-pointer') {
    await page.evaluate(() => {
      scrollTo({ top: 500, behavior: 'instant' });
      if (scrollY !== 500) throw new Error(`Scroll setup failed: ${scrollY}`);
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new PointerEvent('pointermove', { clientX: 720, clientY: 260 }));
    });
  } else if (scene === 'click') {
    await page.evaluate(() => {
      dispatchEvent(new PointerEvent('pointermove', { clientX: 480, clientY: 320 }));
      dispatchEvent(new MouseEvent('click', { clientX: 480, clientY: 320 }));
    });
  }
  await page.evaluate(() => window.__stepBlorboFrames(24));
  if (errors.length) throw new Error(`Page error: ${errors.join('; ')}`);
  const data = await page.evaluate(({ width, height }) => {
    const blorbo = document.getElementById('blorbo');
    if (!blorbo || blorbo.width !== width) throw new Error(`Blorbo canvas missing or wrong width: ${blorbo?.width}`);
    const output = document.createElement('canvas');
    output.width = width; output.height = height;
    output.getContext('2d').drawImage(blorbo, 0, 240, width, height, 0, 0, width, height);
    return output.toDataURL('image/png').split(',')[1];
  }, viewport);
  await context.close();
  return Buffer.from(data, 'base64');
}

async function pixelDiff(page, actual, expected) {
  return page.evaluate(async ({ actual, expected }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
    };
    const a = await decode(actual), b = await decode(expected);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Reference dimensions differ');
    const canvas = document.createElement('canvas');
    canvas.width = a.width; canvas.height = a.height;
    const context = canvas.getContext('2d');
    const diff = context.createImageData(a.width, a.height);
    let changed = 0, large = 0, sum = 0, max = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      let pixel = 0;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(a.data[i + channel] - b.data[i + channel]);
        pixel = Math.max(pixel, delta);
        sum += delta;
      }
      if (pixel) changed++;
      if (pixel > 8) large++;
      max = Math.max(max, pixel);
      diff.data[i] = pixel ? 255 : 0;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 0;
      diff.data[i + 3] = pixel ? Math.max(64, pixel) : 0;
    }
    context.putImageData(diff, 0, 0);
    return { changed, large, mean: sum / a.data.length, max, pixels: a.width * a.height, diff: canvas.toDataURL('image/png').split(',')[1] };
  }, { actual: actual.toString('base64'), expected: expected.toString('base64') });
}

await mkdir(evidenceDir, { recursive: true });
if (siteMode) {
  const buildLog = join(evidenceDir, 'astro-build.log');
  try {
    const { stdout, stderr } = await promisify(execFile)('npm', ['run', 'build'], { cwd: adambiggsProject, maxBuffer: 10 * 1024 * 1024 });
    await writeFile(buildLog, stdout + stderr);
  } catch (error) {
    await writeFile(buildLog, (error.stdout || '') + (error.stderr || ''));
    throw new Error(`Adam Biggs build failed; see ${buildLog}`, { cause: error });
  }
  console.log(`Adam Biggs build saved to ${buildLog}`);
}
const browser = await launchChromium({ bundled: !siteMode });
const servers = [];
try {
  if (mode === 'reference' && !process.argv.includes('--force')) {
    try {
      await stat(join(referenceDir, 'manifest.json'));
      throw new Error('References already exist. Pass --force to replace them.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const referenceManifest = mode === 'compare' ? JSON.parse(await readFile(join(referenceDir, 'manifest.json'))) : null;
  if (referenceManifest && referenceManifest.chrome !== browser.version()) {
    throw new Error(`Chromium version differs from references: ${browser.version()} vs ${referenceManifest.chrome}`);
  }
  if (referenceManifest && (JSON.stringify(referenceManifest.viewport) !== JSON.stringify(viewport) || referenceManifest.epoch !== epoch)) {
    throw new Error('Reference viewport or clock differs from current harness');
  }
  await mkdir(mode === 'reference' ? referenceDir : evidenceDir, { recursive: true });
  const manifest = { chrome: browser.version(), viewport, epoch, ...(mode === 'compare' ? { roots: sites } : {}), sources: {}, cases: {} };
  const captures = new Map();
  let failures = 0;
  for (const [site, root] of Object.entries(sites)) {
    try {
      const hash = createHash('sha256');
      for (const source of sources[site]) hash.update(await readFile(source));
      manifest.sources[site] = hash.digest('hex');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      manifest.sources[site] = null;
    }
    if (!siteMode && referenceManifest && referenceManifest.sources[site] !== manifest.sources[site])
      throw new Error(`Fixture sources changed: ${site}; regenerate references`);
    const server = await serve(root, site); servers.push(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    for (const theme of ['dark', 'light']) for (const scene of cases) {
      const name = `${site}-${theme}-${scene}`;
      const actual = await capture(browser, site, baseUrl, theme, scene);
      const path = join(referenceDir, `${name}.png`);
      if (mode === 'reference') {
        await writeFile(path, actual);
        manifest.cases[name] = createHash('sha256').update(actual).digest('hex');
        console.log(`${name}: reference saved`);
      } else {
        captures.set(name, actual);
      }
    }
  }
  if (mode === 'compare') {
    const diffPage = await browser.newPage();
    for (const [name, actual] of captures) {
      const expected = await readFile(join(referenceDir, `${name}.png`));
      const expectedHash = createHash('sha256').update(expected).digest('hex');
      if (referenceManifest.cases[name] !== expectedHash) throw new Error(`Reference PNG or manifest changed: ${name}`);
      const { diff, ...metrics } = await pixelDiff(diffPage, actual, expected);
      if (metrics.changed) {
        await writeFile(join(evidenceDir, `${name}.actual.png`), actual);
        await writeFile(join(evidenceDir, `${name}.png`), Buffer.from(diff, 'base64'));
      }
      const pass = metrics.mean <= 0.5 && metrics.large / metrics.pixels <= 0.01;
      if (!pass) failures++;
      manifest.cases[name] = { ...metrics, pass };
      console.log(`${name}: ${pass ? 'PASS' : 'FAIL'} ${metrics.changed}/${metrics.pixels} pixels changed, mean=${metrics.mean.toFixed(3)}, max=${metrics.max}`);
    }
    await diffPage.close();
  }
  await writeFile(join(mode === 'reference' ? referenceDir : evidenceDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (failures) process.exitCode = 1;
} finally {
  for (const server of servers) await new Promise((done) => server.close(done));
  await browser.close();
}
