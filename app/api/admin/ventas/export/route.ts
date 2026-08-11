import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal, parseRango } from '@/lib/server/finanzas/rango';
import { excelResponse, fechaExcel, montoExcel } from '@/lib/server/export/excel';

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', QR: 'QR', TARJETA: 'Tarjeta', BANCO: 'Banco', MIXTO: 'Mixto',
};

/**
 * Ventas del período en Excel, con su detalle de productos.
 *
 * `payment_status` va aparte del estado del pedido a propósito: un fiado se
 * entrega pero todavía no se cobró, y en el archivo eso tiene que verse.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    // Sin `rango` no se filtra por fecha: la pantalla de pedidos muestra todo
    // el historial, y `parseRango` por su cuenta caeria a "mes", recortando en
    // silencio meses de ventas del archivo.
    const rango = searchParams.get('rango') ? await parseRango(searchParams) : null;
    const sucursal = alcanceSucursal(session, parseSucursal(searchParams));

    const ventas = await prisma.transaccion.findMany({
      where: {
        ...(rango ? { created_at: { gte: rango.desde, lte: rango.hasta } } : {}),
        // `undefined` es el dueño viendo todo el negocio. Un usuario sin sucursal
        // asignada llega acá con SIN_ALCANCE, un id que no existe: baja un
        // archivo vacío en vez de las ventas de todos los locales.
        ...(sucursal !== undefined ? { sucursal_id: sucursal } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        sucursal: { select: { nombre: true } },
        cliente: { select: { nombre: true } },
        transaccionesDetalles_id: {
          select: { cantidad: true, producto: { select: { nombre: true } } },
        },
      },
    });

    return await excelResponse('ventas', 'Ventas', [
      { header: 'Fecha', ancho: 14, valor: v => fechaExcel(v.created_at) },
      // El correlativo del local es el número que se le canta al cliente.
      { header: 'N°', ancho: 8, tipo: 'numero', valor: v => v.numero_sucursal ?? v.id },
      { header: 'Canal', ancho: 10, valor: v => v.canal },
      { header: 'Método', ancho: 12, valor: v => (v.metodo_pago ? METODO_LABEL[v.metodo_pago] ?? v.metodo_pago : '') },
      { header: 'Cliente', ancho: 24, valor: v => v.cliente?.nombre ?? v.cliente_nombre ?? 'Mostrador' },
      {
        header: 'Detalle', ancho: 40,
        valor: v => v.transaccionesDetalles_id
          .map(d => (d.cantidad > 1 ? `${d.producto?.nombre ?? 'Producto'} x${d.cantidad}` : d.producto?.nombre ?? 'Producto'))
          .join(', '),
      },
      { header: 'Total Bs', ancho: 12, tipo: 'numero', valor: v => montoExcel(v.total) },
      { header: 'Estado', ancho: 14, valor: v => v.estado },
      { header: 'Pago', ancho: 14, valor: v => v.payment_status },
      { header: 'Sucursal', ancho: 22, valor: v => v.sucursal.nombre },
    ], ventas);
  } catch (e) { return handleApiError(e); }
}
