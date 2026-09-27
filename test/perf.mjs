import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { launchChromium } from './browser.mjs';

const here = resolve(import.meta.dirname, '..');
const output = join(here, '.evidence/perf/chromium.json');
const cases = [
  { name: 'phone', width: 390, height: 844, dpr: 2 },
  { name: 'tablet', width: 768, height: 1024, dpr: 2 },
  { name: 'desktop', width: 1440, height: 900, dpr: 1 },
];
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
const browser = await launchChromium();
const report = { chrome: browser.version(), cases: {} };
try {
  for (const test of cases) {
    const context = await browser.newContext({ viewport: { width: test.width, height: test.height }, deviceScaleFactor: test.dpr });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/test/perf.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.makeBlorbo);
    const result = await page.evaluate(async () => {
      const next = () => new Promise((done) => requestAnimationFrame(done));
      const percentile = (values, p) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) * p)];
      const sample = async (adaptive, frameBudget) => {
        const blorbo = window.makeBlorbo(adaptive, frameBudget);
        const values = [];
        for (let i = 0; i < 120; i++) {
          await next();
          if (i >= 20) values.push(blorbo.stats.lastFrameMs);
        }
        const result = {
          meanMs: values.reduce((a, b) => a + b, 0) / values.length,
          p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95),
          maxMs: Math.max(...values), quality: blorbo.stats.quality,
          frames: blorbo.stats.frames,
        };
        blorbo.destroy();
        return result;
      };
      return { fixed: await sample(false), adaptive: await sample(true), forcedBudget: await sample(true, 0.2) };
    });
    if (errors.length) throw new Error(`${test.name}: ${errors.join('; ')}`);
    report.cases[test.name] = { ...test, grid: { columns: Math.ceil(test.width / 17) + 1, rows: Math.ceil((test.height + 480) / 21) + 2 }, ...result };
    if (result.forcedBudget.quality < 1) throw new Error(`${test.name}: adaptive quality did not respond to a forced low budget`);
    console.log(`${test.name}: fixed ${result.fixed.meanMs.toFixed(2)} ms/frame (p95 ${result.fixed.p95Ms.toFixed(2)}), adaptive quality ${result.adaptive.quality}, forced quality ${result.forcedBudget.quality}`);
    await context.close();
  }
  await mkdir(resolve(here, '.evidence/perf'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Full report: ${output}`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
