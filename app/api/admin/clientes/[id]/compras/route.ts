import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Todas las compras de un cliente: pagadas, fiadas y cortesías.
 *
 * Las tres formas viven en `Transaccion`, pero solo la pagada deja movimiento
 * de caja; por eso una lista armada desde los movimientos dejaría afuera
 * justamente las que más importa revisar cuando se mira a un cliente.
 *
 * Un ADMIN ve las de su sucursal; el dueño, las de todos los locales, que es lo
 * que permite ver al cliente completo aunque reparta sus compras.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const clienteId = Number((await params).id);
    if (!Number.isInteger(clienteId) || clienteId <= 0) throw new ValidationError('Id de cliente inválido');

    const sucursalId = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nombre: true, telefono: true, email: true, nit: true, direccion: true },
    });
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const compras = await prisma.transaccion.findMany({
      where: { cliente_id: clienteId, ...(sucursalId ? { sucursal_id: sucursalId } : {}) },
      orderBy: { created_at: 'desc' },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        cuenta_corriente: { select: { monto: true, monto_pagado: true, estado: true, vencimiento: true } },
        transaccionesDetalles_id: {
          include: {
            producto: { select: { id: true, nombre: true } },
            combo: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    const items = compras.map(c => {
      const pendiente = c.payment_status === 'PENDIENTE' || c.payment_status === 'COD_PENDIENTE';
      const deuda = c.cuenta_corriente;
      return {
        id: c.id,
        numero_sucursal: c.numero_sucursal,
        created_at: c.created_at,
        canal: c.canal,
        sucursal: c.sucursal?.nombre ?? null,
        total: Number(c.total),
        metodo_pago: c.metodo_pago,
        estado: c.estado,
        payment_status: c.payment_status,
        // Cómo se cerró: es lo que la pantalla usa para agrupar y filtrar.
        forma: c.es_cortesia ? 'CORTESIA' : pendiente ? 'FIADO' : 'PAGADA',
        descuento: c.codigo_descuento,
        deuda: deuda
          ? {
              saldo: Number(deuda.monto) - Number(deuda.monto_pagado),
              estado: deuda.estado,
              vencimiento: deuda.vencimiento,
            }
          : null,
        items: c.transaccionesDetalles_id.map(d => ({
          producto_id: d.producto_id,
          nombre: d.producto.nombre,
          cantidad: d.cantidad,
          precio_unitario: Number(d.precio_unitario),
          combo: d.combo ? { id: d.combo.id, nombre: d.combo.nombre } : null,
        })),
      };
    });

    // Las canceladas no cuentan como gasto: se listan, pero no suman.
    const validas = items.filter(i => i.estado !== 'CANCELADO');
    const porForma = (forma: string) => validas.filter(i => i.forma === forma);

    return NextResponse.json({
      cliente,
      items,
      resumen: {
        compras: validas.length,
        // Lo efectivamente cobrado, que no es lo mismo que lo consumido: el
        // fiado todavía se debe y la cortesía no se cobró nunca.
        pagado: Number(porForma('PAGADA').reduce((s, i) => s + i.total, 0).toFixed(2)),
        fiado: Number(porForma('FIADO').reduce((s, i) => s + i.total, 0).toFixed(2)),
        cortesias: Number(porForma('CORTESIA').reduce((s, i) => s + i.total, 0).toFixed(2)),
        deuda_pendiente: Number(
          validas.reduce((s, i) => s + (i.deuda?.saldo ?? 0), 0).toFixed(2),
        ),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
