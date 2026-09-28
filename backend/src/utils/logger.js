import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { format } from 'node:util';

// Registro estructurado: una línea JSON por evento, con la empresa y, dentro de una petición, su
// identificador y el usuario. Así, ante la falla de un cliente se filtra por su identificador en vez
// de leer texto suelto:  docker logs <backend> | grep '"requestId":"a1b2c3d4e5f6"'
//
// Al importarse reemplaza console.log/info/warn/error: lo que el resto del código ya escribe con
// console sale en el mismo formato y con el contexto de la petición. Por eso server.js lo importa primero.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;
const COMPANY = process.env.COMPANY_SLUG?.trim() || process.env.COMPANY_NAME?.trim() || null;

const requestContext = new AsyncLocalStorage();

const serializeError = (error) => ({
  name: error.name,
  message: error.message,
  ...(error.code !== undefined && { code: error.code }),
  stack: error.stack,
});

function write(level, message, fields = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const context = requestContext.getStore();
  const entry = {
    time: new Date().toISOString(),
    level,
    company: COMPANY,
    ...(context && { requestId: context.requestId }),
    ...(context?.user && { userId: context.user.id, user: context.user.user }),
    msg: message,
    ...fields,
  };
  if (entry.error instanceof Error) entry.error = serializeError(entry.error);
  (LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout).write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};

// console.error('[ventas] No se pudo cobrar:', error) → msg con el texto y el error aparte, con su pila.
const fromConsole = (level) => (...args) => {
  const error = args.find(arg => arg instanceof Error);
  const rest = args.filter(arg => arg !== error);
  write(level, format(...rest).replace(/:\s*$/, ''), error ? { error } : {});
};
console.log = fromConsole('info');
console.info = fromConsole('info');
console.warn = fromConsole('warn');
console.error = fromConsole('error');

// Peticiones exitosas que se repiten cada pocos segundos (latido de sesión, chequeo de salud):
// solo se registran con LOG_LEVEL=debug.
const QUIET_PATHS = new Set(['/api/health', '/api/auth/me']);
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Middleware: identifica la petición, la devuelve en la cabecera X-Request-Id y registra el resultado.
// Si llega un X-Request-Id válido (de un proxy delante) se respeta, para seguir la misma petición.
export function requestLogger(req, res, next) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID().replaceAll('-', '').slice(0, 12);
  req.id = requestId;
  res.set('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  const context = { requestId, user: null };
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : QUIET_PATHS.has(path) ? 'debug' : 'info';
    requestContext.run(context, () => write(level, 'request', {
      method: req.method,
      path,
      module: path.split('/')[2] || null,
      status,
      ms: Number((process.hrtime.bigint() - startedAt) / 1000000n),
      ...(req.user?.branchId && { branchId: req.user.branchId }),
    }));
  });
  requestContext.run(context, next);
}

// Lo llama la autenticación: desde ahí, todo lo que se registre en la petición lleva al usuario.
export function setRequestUser(user) {
  const context = requestContext.getStore();
  if (context) context.user = { id: user.id, user: user.user };
}
