import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5180;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';

// Proxy /api requests to Express Backend
app.use(
  '/api',
  createProxyMiddleware({
    target: `${BACKEND_URL.replace(/\/$/, '')}/api`,
    changeOrigin: true,
  })
);

// Serve compiled static assets
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FerreSys Frontend listo en http://0.0.0.0:${PORT}`);
});
