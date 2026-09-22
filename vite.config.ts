import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/orthanc-api': {
            target: 'http://localhost:8042',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/orthanc-api/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // vendor-ui (antd + rc + ant-icons) = ~1,561 KB unminified. This is a single merged
        // chunk intentionally designed to avoid circular dependency warnings from Rollup.
        // The gzip size is ~484 KB which is acceptable for a production ERP on broadband.
        chunkSizeWarningLimit: 1700,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // 1. Heavy standalone data/export engines
                if (id.includes('xlsx')) return 'vendor-xlsx';
                if (id.includes('jspdf')) return 'vendor-jspdf';
                if (id.includes('html2canvas')) return 'vendor-html2canvas';
                if (id.includes('@supabase')) return 'vendor-supabase';
                if (id.includes('@google/genai')) return 'vendor-ai';

                // 2. Data & Utility libraries
                if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('date-fns') || id.includes('dayjs')) return 'vendor-dates';
                if (id.includes('@dnd-kit')) return 'vendor-dnd';
                if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'vendor-forms';

                // 3+4+5. Ant Design ecosystem in ONE chunk to prevent circular dependency:
                // vendor-rc ↔ vendor-antd ↔ vendor-ant-icons form a circular import graph.
                // Rollup cannot resolve load order for circular chunks, so we merge them all
                // into a single "vendor-ui" chunk which eliminates the circularity entirely.
                if (
                  id.includes('antd') ||
                  id.includes('@ant-design') ||
                  id.includes('/rc-') ||
                  id.includes('\\rc-') ||
                  id.includes('@rc-component')
                ) {
                  return 'vendor-ui';
                }

                // 6. Core Framework Runtime (React + DOM + Scheduler + Router + TanStack Query + Dexie)
                if (
                  id.includes('react') ||
                  id.includes('scheduler') ||
                  id.includes('@remix-run') ||
                  id.includes('@tanstack') ||
                  id.includes('dexie')
                ) {
                  return 'vendor-react-core';
                }
              }
            },
          },
        },
      },
    };
});
