import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { estadoInsumo } from '@/lib/server/inventario/inventario.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    // Insumos bajo umbral
    const insumos = await prisma.insumo.findMany({
      orderBy: { stock_actual: 'asc' },
    });

    const bajoUmbral = insumos
      .map((i) => ({
        ...i,
        estado: estadoInsumo({
          stock_actual: i.stock_actual,
          stock_minimo: i.stock_minimo,
          punto_critico: i.punto_critico,
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
