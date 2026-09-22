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
        chunkSizeWarningLimit: 1000,
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

                // 3. Ant Design Icons (standalone SVG icon set, separate from component logic)
                if (id.includes('@ant-design/icons')) {
                  return 'vendor-ant-icons';
                }

                // 4. Ant Design RC Primitives & Async Validators
                if (
                  id.includes('/rc-') ||
                  id.includes('\\rc-') ||
                  id.includes('@rc-component')
                ) {
                  return 'vendor-rc';
                }

                // 5. Ant Design core components & CSS-in-JS
                if (id.includes('antd') || id.includes('@ant-design')) {
                  return 'vendor-antd';
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
