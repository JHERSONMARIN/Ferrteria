// Cliente de la API de la consola. La sesión viaja en una cookie propia (ferresys_console).
const request = async (method, path, body) => {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.codigo = data.codigo;
    error.salida = data.salida;
    throw error;
  }
  return data;
};

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path, body) => request('DELETE', path, body),
};
