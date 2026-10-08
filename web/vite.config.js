import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In sviluppo /api va al backend (BACKEND, predefinito localhost:3001).
// Build: file con hash in /static/ (nginx li serve immutabili), niente mappe dei
// sorgenti, niente script in linea (CSP script-src 'self', blocco K5).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': process.env.BACKEND || 'http://localhost:3001' }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    sourcemap: false,
    assetsInlineLimit: 0
  }
});
