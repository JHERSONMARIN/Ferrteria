import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    // Total ingresos en caja (Ventas completadas que no son FIADO)
    const ingresosResult = await prisma.venta.aggregate({
      _sum: { total: true },
      where: {
        payMethod: { not: 'FIADO' },
        status: 'COMPLETADO'
      }
    });

    // Total créditos por cobrar (Fiado total acumulado en crédito)
    const creditosResult = await prisma.creditoCliente.aggregate({
      _sum: { debtTotal: true }
    });

    // Total ventas realizadas
    const salesCount = await prisma.venta.count();

    // Eficiencia por vendedor
    const vendedores = await prisma.usuario.findMany({
      where: {
        role: { in: ['VENDEDOR', 'ADMINISTRADOR', 'REPARTIDOR'] },
        active: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
        ventasAsignadas: {
          select: { total: true }
        },
        entregasAsignadas: {
          select: { status: true }
        }
      }
    });

    const vendedorStats = vendedores.map(v => {
      const totalVendido = v.ventasAsignadas.reduce((acc, curr) => acc + curr.total, 0);
      const entregasCount = v.entregasAsignadas.length;
      const entregasCompletadas = v.entregasAsignadas.filter(e => e.status === 'ENTREGADO').length;

      return {
        id: v.id,
        name: v.name,
        role: v.role,
        ventasCount: v.ventasAsignadas.length,
        totalVendido,
        entregasAsignadas: entregasCount,
        entregasCompletadas,
      };
    });

    // Últimas ventas
    const recentSales = await prisma.venta.findMany({
      take: 7,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        docType: true,
        numDoc: true,
        payMethod: true,
        total: true,
        createdAt: true,
        cliente: { select: { name: true } },
        vendedor: { select: { name: true } }
      }
    });

    const formattedRecentSales = recentSales.map(s => ({
      doc: s.numDoc,
      customer: s.cliente ? s.cliente.name : 'Público General',
      seller: s.vendedor ? s.vendedor.name : 'General',
      method: s.payMethod,
      total: s.total,
    }));

    res.json({
      ingresosCaja: ingresosResult._sum.total || 0,
      deudaCreditos: creditosResult._sum.debtTotal || 0,
      salesCount,
      vendedores: vendedorStats,
      recentSales: formattedRecentSales,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener datos de dashboard.' });
  }
});

export default router;
