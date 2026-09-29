// Cliente de la API: mismo origen (el servidor web reenvía /api al backend), tiempo límite y errores con
// el código estable y la referencia de la petición (ver packages/shared/errors.js en el backend).

const API_BASE = '/api';
const DEFAULT_TIMEOUT_MS = 10000;

// Error de la API con lo que soporte necesita: código estable y referencia de la petición.
export class ApiError extends Error {
  status: number;
  codigo: string | null;
  requestId: string | null;
  data: Record<string, unknown> | null;

  constructor(message: string, status: number, codigo: string | null, requestId: string | null, data: Record<string, unknown> | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.requestId = requestId;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 502 || response.status === 504) {
        throw new ApiError('El servidor de backend no responde o el servicio está tardando demasiado (Gateway Timeout 502/504).', response.status, null, null, null);
      }
      let message = `Error HTTP ${response.status}`;
      let data: Record<string, unknown> | null = null;
      try {
        data = await response.json();
        if (typeof data?.error === 'string') message = data.error;
      } catch {
        // La respuesta no era JSON: queda el mensaje genérico con el estado HTTP.
      }
      const codigo = typeof data?.codigo === 'string' ? data.codigo : null;
      const requestId = (typeof data?.requestId === 'string' ? data.requestId : null) ?? response.headers.get('X-Request-Id');
      // En una falla del servidor el mensaje no le dice nada al usuario: se agrega qué dictarle a soporte.
      if (response.status >= 500 && requestId) message = `${message} (Código ${codigo || 'ERROR_INTERNO'} · ref. ${requestId})`;
      // La aplicación escucha este evento para volver al inicio de sesión.
      if (codigo === 'SESION_INVALIDA') window.dispatchEvent(new Event('sesion-expirada'));
      throw new ApiError(message, response.status, codigo, requestId, data);
    }

    return await response.json() as T;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`La conexión tardó demasiado (Timeout ${timeoutMs / 1000}s). Verifique su conexión de red Wi-Fi/red local.`);
    }
    throw err;
  }
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) => apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(endpoint: string, options?: RequestOptions) => apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};
