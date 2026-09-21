// Dirección de una empresa vista desde donde se abrió la consola: si VALETEC entra por la red
// (192.168.x.x o un dominio), sus enlaces deben apuntar ahí y no a 127.0.0.1, que para quien mira
// desde otro equipo es su propia máquina.
export const urlEmpresa = (empresa) => (empresa?.port
  ? `${window.location.protocol}//${window.location.hostname}:${empresa.port}`
  : empresa?.url || null);
