import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { estadoInsumo } from '@/lib/server/inventario/inventario.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    // Insumos bajo umbral, evaluados POR LOCAL: el faltante es de una sucursal
    // concreta, no del total del negocio.
    const sucursal = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));
    const filas = await prisma.stockSucursal.findMany({
      where: { insumo: { activo: true }, ...(sucursal ? { sucursal_id: sucursal } : {}) },
      include: { insumo: true, sucursal: { select: { id: true, nombre: true } } },
      orderBy: { stock_actual: 'asc' },
    });

    const bajoUmbral = filas
      .map((f) => ({
        ...f.insumo,
        stock_actual: f.stock_actual,
        stock_minimo: f.stock_minimo,
        punto_critico: f.punto_critico,
        costo_promedio: f.costo_promedio,
        sucursal_id: f.sucursal.id,
        sucursal: f.sucursal.nombre,
        estado: estadoInsumo({
          stock_actual: f.stock_actual,
          stock_minimo: f.stock_minimo,
          punto_critico: f.punto_critico,
        }),
      }))
      .filter((i) => i.estado !== 'ok');

    // Historial de alertas (últimas 50)
    const historial = await prisma.registroAlerta.findMany({
      orderBy: { enviado_at: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      data: {
        insumos_bajo_umbral: bajoUmbral,
        historial,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
