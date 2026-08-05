import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, STAFF } from '@/lib/server/auth/guard';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

/**
 * Alertas de stock por sucursal. Antes se evaluaban sobre el total del negocio,
 * y un local en cero quedaba tapado por el stock del otro: ahora cada fila es
 * un insumo EN UN LOCAL, que es donde el faltante realmente duele.
 *
 * El cajero solo ve las de su sucursal; el admin ve todas salvo que filtre.
 */
export async function GET(req: NextRequest) {
  const auth = await guard(req, STAFF);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const sucursal = alcanceSucursal(auth, parseSucursal(searchParams));

    const filas = await prisma.stockSucursal.findMany({
      where: {
        // El insumo dado de baja EN ESE LOCAL no genera alertas ahí: dejó de
        // usarse. En las demás sucursales sigue alertando normalmente.
        activo: true,
        ...(sucursal ? { sucursal_id: sucursal } : {}),
      },
      include: {
        insumo: true,
        sucursal: { select: { id: true, nombre: true } },
      },
      orderBy: { insumo: { nombre: 'asc' } },
    });

    // Se conserva la forma del insumo y se le agregan el stock del local y su
    // sucursal, para no romper a quien ya consume este endpoint.
    const items = filas.map(f => ({
      ...f.insumo,
      stock_actual: f.stock_actual,
      stock_minimo: f.stock_minimo,
      punto_critico: f.punto_critico,
      costo_promedio: f.costo_promedio,
      sucursal_id: f.sucursal.id,
      sucursal: f.sucursal.nombre,
    }));

    const criticos = items.filter(i => i.stock_actual <= i.stock_minimo);
    const advertencia = items.filter(
      i => i.stock_actual > i.stock_minimo && i.stock_actual <= i.stock_minimo * 1.5
    );
    const ok = items.filter(i => i.stock_actual > i.stock_minimo * 1.5);

    return NextResponse.json({
      data: {
        criticos,
        advertencia,
        ok,
        total_alertas: criticos.length + advertencia.length,
        resumen: items.map(i => ({
          ...i,
          nivel: i.stock_actual <= i.stock_minimo
            ? 'critico'
            : i.stock_actual <= i.stock_minimo * 1.5
              ? 'advertencia'
              : 'ok',
          porcentaje: i.stock_minimo > 0
            ? Math.min(100, Math.round((i.stock_actual / (i.stock_minimo * 2)) * 100))
            : (i.stock_actual > 0 ? 100 : 0),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/alertas error:', error);
    return NextResponse.json({ error: 'Error al obtener alertas' }, { status: 500 });
  }
}
