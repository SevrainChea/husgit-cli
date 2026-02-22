import { defineConfig } from 'tsdown';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  outExtensions: () => ({ js: '.js' }),
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    __HUSGIT_VERSION__: JSON.stringify(pkg.version),
  },
});
