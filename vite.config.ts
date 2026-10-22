import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'vmThreads',
    isolate: false,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['node_modules/**', 'tools/**', 'e2e/**', 'vendor/**'],
  },
  build: { chunkSizeWarningLimit: 1200 },
});
