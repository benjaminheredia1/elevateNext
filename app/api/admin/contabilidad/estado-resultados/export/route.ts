import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { movimientosContables } from '@/lib/server/finanzas/contabilidad.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal, parseRango } from '@/lib/server/finanzas/rango';
import { excelResponse, fechaExcel, montoExcel } from '@/lib/server/export/excel';

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', QR: 'QR', TARJETA: 'Tarjeta', BANCO: 'Banco', MIXTO: 'Mixto',
};

/** Movimientos del período que respaldan el Estado de Resultados. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const filas = await movimientosContables(
      await parseRango(searchParams),
      alcanceSucursal(session, parseSucursal(searchParams)),
    );

    return await excelResponse('contabilidad-mes', 'Movimientos', [
      { header: 'Fecha', ancho: 14, valor: m => fechaExcel(m.fecha) },
      { header: 'Tipo', ancho: 10, valor: m => m.tipo },
      { header: 'Concepto', ancho: 30, valor: m => m.concepto },
      { header: 'Detalle', ancho: 40, valor: m => m.detalle },
      { header: 'Monto_Bs', ancho: 12, tipo: 'numero', valor: m => montoExcel(m.monto) },
      { header: 'Metodo', ancho: 12, valor: m => METODO_LABEL[m.metodo_pago] ?? m.metodo_pago },
    ], filas);
  } catch (e) { return handleApiError(e); }
}
