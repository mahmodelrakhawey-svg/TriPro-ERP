import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  test: {
    globals: true,
    environment: 'jsdom', // محاكاة بيئة المتصفح
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'modules/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '.git/**'],
  },
});