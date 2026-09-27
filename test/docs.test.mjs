import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { launchChromium } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const moduleScript = /<script type="module">([\s\S]*?)<\/script>/;

async function bundleExample(source) {
  const instance = source.match(/\bconst (\w+) = createBlorbo\(/)?.[1];
  assert.ok(instance, 'example does not create a Blorbo instance');
  const result = await build({
    stdin: {
      contents: `${source}\nwindow.__docsInstance = ${instance};`,
      resolveDir: root,
      sourcefile: 'docs-example.js',
    },
    bundle: true, platform: 'browser', format: 'iife', write: false, metafile: true,
  });
  assert.ok(Object.keys(result.metafile.inputs).some((path) => path.endsWith('dist/blorbo.js')),
    'example did not import the built package');
  return result.outputFiles[0].text;
}

test('documented examples execute against the built package', async (t) => {
  const blocks = [];
  for (const path of ['README.md', 'docs/guide.md', 'docs/reference.md']) {
    const markdown = await read(path);
    const fences = [...markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)^```/gm)];
    for (const [, info, source] of fences) {
      assert.match(info, /^(js|html) example$/, `${path}: unlabeled code fence`);
      blocks.push({ path, kind: info.split(' ')[0], source });
    }
  }
  assert.ok(blocks.length, 'no documented examples found');
  const readmePage = blocks.find((block) => block.path === 'README.md' && block.kind === 'html')?.source;
  assert.ok(readmePage, 'README has no quick-start page');
  const fixture = readmePage.replace(moduleScript, '');

  const browser = await launchChromium();
  t.after(() => browser.close());
  const iife = await read('dist/blorbo.iife.js');
  for (const { path, kind, source } of blocks) {
    await t.test(`${path}: ${kind} example`, async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error));
      try {
        if (kind === 'html') {
          const module = source.match(moduleScript);
          const hasIife = source.includes('blorbo.iife.js');
          assert.ok(module || hasIife, `${path}: HTML example does not start Blorbo`);
          await page.route('https://cdn.jsdelivr.net/npm/blorbo/dist/blorbo.iife.js', (route) =>
            route.fulfill({ status: 200, contentType: 'text/javascript', body: iife }));
          await page.setContent(source.replace(moduleScript, ''), { waitUntil: 'load' });
          assert.equal(await page.locator('#blorbo').count(), 1);
          if (module) await page.addScriptTag({ content: await bundleExample(module[1]) });
          if (hasIife) assert.equal(await page.evaluate(() => !!window.field), true);
        } else {
          await page.setContent(fixture);
          await page.addScriptTag({ content: await bundleExample(source) });
        }
        await page.waitForFunction(() => (window.__docsInstance || window.field)?.stats.frames > 0);
        assert.ok(await page.locator('#blorbo').evaluate((canvas) => canvas.width > 0));
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }
});
