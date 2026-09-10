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
    const { movimientos, pedidos_sin_cobro } = await flujoCaja(
      await parseRango(searchParams),
      alcanceSucursal(session, parseSucursal(searchParams)),
    );

    /**
     * Una fila del archivo. Fiados y cortesías se intercalan como filas
     * informativas en Bs 0 —su monto va en `pendiente`— para que el total de la
     * columna Total_Bs siga siendo la plata que realmente se movió, y a la vez
     * se vea qué quedó por cobrar y qué se regaló ese día.
     */
    interface FilaFlujo {
      created_at: Date;
      concepto: string;
      categoria: string;
      efectivo: number;
      qr: number;
      total: number;
      pendiente: number;
      tipo: string;
    }

    const filas: FilaFlujo[] = [
      ...movimientos.map((m): FilaFlujo => ({
        created_at: m.created_at,
        concepto: m.concepto,
        // Sin categoría se cae al tipo de movimiento, que es lo que muestra la
        // pantalla: una fila sin nada en esa columna no se podría agrupar.
        categoria: m.categoria ?? m.tipo,
        efectivo: m.metodo_pago === 'EFECTIVO' ? montoExcel(m.monto) : 0,
        qr: m.metodo_pago === 'QR' ? montoExcel(m.monto) : 0,
        total: montoExcel(m.monto),
        pendiente: 0,
        // El signo del monto es lo que manda: los egresos se guardan en negativo.
        tipo: m.monto < 0 ? 'Salida' : 'Entrada',
      })),
      ...pedidos_sin_cobro.map((p): FilaFlujo => ({
        created_at: p.created_at,
        concepto: `${p.es_cortesia ? 'Cortesía' : 'Fiado'} #${p.numero_sucursal ?? p.id}`
          + (p.cliente ? ` · ${p.cliente}` : ''),
        categoria: p.es_cortesia ? 'Cortesía' : 'Fiado otorgado',
        efectivo: 0,
        qr: 0,
        total: 0,
        pendiente: montoExcel(p.monto),
        tipo: 'Sin cobro',
      })),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return await excelResponse('flujo', 'Flujo de Caja', [
      { header: 'Fecha', ancho: 14, valor: f => fechaExcel(f.created_at) },
      { header: 'Concepto', ancho: 30, valor: f => f.concepto },
      { header: 'Categoría', ancho: 18, valor: f => f.categoria },
      { header: 'Efectivo_Bs', ancho: 14, tipo: 'numero', valor: f => f.efectivo },
      { header: 'QR_Bs', ancho: 12, tipo: 'numero', valor: f => f.qr },
      { header: 'Total_Bs', ancho: 12, tipo: 'numero', valor: f => f.total },
      // Fiado por cobrar o cortesía entregada: no es plata que se movió, por eso
      // va en su propia columna y no en Total_Bs.
      { header: 'Sin_cobrar_Bs', ancho: 14, tipo: 'numero', valor: f => f.pendiente },
      { header: 'Tipo', ancho: 10, valor: f => f.tipo },
    ], filas);
  } catch (e) { return handleApiError(e); }
}
