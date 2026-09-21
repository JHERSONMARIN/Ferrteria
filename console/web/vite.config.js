import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api va al backend de la consola; compilado, lo sirve el mismo servicio.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4100,
    proxy: { '/api': { target: process.env.CONSOLE_URL || 'http://127.0.0.1:4000', changeOrigin: true } },
  },
});
