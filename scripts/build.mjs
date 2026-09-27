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
  build({ ...shared, format: 'esm', outfile: 'dist/living-field.js' }),
  build({ ...shared, format: 'iife', globalName: 'LivingField', minify: true, outfile: 'dist/living-field.iife.js' }),
]);
