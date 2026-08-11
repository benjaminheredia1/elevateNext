import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { flujoCaja } from '@/lib/server/finanzas/flujo.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal, parseRango } from '@/lib/server/finanzas/rango';
import { excelResponse, fechaExcel, montoExcel } from '@/lib/server/export/excel';

/**
 * Flujo de caja en Excel: una fila por movimiento, con el monto abierto en
 * efectivo y QR. Sin ese desglose el archivo no sirve para cuadrar el arqueo,
 * que es justo para lo que se descarga.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const { movimientos } = await flujoCaja(
      await parseRango(searchParams),
      alcanceSucursal(session, parseSucursal(searchParams)),
    );

    return await excelResponse('flujo', 'Flujo de Caja', [
      { header: 'Fecha', ancho: 14, valor: m => fechaExcel(m.created_at) },
      { header: 'Concepto', ancho: 30, valor: m => m.concepto },
      // Sin categoría se cae al tipo de movimiento, que es lo que muestra la
      // pantalla: una fila sin nada en esa columna no se podría agrupar.
      { header: 'Categoría', ancho: 18, valor: m => m.categoria ?? m.tipo },
      {
        header: 'Efectivo_Bs', ancho: 14, tipo: 'numero',
        valor: m => (m.metodo_pago === 'EFECTIVO' ? montoExcel(m.monto) : 0),
      },
      {
        header: 'QR_Bs', ancho: 12, tipo: 'numero',
        valor: m => (m.metodo_pago === 'QR' ? montoExcel(m.monto) : 0),
      },
      { header: 'Total_Bs', ancho: 12, tipo: 'numero', valor: m => montoExcel(m.monto) },
      // El signo del monto es lo que manda: los egresos se guardan en negativo.
      { header: 'Tipo', ancho: 10, valor: m => (m.monto < 0 ? 'Salida' : 'Entrada') },
    ], movimientos);
  } catch (e) { return handleApiError(e); }
}
