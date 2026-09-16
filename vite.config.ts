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
        chunkSizeWarningLimit: 2500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // Heavy standalone data/export engines (No React runtime dependency)
                if (id.includes('xlsx')) return 'vendor-xlsx';
                if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
                if (id.includes('@supabase')) return 'vendor-supabase';

                // Unified Application Vendor Runtime (Everything else runs unified with React)
                return 'vendor-app';
              }
            },
          },
        },
      },
    };
});
