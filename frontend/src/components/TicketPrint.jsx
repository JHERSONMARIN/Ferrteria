import React from 'react';

export default function TicketPrint({ data }) {
  if (!data) return <div id="ticket-impresion" className="hidden print:block font-mono text-black"></div>;

  const {
    businessName = 'FERRESYS S.A.C.',
    businessRuc = '20123456789',
    businessAddress = 'Av. Las Flores 123, Cajamarca',
    docTitle = 'NOTA DE VENTA',
    numDoc = 'T001-000001',
    dateStr = new Date().toLocaleString(),
    customerName = 'Público General',
    customerDoc = '00000000',
    docLabelTitle = 'DNI',
    sellerName = 'General',
    payMethod = 'Efectivo',
    items = [],
    total = 0,
    isFiscal = false,
  } = data;

  const subtotal = total / 1.18;
  const igv = total - subtotal;

  // SUNAT QR Code Trama Oficial
  const parts = numDoc.split('-');
  const serie = parts[0] || 'B001';
  const numero = parts[1] || '000001';
  const tipoDocCod = docTitle.includes('FACTURA') ? '01' : '03';
  const tipoDocClienteCod = docLabelTitle === 'RUC' ? '6' : '1';

  const qrData = `${businessRuc}|${tipoDocCod}|${serie}|${numero}|${igv.toFixed(2)}|${total.toFixed(2)}|${dateStr}|${tipoDocClienteCod}|${customerDoc}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrData)}`;

  return (
    <div id="ticket-impresion" className="hidden print:block font-mono text-black">
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <h2 style={{ fontWeight: 'bold', fontSize: '16px' }}>{businessName}</h2>
        <p>RUC: {businessRuc}</p>
        <p>{businessAddress}</p>
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', margin: '10px 0', padding: '5px 0' }}>
          <h3 style={{ fontWeight: 'bold', fontSize: '14px' }}>{docTitle}</h3>
          <h3 style={{ fontWeight: 'bold', fontSize: '14px' }}>{numDoc}</h3>
        </div>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <p><strong>Fecha:</strong> {dateStr}</p>
        <p><strong>Cliente:</strong> {customerName}</p>
        <p><strong>{docLabelTitle}:</strong> {customerDoc}</p>
        <p><strong>Vendedor:</strong> {sellerName}</p>
        <p><strong>Condición:</strong> {payMethod}</p>
      </div>
      <table style={{ width: '100%', textAlign: 'left', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', marginBottom: '10px' }}>
        <thead>
          <tr><th>Cant</th><th>Desc</th><th style={{ textAlign: 'right' }}>P.U.</th><th style={{ textAlign: 'right' }}>Total</th></tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: '2px 0' }}>{item.qty}</td>
              <td style={{ padding: '2px 0' }}>{item.name ? item.name.substring(0, 15) : ''}</td>
              <td style={{ padding: '2px 0', textAlign: 'right' }}>{Number(item.price).toFixed(2)}</td>
              <td style={{ padding: '2px 0', textAlign: 'right' }}>{(item.qty * item.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginBottom: '15px' }}>
        {isFiscal && (
          <>
            <p>OP. GRAVADAS: S/ {subtotal.toFixed(2)}</p>
            <p>IGV (18%): S/ {igv.toFixed(2)}</p>
          </>
        )}
        <h3 style={{ fontWeight: 'bold', fontSize: '16px', marginTop: '5px' }}>TOTAL: S/ {Number(total).toFixed(2)}</h3>
      </div>
      <div style={{ textAlign: 'center', fontSize: '10px' }}>
        {isFiscal && (
          <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src={qrUrl} alt="SUNAT QR" style={{ width: '100px', height: '100px', margin: '0 auto 4px auto' }} />
            <p>Representación impresa de la {docTitle}</p>
          </div>
        )}
        <p>¡Gracias por su preferencia!</p>
      </div>
    </div>
  );
}
