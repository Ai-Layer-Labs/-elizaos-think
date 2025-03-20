import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['@elizaos/core', 'ethers'],
  esbuildOptions(options) {
    options.mainFields = ['module', 'main'];
    options.conditions = ['import', 'require'];
    options.legalComments = 'none';
  },
  onSuccess: 'node -e "console.log(\"✅ Build completed successfully\")"',
});