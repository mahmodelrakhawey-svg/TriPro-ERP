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
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('xlsx')) {
                  return 'vendor-xlsx';
                }
                if (id.includes('jspdf') || id.includes('html2canvas')) {
                  return 'vendor-pdf';
                }
                if (id.includes('recharts') || id.includes('d3')) {
                  return 'vendor-charts';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('@supabase')) {
                  return 'vendor-supabase';
                }
                if (id.includes('dexie')) {
                  return 'vendor-offline';
                }
                if (id.includes('antd') || id.includes('@ant-design') || id.includes('@rc-component') || id.includes('rc-')) {
                  return 'vendor-antd';
                }
                return 'vendor-core';
              }
            },
          },
        },
      },
    };
});
