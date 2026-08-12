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
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              'vendor-ui': ['lucide-react', 'recharts', 'react-hot-toast'],
              'vendor-antd': ['antd', '@ant-design/icons', '@ant-design/cssinjs'],
              'vendor-utils': ['xlsx', 'jspdf', 'html2canvas'],
              'vendor-supabase': ['@supabase/supabase-js'],
            },
          },
        },
      },
    };
});
