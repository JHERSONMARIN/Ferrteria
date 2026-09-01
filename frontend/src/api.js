/**
 * Cliente API Centralizado (src/api.js)
 * Incluye AbortController timeout (10s), headers automáticos y manejo de fallos 502/504
 */

const API_BASE = '/api';

export async function apiFetch(endpoint, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
    signal: controller.signal,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 502 || response.status === 504) {
        throw new Error('El servidor de backend no responde o el servicio está tardando demasiado (Gateway Timeout 502/504).');
      }

      let errorMsg = `Error HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch (e) {
        // Fallback
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado (Timeout 10s). Verifique su conexión de red Wi-Fi/red local.');
    }
    throw err;
  }
}

export const api = {
  get: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiFetch(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  patch: (endpoint, body, options) => apiFetch(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint, options) => apiFetch(endpoint, { ...options, method: 'DELETE' }),
};
