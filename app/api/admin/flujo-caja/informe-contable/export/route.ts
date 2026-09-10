import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { informeContable } from '@/lib/server/finanzas/informe-contable.service';
import type { LineaInforme, TurnoInforme, DiaInforme } from '@/lib/server/finanzas/informe-contable.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal, parseRango } from '@/lib/server/finanzas/rango';
import {
  excelMultiHojaResponse, prepararHoja, fechaExcel, montoExcel,
  type ColumnaExcel,
} from '@/lib/server/export/excel';

/** Formatos de Excel: la celda sigue siendo un número, solo cambia cómo se ve. */
const BS = '#,##0.00';
const PCT = '0%';

/**
 * Hoja 1 — el detalle por producto, con los nombres de columna que contabilidad
 * ya usa en su planilla. Se respetan tal cual (en mayúsculas) a propósito: es el
 * archivo que reemplaza al suyo y tiene que resultarle familiar.
 */
const COLUMNAS_LINEAS: ColumnaExcel<LineaInforme>[] = [
  { header: 'MES', ancho: 6, tipo: 'numero', valor: l => l.mes },
  { header: 'FECHA', ancho: 12, valor: l => fechaExcel(l.fecha) },
  { header: 'N° VENTA', ancho: 10, tipo: 'numero', valor: l => l.numero_sucursal ?? l.venta_id },
  { header: 'PRODUCTO', ancho: 40, valor: l => l.producto },
  { header: 'CANTIDAD', ancho: 10, tipo: 'numero', valor: l => l.cantidad },
  { header: 'VALOR TOTAL', ancho: 14, tipo: 'numero', formato: BS, valor: l => montoExcel(l.valor_total) },
  { header: 'COSTO', ancho: 12, tipo: 'numero', formato: BS, valor: l => montoExcel(l.costo) },
  { header: 'GANANCIA', ancho: 12, tipo: 'numero', formato: BS, valor: l => montoExcel(l.ganancia) },
  { header: 'DCTOS', ancho: 9, tipo: 'numero', formato: PCT, valor: l => l.dctos },
  { header: 'VALOR DE VENTA', ancho: 16, tipo: 'numero', formato: BS, valor: l => montoExcel(l.valor_de_venta) },
  { header: 'GANANCIA REAL', ancho: 15, tipo: 'numero', formato: BS, valor: l => montoExcel(l.ganancia_real) },
  { header: 'OBSERVACIONES', ancho: 30, valor: l => l.observaciones },
];

/**
 * Hoja 2 — los turnos, con la plata abierta en componentes.
 *
 * "Ventas" y "Esperado en caja" son columnas distintas a propósito: confundirlas
 * es de donde salía el descuadre. Entre las dos están, explícitas, las tres
 * cosas que las separan.
 */
const COLUMNAS_TURNOS: ColumnaExcel<TurnoInforme>[] = [
  { header: 'FECHA', ancho: 12, valor: t => fechaExcel(t.fecha) },
  { header: 'TURNO', ancho: 8, tipo: 'numero', valor: t => t.turno_id },
  { header: 'CAJERO', ancho: 24, valor: t => t.cajero },
  { header: 'VENTAS EFECTIVO', ancho: 16, tipo: 'numero', formato: BS, valor: t => montoExcel(t.ventas_efectivo) },
  { header: 'VENTAS QR', ancho: 14, tipo: 'numero', formato: BS, valor: t => montoExcel(t.ventas_qr) },
  { header: 'VENTAS TOTAL', ancho: 14, tipo: 'numero', formato: BS, valor: t => montoExcel(t.ventas_total) },
  { header: '(+) COBROS DE FIADO', ancho: 19, tipo: 'numero', formato: BS, valor: t => montoExcel(t.cobros_fiado) },
  { header: '(+) OTROS INGRESOS', ancho: 19, tipo: 'numero', formato: BS, valor: t => montoExcel(t.otros_ingresos) },
  { header: '(-) EGRESOS', ancho: 14, tipo: 'numero', formato: BS, valor: t => montoExcel(t.egresos) },
  { header: '(=) ESPERADO EN CAJA', ancho: 20, tipo: 'numero', formato: BS, valor: t => montoExcel(t.esperado) },
  { header: 'CONTADO', ancho: 13, tipo: 'numero', formato: BS, valor: t => (t.contado == null ? null : montoExcel(t.contado)) },
  { header: 'DIFERENCIA', ancho: 13, tipo: 'numero', formato: BS, valor: t => (t.diferencia == null ? null : montoExcel(t.diferencia)) },
];

/**
 * Hoja 3 — la conciliación. Es la que cierra el descuadre: cada columna es un
 * término de la ecuación, en el orden en que se leen.
 */
const COLUMNAS_DIAS: ColumnaExcel<DiaInforme>[] = [
  { header: 'FECHA', ancho: 12, valor: d => d.fecha },
  { header: 'VENTAS DEL DÍA', ancho: 16, tipo: 'numero', formato: BS, valor: d => montoExcel(d.ventas_devengadas) },
  { header: '(-) FIADOS OTORGADOS', ancho: 21, tipo: 'numero', formato: BS, valor: d => montoExcel(d.fiados_otorgados) },
  { header: '(+) COBROS DE FIADO', ancho: 19, tipo: 'numero', formato: BS, valor: d => montoExcel(d.cobros_fiado) },
  { header: '(+) OTROS INGRESOS', ancho: 19, tipo: 'numero', formato: BS, valor: d => montoExcel(d.otros_ingresos) },
  { header: '(-) EGRESOS', ancho: 14, tipo: 'numero', formato: BS, valor: d => montoExcel(d.egresos) },
  { header: '(=) MOV. NETO DE CAJA', ancho: 21, tipo: 'numero', formato: BS, valor: d => montoExcel(d.movimiento_neto_caja) },
  { header: 'CORTESÍAS Bs', ancho: 14, tipo: 'numero', formato: BS, valor: d => montoExcel(d.cortesias) },
  { header: 'COSTO CORTESÍAS Bs', ancho: 19, tipo: 'numero', formato: BS, valor: d => montoExcel(d.costo_cortesias) },
];

/**
 * Informe contable de ventas: el archivo que reemplaza la planilla que
 * contabilidad armaba a mano.
 *
 * Tres hojas, porque son tres preguntas distintas: qué se vendió (devengado),
 * qué plata pasó por cada turno (percibido) y por qué esos dos números no son
 * el mismo (conciliación). Ver `informe-contable.service.ts`.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const informe = await informeContable(
      await parseRango(searchParams),
      alcanceSucursal(session, parseSucursal(searchParams)),
    );

    return await excelMultiHojaResponse('informe-contable', [
      prepararHoja('Ventas por producto', COLUMNAS_LINEAS, informe.lineas),
      prepararHoja('Ingresos por turno', COLUMNAS_TURNOS, informe.turnos),
      prepararHoja('Conciliación diaria', COLUMNAS_DIAS, informe.dias),
    ]);
  } catch (e) { return handleApiError(e); }
}
