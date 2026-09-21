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
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // Heavy standalone data/export engines (No React runtime dependency)
                if (id.includes('xlsx')) return 'vendor-xlsx';
                if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
                if (id.includes('@supabase')) return 'vendor-supabase';
                
                // Heavy UI component and visualization libraries
                if (id.includes('antd') || id.includes('@ant-design')) return 'vendor-antd';
                if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('@google/genai')) return 'vendor-ai';

                // Core Framework Runtime (dexie included — uses React hooks internally)
                if (id.includes('react') || id.includes('scheduler') || id.includes('dexie')) return 'vendor-react-core';

                // Utility libraries
                if (id.includes('date-fns') || id.includes('dayjs')) return 'vendor-dates';
                if (id.includes('@dnd-kit')) return 'vendor-dnd';
                if (id.includes('zod') || id.includes('@hookform')) return 'vendor-forms';

                // Unified Application Utilities & Helpers
                return 'vendor-app';
              }
            },
          },
        },
      },
    };
});
