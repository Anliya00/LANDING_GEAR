import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Plotly is loaded on demand; listing it here has the dev server pre-bundle it at start-up
  // instead of discovering it on the first chart and reloading the page.
  optimizeDeps: { include: ['plotly.js-cartesian-dist-min'] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/aircrafts': 'http://127.0.0.1:8000',
      '/flights': 'http://127.0.0.1:8000',
      '/ingestion': 'http://127.0.0.1:8000',
      '/processing': 'http://127.0.0.1:8000',
      '/analysis': 'http://127.0.0.1:8000',
      '/users': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
});
