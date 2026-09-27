import { build } from 'esbuild';

const shared = {
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'browser',
  target: ['safari16.4', 'chrome100', 'firefox100'],
  legalComments: 'none',
  banner: { js: '/* SPDX-License-Identifier: Apache-2.0 */' },
};

await Promise.all([
  build({ ...shared, format: 'esm', outfile: 'dist/blorbo.js' }),
  build({ ...shared, format: 'iife', globalName: 'Blorbo', minify: true, outfile: 'dist/blorbo.iife.js' }),
]);
