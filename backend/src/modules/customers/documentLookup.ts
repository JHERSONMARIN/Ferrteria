// Datos de un DNI o RUC para registrar un cliente: primero en la base; si no está, en apis.net.pe.
// Si el servicio externo falla, se avisa en el registro y se devuelve una sugerencia para completar a mano.
import type { prisma } from '../../db.ts';
import { CustomerError } from './customers.ts';

type Client = typeof prisma;

const SERVICE = 'https://api.apis.net.pe/v1';

async function externalName(kind: 'dni' | 'ruc', doc: string): Promise<{ name: string; address: string } | null> {
  try {
    const response = await fetch(`${SERVICE}/${kind}?numero=${doc}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      console.warn(`[consulta-doc] ${kind.toUpperCase()} ${doc}: el servicio respondió ${response.status}.`);
      return null;
    }
    const data = await response.json() as { nombre?: string; direccion?: string };
    return data?.nombre ? { name: data.nombre, address: data.direccion || '' } : null;
  } catch (error) {
    console.warn(`[consulta-doc] ${kind.toUpperCase()} ${doc}: no se pudo consultar el servicio.`, error);
    return null;
  }
}

export async function lookupDocument(client: Client, rawDoc: string) {
  const doc = rawDoc.trim();
  const local = await client.cliente.findUnique({
    where: { doc },
    select: { type: true, doc: true, name: true, phone: true, email: true, address: true },
  });
  if (local) return { foundInDb: true, client: local };

  if (!/^\d{8}$|^\d{11}$/.test(doc)) throw new CustomerError('Documento no válido (debe tener 8 u 11 dígitos).', 404);
  const isCompany = doc.length === 11;
  const found = await externalName(isCompany ? 'ruc' : 'dni', doc);
  return {
    foundInDb: false,
    client: {
      type: isCompany ? 'EMPRESA' : 'NATURAL',
      doc,
      name: found?.name ?? (isCompany ? `EMPRESA RUC ${doc}` : `Persona DNI ${doc}`),
      address: found?.address ?? '',
    },
  };
}
