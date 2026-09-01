import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const agent = new http.Agent({ keepAlive: true, family: 4 });

export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5180,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://backend:3000',
        changeOrigin: true,
        secure: false,
        agent: agent,
      }
    }
  }
});
