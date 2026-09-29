// Límite de intentos fallidos de inicio de sesión (en memoria: cada instancia es una empresa).
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const LIMITS = { userAndIp: 5, ip: 20 };

const records = new Map();

const keysFor = (username, ip) => [
  { key: `user-ip:${String(username).toLowerCase()}|${ip}`, limit: LIMITS.userAndIp },
  { key: `ip:${ip}`, limit: LIMITS.ip },
];

// Devuelve los segundos de bloqueo restantes (0 si puede intentar).
export function secondsBlocked(username, ip) {
  const now = Date.now();
  let remaining = 0;
  for (const { key } of keysFor(username, ip)) {
    const record = records.get(key);
    if (record?.blockedUntil > now) remaining = Math.max(remaining, record.blockedUntil - now);
  }
  return Math.ceil(remaining / 1000);
}

export function registerFailure(username, ip) {
  const now = Date.now();
  for (const { key, limit } of keysFor(username, ip)) {
    const record = records.get(key);
    const current = record && now - record.firstAt < WINDOW_MS ? record : { failures: 0, firstAt: now, blockedUntil: 0 };
    current.failures += 1;
    if (current.failures >= limit) {
      current.blockedUntil = now + BLOCK_MS;
      console.warn(`[login] Bloqueo temporal por intentos fallidos: ${key}`);
    }
    records.set(key, current);
  }
}

export function registerSuccess(username, ip) {
  records.delete(keysFor(username, ip)[0].key);
}

// Limpieza periódica para que la memoria no crezca con registros vencidos.
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of records) {
    if (record.blockedUntil < now && now - record.firstAt > WINDOW_MS) records.delete(key);
  }
}, 10 * 60 * 1000).unref();
