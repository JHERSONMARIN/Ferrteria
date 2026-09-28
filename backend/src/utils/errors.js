// Errores con código estable. Toda respuesta de error de la API tiene la forma
//   { error: 'mensaje para el usuario', codigo: 'CAJA_NO_ABIERTA', requestId: 'a1b2c3d4e5f6' }
// El mensaje puede cambiar de redacción; el código no: soporte lo pregunta y sabe dónde mirar, y con
// el requestId encuentra la línea exacta del registro (ver utils/logger.js).
//
// Códigos específicos (los que más consulta soporte):
//   SESION_INVALIDA, CAMBIO_CLAVE_REQUERIDO, DEMASIADOS_INTENTOS, SIN_PERMISO, PLAN_NO_INCLUYE,
//   LICENCIA_VENCIDA, CAJA_NO_ABIERTA, STOCK_INSUFICIENTE, PRECIOS_CAMBIARON, DESCUENTO_EXCEDIDO,
//   CREDITO_INSUFICIENTE, MODO_DIRECTO, MODO_PEDIDOS, ENVIO_SIN_REPARTIDOR
// El resto se arma con el área y el tipo: CAJA_CONFLICTO, SUCURSAL_DATOS_INVALIDOS, ENVIO_NO_ENCONTRADO…

const CODE_BY_STATUS = {
  400: 'DATOS_INVALIDOS',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  413: 'SOLICITUD_MUY_GRANDE',
  429: 'DEMASIADOS_INTENTOS',
};

export const codeForStatus = (status) => CODE_BY_STATUS[status] ?? (status >= 500 ? 'ERROR_INTERNO' : 'SOLICITUD_INVALIDA');

// Base de los errores de negocio. Cada área la extiende y declara su prefijo en `static area`.
export class AppError extends Error {
  constructor(message, status = 400, codigo = null, extra = null) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    const area = new.target.area;
    this.codigo = codigo || (area ? `${area}_${codeForStatus(status)}` : codeForStatus(status));
    this.extra = extra;
  }
}

// Cuerpo de respuesta de un error de negocio (el requestId lo agrega errorEnvelope).
export const errorBody = (error) => ({ error: error.message, codigo: error.codigo, ...error.extra });

// Garantiza la forma de toda respuesta de error, también la de rutas que arman la suya a mano:
// si falta el código se pone el del estado HTTP, y siempre va el identificador de la petición.
export function errorEnvelope(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && 'error' in body) {
      body = { ...body, codigo: body.codigo || codeForStatus(res.statusCode), requestId: req.id };
    }
    return json(body);
  };
  next();
}

// Último manejador de Express: errores que ninguna ruta atendió.
export function finalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) return res.status(err.status).json(errorBody(err));
  // Errores del propio cliente (JSON mal formado, cuerpo demasiado grande): no son fallas del servidor.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Solicitud inválida.', codigo: codeForStatus(err.status) });
  }
  console.error(`Error no capturado en ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Error interno del servidor.', codigo: 'ERROR_INTERNO' });
}
