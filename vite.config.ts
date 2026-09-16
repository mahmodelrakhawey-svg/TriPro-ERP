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
                // Large libraries
                if (id.includes('xlsx')) return 'vendor-xlsx';
                if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
                if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('@supabase')) return 'vendor-supabase';
                if (id.includes('dexie')) return 'vendor-offline';

                // React Core first
                if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
                  return 'vendor-react';
                }

                // Ant Design split
                if (id.includes('@ant-design/icons')) return 'vendor-antd-icons';
                if (id.includes('@rc-component') || id.includes('rc-') || id.includes('antd')) return 'vendor-antd';

                // Query & State
                if (id.includes('@tanstack')) return 'vendor-query';

                // Forms & Validation
                if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
                  return 'vendor-forms';
                }

                // Date utilities
                if (id.includes('dayjs') || id.includes('date-fns')) return 'vendor-dates';

                // Drag & Drop
                if (id.includes('@dnd-kit')) return 'vendor-dnd';

                return 'vendor-utils';
              }
            },

          },
        },
      },
    };
});
