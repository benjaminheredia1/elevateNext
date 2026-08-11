import { NextRequest } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { balanceGeneral } from '@/lib/server/finanzas/contabilidad.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { excelResponse, montoExcel } from '@/lib/server/export/excel';

interface FilaBalance {
  seccion: string;
  subseccion: string;
  concepto: string;
  monto: number;
}

/**
 * Balance General en Excel: una fila por concepto, con la sección y subsección
 * en columnas para que se pueda filtrar y armar tablas dinámicas.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const balance = await balanceGeneral(alcanceSucursal(session, parseSucursal(searchParams)));

    // El QR sale de restar: `cuentas_financieras` es el total de las cuentas y
    // `caja_efectivo` la parte en efectivo.
    const cajaQr = montoExcel(balance.activos.cuentas_financieras - balance.activos.caja_efectivo);
    const totalCorriente = montoExcel(
      balance.activos.cuentas_financieras + balance.activos.cuentas_por_cobrar,
    );
    const totalNoCorriente = montoExcel(balance.activos.inventario + balance.activos.activos_fijos);

    const filas: FilaBalance[] = [
      { seccion: 'ACTIVOS', subseccion: 'Activo Corriente', concepto: 'Caja Efectivo', monto: montoExcel(balance.activos.caja_efectivo) },
      { seccion: 'ACTIVOS', subseccion: 'Activo Corriente', concepto: 'Caja QR', monto: cajaQr },
      { seccion: 'ACTIVOS', subseccion: 'Activo Corriente', concepto: 'Cuentas por Cobrar', monto: montoExcel(balance.activos.cuentas_por_cobrar) },
      { seccion: 'ACTIVOS', subseccion: 'Activo Corriente', concepto: '= Total Corriente', monto: totalCorriente },
      { seccion: 'ACTIVOS', subseccion: 'Activo No Corriente', concepto: 'Inventario valorizado', monto: montoExcel(balance.activos.inventario) },
      { seccion: 'ACTIVOS', subseccion: 'Activo No Corriente', concepto: 'Activos Fijos', monto: montoExcel(balance.activos.activos_fijos) },
      { seccion: 'ACTIVOS', subseccion: 'Activo No Corriente', concepto: '= Total No Corriente', monto: totalNoCorriente },
      { seccion: 'ACTIVOS', subseccion: '', concepto: '= TOTAL ACTIVOS', monto: montoExcel(balance.activos.total) },
      { seccion: 'PASIVOS', subseccion: 'Pasivo Corriente', concepto: 'Cuentas por Pagar', monto: montoExcel(balance.pasivos.cuentas_por_pagar) },
      { seccion: 'PASIVOS', subseccion: '', concepto: '= TOTAL PASIVOS', monto: montoExcel(balance.pasivos.total) },
      // El capital inicial no se lleva en el sistema: todo el patrimonio que hay
      // se generó operando, así que va entero como utilidades retenidas.
      { seccion: 'PATRIMONIO', subseccion: '', concepto: 'Capital inicial', monto: 0 },
      { seccion: 'PATRIMONIO', subseccion: '', concepto: 'Utilidades retenidas', monto: montoExcel(balance.patrimonio) },
      { seccion: 'PATRIMONIO', subseccion: '', concepto: '= PATRIMONIO NETO', monto: montoExcel(balance.patrimonio) },
    ];

    return await excelResponse('balance', 'Balance General', [
      { header: 'Sección', ancho: 16, valor: f => f.seccion },
      { header: 'Subsección', ancho: 22, valor: f => f.subseccion },
      { header: 'Concepto', ancho: 26, valor: f => f.concepto },
      { header: 'Monto_Bs', ancho: 14, tipo: 'numero', valor: f => f.monto },
    ], filas);
  } catch (e) { return handleApiError(e); }
}
