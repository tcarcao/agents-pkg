import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // allow tests to import from src
      '@': join(__dirname, 'src'),
    },
  },
});
