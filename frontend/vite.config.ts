import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The WildGuard backend (backend/server.py). Override with WILDGUARD_API_URL.
const API_TARGET = process.env.WILDGUARD_API_URL || 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    proxy: {
      // REST API, live MJPEG camera streams and the /api/events SSE stream.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});