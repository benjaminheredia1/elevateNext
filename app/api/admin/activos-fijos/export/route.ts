import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarActivosFijos } from '@/lib/server/admin/activos.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { excelResponse, fechaExcel, montoExcel } from '@/lib/server/export/excel';

const METODO_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', QR: 'QR', TARJETA: 'Tarjeta', BANCO: 'Banco' };

/** Descarga de los activos fijos en Excel, respetando el filtro de sucursal. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const sucursal = alcanceSucursal(session, parseSucursal(searchParams));
    const { items } = await listarActivosFijos(searchParams.get('inactivos') === '1', sucursal);

    return await excelResponse('activos', 'Activos Fijos', [
      { header: 'Activo', ancho: 28, valor: a => a.nombre },
      { header: 'Categoría', ancho: 16, valor: a => a.categoria },
      // El valor de compra, no el depreciado: es lo que se pagó por el bien.
      { header: 'Valor Bs', ancho: 12, tipo: 'numero', valor: a => montoExcel(a.valor_original) },
      { header: 'Pago', ancho: 12, valor: a => METODO_LABEL[a.metodo_pago] ?? a.metodo_pago },
      { header: 'Fecha compra', ancho: 14, valor: a => fechaExcel(a.fecha_compra) },
      { header: 'Notas', ancho: 34, valor: a => a.notas ?? '' },
    ], items);
  } catch (e) { return handleApiError(e); }
}
