// Tiempo transcurrido, como se lee en las colas de caja y despacho.
export function minutesAgo(date: string | null) {
  if (!date) return '';
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const formatHour = (date: string | null) =>
  (date ? new Date(date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '');
