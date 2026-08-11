import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { inventarioDeSucursal } from '@/lib/server/inventario/stock-sucursal.service';
import { alcanceSucursal, SIN_ALCANCE, sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { excelResponse, montoExcel } from '@/lib/server/export/excel';

const ESTADO: Record<string, string> = { critico: 'Crítico', bajo: 'Bajo', ok: 'OK' };

/**
 * Descarga del inventario de insumos de UNA sucursal.
 *
 * No hay versión consolidada a propósito: sumar el stock de dos locales da un
 * número que no existe —nadie puede cocinar con la papa que está en el otro
 * barrio— y el costo promedio de cada uno es distinto.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);

    const alcance = alcanceSucursal(session, parseSucursal(searchParams));
    if (alcance === SIN_ALCANCE) throw new ValidationError('Tu usuario no tiene una sucursal asignada');
    const sucursalId = alcance ?? await sucursalPorDefectoId();

    const filas = await inventarioDeSucursal(sucursalId);

    return await excelResponse('inventario', 'Inventario', [
      { header: 'Insumo', ancho: 28, valor: i => i.nombre },
      { header: 'Unidad', ancho: 10, valor: i => i.unidad_medida },
      { header: 'Stock actual', ancho: 14, tipo: 'numero', valor: i => montoExcel(i.stock_actual) },
      { header: 'Stock mínimo', ancho: 14, tipo: 'numero', valor: i => montoExcel(i.stock_minimo) },
      { header: 'Costo unitario Bs', ancho: 18, tipo: 'numero', valor: i => i.costo_promedio },
      {
        header: 'Valor total Bs', ancho: 16, tipo: 'numero',
        valor: i => montoExcel(i.stock_actual * i.costo_promedio),
      },
      { header: 'Estado', ancho: 12, valor: i => ESTADO[i.nivel] ?? i.nivel },
    ], filas);
  } catch (e) { return handleApiError(e); }
}
