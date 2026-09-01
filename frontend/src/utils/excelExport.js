/**
 * Exportador Nativo a Excel (.csv / UTF-8 BOM)
 * Genera archivos compatibles con Microsoft Excel sin librerías externas pesadas.
 */
export function exportToExcel(data, fileName = 'Reporte') {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return alert('No hay datos disponibles para exportar.');
  }

  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Encabezados
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

  // Filas de datos
  data.forEach(row => {
    const values = headers.map(header => {
      const val = row[header] === null || row[header] === undefined ? '' : row[header];
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  });

  const csvString = '\uFEFF' + csvRows.join('\n'); // UTF-8 BOM para compatibilidad con Excel
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
