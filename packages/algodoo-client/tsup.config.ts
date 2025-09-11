import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  platform: 'node',
  target: 'es2022',
  splitting: false,
  noExternal: ['ws'],
});
