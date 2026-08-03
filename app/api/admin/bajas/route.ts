import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    // Las bajas son del local: con una sucursal elegida se ven las suyas, no
    // las del negocio. Sin sucursal (dueño en consolidado) se ve todo.
    const sucursal = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));

    const [productos, insumos] = await Promise.all([
      prisma.producto.findMany({
        where: sucursal
          ? { sucursales: { some: { sucursal_id: sucursal, fecha_baja: { not: null } } } }
          : { estado_publicacion: 'BAJA' },
        orderBy: { fecha_baja: 'desc' },
        ...(sucursal ? { include: { sucursales: { where: { sucursal_id: sucursal } } } } : {}),
      }),
      prisma.insumo.findMany({
        where: sucursal
          ? { stocks: { some: { sucursal_id: sucursal, activo: false } } }
          : { activo: false },
        orderBy: { fecha_baja: 'desc' },
        ...(sucursal ? { include: { stocks: { where: { sucursal_id: sucursal } } } } : {}),
      }),
    ]);

    if (!sucursal) return NextResponse.json({ data: { productos, insumos } });

    // Se devuelven el motivo y la fecha DEL LOCAL, que son los que explican por
    // qué ese insumo o ese producto salieron de esa sucursal.
    return NextResponse.json({
      data: {
        productos: productos.map((p) => {
          const { sucursales, ...resto } = p as typeof p & { sucursales: { motivo_baja: string | null; fecha_baja: Date | null }[] };
          return { ...resto, motivo_baja: sucursales[0]?.motivo_baja ?? p.motivo_baja, fecha_baja: sucursales[0]?.fecha_baja ?? p.fecha_baja, sucursal_id: sucursal };
        }),
        insumos: insumos.map((i) => {
          const { stocks, ...resto } = i as typeof i & { stocks: { motivo_baja: string | null; fecha_baja: Date | null }[] };
          return { ...resto, activo: false, motivo_baja: stocks[0]?.motivo_baja ?? i.motivo_baja, fecha_baja: stocks[0]?.fecha_baja ?? i.fecha_baja, sucursal_id: sucursal };
        }),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
